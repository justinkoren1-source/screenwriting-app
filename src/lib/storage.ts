import type { Project } from './types'

const KEY = 'sw_projects'

function load(): Project[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]')
  } catch {
    return []
  }
}

function persist(projects: Project[]): void {
  localStorage.setItem(KEY, JSON.stringify(projects))
}

export function getProjects(): Project[] {
  return load()
}

export function getProject(id: string): Project | null {
  return load().find(p => p.id === id) ?? null
}

export function saveProject(project: Project): void {
  const all = load()
  const idx = all.findIndex(p => p.id === project.id)
  if (idx >= 0) all[idx] = project
  else all.push(project)
  persist(all)
}

export function createProject(name: string): Project {
  const project: Project = {
    id: crypto.randomUUID(),
    name,
    blocks: [{ id: crypto.randomUUID(), type: 'scene-header', text: '' }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  const all = load()
  all.push(project)
  persist(all)
  return project
}

export function deleteProject(id: string): void {
  persist(load().filter(p => p.id !== id))
}
