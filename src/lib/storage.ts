import { supabase } from './supabase'
import type { Project } from './types'

const KEY = 'sw_projects'

// ── Local (guest mode) ───────────────────────────────────────────────────────

function loadLocal(): Project[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]')
  } catch {
    return []
  }
}

function persistLocal(projects: Project[]): void {
  localStorage.setItem(KEY, JSON.stringify(projects))
}

// ── Cloud row mapping ────────────────────────────────────────────────────────

interface ScriptRow {
  id: string
  user_id: string
  name: string
  blocks: Project['blocks']
  author: string | null
  contact: string | null
  created_at: string
  updated_at: string
}

function rowToProject(r: ScriptRow): Project {
  return {
    id: r.id,
    name: r.name,
    blocks: r.blocks,
    author: r.author ?? undefined,
    contact: r.contact ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function projectToRow(p: Project, userId: string) {
  return {
    id: p.id,
    user_id: userId,
    name: p.name,
    blocks: p.blocks,
    author: p.author ?? null,
    contact: p.contact ?? null,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  }
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

// ── Public API (cloud when signed in, localStorage otherwise) ────────────────

/**
 * List projects for the home screen. Cloud rows come back WITHOUT their
 * blocks (metadata only) to keep the payload small — use getProject(id)
 * for the full script.
 */
export async function getProjects(): Promise<Project[]> {
  const uid = await currentUserId()
  if (!uid) return loadLocal()
  const { data, error } = await supabase
    .from('scripts')
    .select('id, name, author, contact, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return (data as Omit<ScriptRow, 'blocks' | 'user_id'>[]).map(r =>
    rowToProject({ ...r, blocks: [], user_id: '' } as ScriptRow)
  )
}

export async function getProject(id: string): Promise<Project | null> {
  const uid = await currentUserId()
  if (!uid) return loadLocal().find(p => p.id === id) ?? null
  const { data, error } = await supabase
    .from('scripts')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data ? rowToProject(data as ScriptRow) : null
}

export async function saveProject(project: Project): Promise<void> {
  const uid = await currentUserId()
  if (!uid) {
    const all = loadLocal()
    const idx = all.findIndex(p => p.id === project.id)
    if (idx >= 0) all[idx] = project
    else all.push(project)
    persistLocal(all)
    return
  }
  const { error } = await supabase.from('scripts').upsert(projectToRow(project, uid))
  if (error) throw error
}

export async function createProject(name: string): Promise<Project> {
  const project: Project = {
    id: crypto.randomUUID(),
    name,
    blocks: [{ id: crypto.randomUUID(), type: 'scene-header', text: '' }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  await saveProject(project)
  return project
}

export async function deleteProject(id: string): Promise<void> {
  const uid = await currentUserId()
  if (!uid) {
    persistLocal(loadLocal().filter(p => p.id !== id))
    return
  }
  const { error } = await supabase.from('scripts').delete().eq('id', id)
  if (error) throw error
}

/**
 * One-time migration after sign-in: move any guest (localStorage) scripts
 * to the user's cloud account, then clear local copies.
 * Returns how many scripts were migrated.
 */
export async function migrateLocalToCloud(): Promise<number> {
  const uid = await currentUserId()
  if (!uid) return 0
  const local = loadLocal()
  if (local.length === 0) return 0
  const rows = local.map(p => projectToRow(p, uid))
  const { error } = await supabase.from('scripts').upsert(rows)
  if (error) throw error
  localStorage.removeItem(KEY)
  return local.length
}
