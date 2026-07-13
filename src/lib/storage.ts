import { supabase } from './supabase'
import type { Block, Doc, DocKind, Project } from './types'

const KEY = 'sw_projects'

// ── Local (guest mode) ───────────────────────────────────────────────────────

/** Old guest shape (pre-folders): a project held its blocks directly */
interface LegacyLocalProject extends Omit<Project, 'documents'> {
  blocks?: Block[]
}

function loadLocal(): Project[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as LegacyLocalProject[]
    let migrated = false
    const projects = raw.map(p => {
      if (!p.blocks) return p as Project
      // Migrate legacy shape: blocks move into a screenplay document
      migrated = true
      const { blocks, ...meta } = p
      return {
        ...meta,
        documents: [{
          id: crypto.randomUUID(),
          projectId: p.id,
          kind: 'screenplay' as DocKind,
          title: 'Screenplay',
          blocks,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        }],
      }
    })
    if (migrated) persistLocal(projects)
    return projects
  } catch {
    return []
  }
}

function persistLocal(projects: Project[]): void {
  localStorage.setItem(KEY, JSON.stringify(projects))
}

// ── Cloud row mapping ────────────────────────────────────────────────────────

interface ProjectRow {
  id: string
  name: string
  author: string | null
  contact: string | null
  brief: Project['brief'] | null
  created_at: string
  updated_at: string
}

interface DocRow {
  id: string
  project_id: string
  kind: DocKind
  title: string
  blocks: Block[] | null
  content: string | null
  season: number | null
  episode_number: number | null
  created_at: string
  updated_at: string
}

