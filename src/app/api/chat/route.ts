import Anthropic from '@anthropic-ai/sdk'
import { supabaseForToken } from '@/lib/supabaseServer'
import { buildSystemPrompt, DAILY_MESSAGE_CAP, HISTORY_LIMIT } from '@/lib/coWriter'
import type { Doc } from '@/lib/types'

export const runtime = 'nodejs'
export const maxDuration = 60

interface DocRow {
  id: string
  project_id: string
  kind: 'screenplay' | 'note'
  title: string
  blocks: Doc['blocks'] | null
  content: string | null
  season: number | null
  episode_number: number | null
  created_at: string
  updated_at: string
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return json({ error: 'The AI co-writer is not configured yet (missing API key).' }, 503)
  }

  // ── Authenticate the user via their Supabase access token ─────────────────
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return json({ error: 'Not signed in.' }, 401)

  const supa = supabaseForToken(token)
  const { data: userData, error: userErr } = await supa.auth.getUser()
  if (userErr || !userData.user) return json({ error: 'Not signed in.' }, 401)
  const userId = userData.user.id

  // ── Validate input ────────────────────────────────────────────────────────
  let payload: { projectId?: string; docId?: string; message?: string }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Bad request.' }, 400)
  }
  const projectId = typeof payload.projectId === 'string' ? payload.projectId : ''
  const docId = typeof payload.docId === 'string' ? payload.docId : ''
  const message = typeof payload.message === 'string' ? payload.message.trim() : ''
  if (!projectId || !message) return json({ error: 'Missing project or message.' }, 400)
  if (message.length > 4000) return json({ error: 'Message is too long.' }, 400)

  // ── Enforce the per-user daily cap ────────────────────────────────────────
  const dayStart = new Date()
  dayStart.setHours(0, 0, 0, 0)
  const { count, error: countErr } = await supa
    .from('chat_messages')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'user')
    .gte('created_at', dayStart.toISOString())
  if (countErr) return json({ error: 'Could not check usage.' }, 500)
  if ((count ?? 0) >= DAILY_MESSAGE_CAP) {
    return json(
      { error: `Daily AI limit reached (${DAILY_MESSAGE_CAP} messages). It resets tomorrow.` },
      429,
    )
  }

  // ── Load the project's documents (RLS ensures they belong to this user) ───
  const { data: project, error: projErr } = await supa
    .from('projects')
    .select('id, name, brief')
    .eq('id', projectId)
    .maybeSingle()
  if (projErr || !project) return json({ error: 'Project not found.' }, 404)

  const toDoc = (r: DocRow): Doc => ({
    id: r.id,
    projectId: r.project_id,
    kind: r.kind,
    title: r.title,
    blocks: r.blocks ?? undefined,
    content: r.content ?? undefined,
    season: r.season ?? undefined,
    episodeNumber: r.episode_number ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  })

  // The open screenplay/episode (with full blocks); notes and sibling episode
  // titles are shared series context, but other episodes' full scripts are not
  // loaded (keeps context small and cheap across a whole season).
  const [screenplayRes, noteRes, otherRes] = await Promise.all([
    docId
      ? supa.from('documents').select('*').eq('id', docId).eq('project_id', projectId).maybeSingle()
      : supa.from('documents').select('*').eq('project_id', projectId).eq('kind', 'screenplay').order('created_at').limit(1).maybeSingle(),
    supa.from('documents').select('id, project_id, kind, title, content, season, episode_number, created_at, updated_at').eq('project_id', projectId).eq('kind', 'note').order('created_at'),
    supa.from('documents').select('id, project_id, kind, title, season, episode_number, created_at, updated_at').eq('project_id', projectId).eq('kind', 'screenplay').order('season').order('episode_number'),
  ])
  if (screenplayRes.error || noteRes.error || otherRes.error) {
    return json({ error: 'Could not load documents.' }, 500)
  }

  const screenplay = screenplayRes.data ? toDoc(screenplayRes.data as DocRow) : undefined
  const notes = (noteRes.data as DocRow[]).map(r => toDoc({ ...r, blocks: null }))
  const otherEpisodes = (otherRes.data as DocRow[])
    .filter(r => r.id !== screenplay?.id)
    .map(r => toDoc({ ...r, blocks: null, content: null }))

  // ── Load recent conversation history ──────────────────────────────────────
  const { data: history } = await supa
    .from('chat_messages')
    .select('role, content')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT)

  const priorMessages = (history ?? [])
    .reverse()
    .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

  // Persist the user's message before calling the model
  await supa.from('chat_messages').insert({
    project_id: projectId,
    user_id: userId,
    role: 'user',
    content: message,
  })

  const systemPrompt = buildSystemPrompt({
    projectName: project.name,
    brief: project.brief ?? undefined,
    screenplay,
    notes,
    otherEpisodes,
  })
  const anthropic = new Anthropic()

  // ── Stream the reply, then persist it ─────────────────────────────────────
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      let full = ''
      try {
        const claude = anthropic.messages.stream({
          model: 'claude-sonnet-5',
          max_tokens: 4000,
          thinking: { type: 'disabled' },
          system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
          messages: [...priorMessages, { role: 'user', content: message }],
        })
        for await (const event of claude) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            full += event.delta.text
            controller.enqueue(encoder.encode(event.delta.text))
          }
        }
      } catch (err) {
        console.error('Claude stream error:', err)
        if (!full) controller.enqueue(encoder.encode('Sorry — the co-writer hit an error. Please try again.'))
      } finally {
        if (full) {
          await supa.from('chat_messages').insert({
            project_id: projectId,
            user_id: userId,
            role: 'assistant',
            content: full,
          })
        }
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