function rowToProject(r: ProjectRow): Project {
  return {
    id: r.id,
    name: r.name,
    author: r.author ?? undefined,
    contact: r.contact ?? undefined,
    brief: r.brief ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function rowToDoc(r: DocRow): Doc {
  return {
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
  }
}

function docToRow(d: Doc, userId: string) {
  return {
    id: d.id,
    project_id: d.projectId,
    user_id: userId,
    kind: d.kind,
    title: d.title,
    blocks: d.blocks ?? null,
    content: d.content ?? null,
    season: d.season ?? null,
    episode_number: d.episodeNumber ?? null,
    created_at: d.createdAt,
    updated_at: d.updatedAt,
  }
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

// ── Projects ─────────────────────────────────────────────────────────────────

export async function getProjects(): Promise<Project[]> {
  const uid = await currentUserId()
  if (!uid) return loadLocal()
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, author, contact, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return (data as ProjectRow[]).map(rowToProject)
}

/** Project metadata plus its documents (doc metadata only — no contents) */
export async function getProject(id: string): Promise<Project | null> {
  const uid = await currentUserId()
  if (!uid) {
    const p = loadLocal().find(p => p.id === id)
    if (!p) return null
    // Strip contents from the doc list, matching cloud behavior
    return {
      ...p,
      documents: (p.documents ?? []).map(d => ({ ...d, blocks: undefined, content: undefined })),
    }
  }
  const [projectRes, docsRes] = await Promise.all([
    supabase.from('projects').select('id, name, author, contact, brief, created_at, updated_at').eq('id', id).maybeSingle(),
    supabase.from('documents').select('id, project_id, kind, title, season, episode_number, created_at, updated_at').eq('project_id', id).order('created_at'),
  ])
  if (projectRes.error) throw projectRes.error
  if (docsRes.error) throw docsRes.error
  if (!projectRes.data) return null
  const project = rowToProject(projectRes.data as ProjectRow)
  project.documents = (docsRes.data as DocRow[]).map(r => rowToDoc({ ...r, blocks: null, content: null }))
  return project
}

/** Create a project folder with its screenplay document. */
export async function createProject(name: string): Promise<{ project: Project; screenplayId: string }> {
  const now = new Date().toISOString()
  const project: Project = { id: crypto.randomUUID(), name, createdAt: now, updatedAt: now }
  const screenplay: Doc = {
    id: crypto.randomUUID(),
    projectId: project.id,
    kind: 'screenplay',
    title: 'Screenplay',
    blocks: [{ id: crypto.randomUUID(), type: 'scene-header', text: '' }],
    createdAt: now,
    updatedAt: now,
  }
  const uid = await currentUserId()
  if (!uid) {
    const all = loadLocal()
    all.push({ ...project, documents: [screenplay] })
    persistLocal(all)
  } else {
    const { error: pErr } = await supabase.from('projects').insert({
      id: project.id, user_id: uid, name, created_at: now, updated_at: now,
    })
    if (pErr) throw pErr
    const { error: dErr } = await supabase.from('documents').insert(docToRow(screenplay, uid))
    if (dErr) throw dErr
  }
  return { project, screenplayId: screenplay.id }
}

export async function saveProjectMeta(project: Project): Promise<void> {
  const uid = await currentUserId()
  if (!uid) {
    const all = loadLocal()
    const idx = all.findIndex(p => p.id === project.id)
    if (idx >= 0) all[idx] = { ...all[idx], name: project.name, author: project.author, contact: project.contact, brief: project.brief, updatedAt: project.updatedAt }
    persistLocal(all)
    return
  }
  const { error } = await supabase
    .from('projects')
    .update({
      name: project.name,
      author: project.author ?? null,
      contact: project.contact ?? null,
      brief: project.brief ?? null,
      updated_at: project.updatedAt,
    })
    .eq('id', project.id)
  if (error) throw error
}

export async function deleteProject(id: string): Promise<void> {
  const uid = await currentUserId()
  if (!uid) {
    persistLocal(loadLocal().filter(p => p.id !== id))
    return
  }
  // documents cascade via FK
  const { error } = await supabase.from('projects').delete().eq('id', id)
  if (error) throw error
}

// ── Documents ────────────────────────────────────────────────────────────────

export async function getDocument(id: string): Promise<Doc | null> {
  const uid = await currentUserId()
  if (!uid) {
    for (const p of loadLocal()) {
      const d = (p.documents ?? []).find(d => d.id === id)
      if (d) return d
    }
    return null
  }
  const { data, error } = await supabase.from('documents').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data ? rowToDoc(data as DocRow) : null
}

export async function saveDocument(doc: Doc): Promise<void> {
  const uid = await currentUserId()
  if (!uid) {
    const all = loadLocal()
    const p = all.find(p => p.id === doc.projectId)
    if (!p) return
    p.documents = p.documents ?? []
    const idx = p.documents.findIndex(d => d.id === doc.id)
    if (idx >= 0) p.documents[idx] = doc
    else p.documents.push(doc)
    p.updatedAt = doc.updatedAt
    persistLocal(all)
    return
  }
  const { error } = await supabase.from('documents').upsert(docToRow(doc, uid))
  if (error) throw error
}

export async function createDocument(
  projectId: string,
  kind: DocKind,
  title: string,
  meta?: { season?: number; episodeNumber?: number },
): Promise<Doc> {
  const now = new Date().toISOString()
  const doc: Doc = {
    id: crypto.randomUUID(),
    projectId,
    kind,
    title,
    blocks: kind === 'screenplay' ? [{ id: crypto.randomUUID(), type: 'scene-header', text: '' }] : undefined,
    content: kind === 'note' ? '' : undefined,
    season: meta?.season,
    episodeNumber: meta?.episodeNumber,
    createdAt: now,
    updatedAt: now,
  }
  await saveDocument(doc)
  return doc
}

export async function deleteDocument(id: string): Promise<void> {
  const uid = await currentUserId()
  if (!uid) {
    const all = loadLocal()
    for (const p of all) {
      p.documents = (p.documents ?? []).filter(d => d.id !== id)
    }
    persistLocal(all)
    return
  }
  const { error } = await supabase.from('documents').delete().eq('id', id)
  if (error) throw error
}

// ── Chat (co-writer) ─────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/** Load saved co-writer conversation for a project (cloud only). */
export async function getChatMessages(projectId: string): Promise<ChatMessage[]> {
  const uid = await currentUserId()
  if (!uid) return []
  const { data, error } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('project_id', projectId)
    .order('created_at')
  if (error) throw error
  return (data ?? []) as ChatMessage[]
}

// ── Guest → cloud migration ──────────────────────────────────────────────────

/**
 * One-time migration after sign-in: move any guest (localStorage) projects
 * and their documents to the user's cloud account, then clear local copies.
 */
export async function migrateLocalToCloud(): Promise<number> {
  const uid = await currentUserId()
  if (!uid) return 0
  const local = loadLocal()
  if (local.length === 0) return 0

  const projectRows = local.map(p => ({
    id: p.id,
    user_id: uid,
    name: p.name,
    author: p.author ?? null,
    contact: p.contact ?? null,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  }))
  const { error: pErr } = await supabase.from('projects').upsert(projectRows)
  if (pErr) throw pErr

  const docRows = local.flatMap(p => (p.documents ?? []).map(d => docToRow(d, uid)))
  if (docRows.length > 0) {
    const { error: dErr } = await supabase.from('documents').upsert(docRows)
    if (dErr) throw dErr
  }

  localStorage.removeItem(KEY)
  return local.length
}
