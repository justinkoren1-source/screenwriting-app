export type ElementType =
  | 'scene-header'
  | 'action'
  | 'character'
  | 'dialog'
  | 'parenthetical'
  | 'extension'
  | 'transition'
  | 'shot'

export interface Block {
  id: string
  type: ElementType
  text: string
}

export type DocKind = 'screenplay' | 'note'

export interface Doc {
  id: string
  projectId: string
  kind: DocKind
  title: string
  /** Screenplay content (kind === 'screenplay') */
  blocks?: Block[]
  /** Plain-text content (kind === 'note') */
  content?: string
  /** Episode identity (screenplay docs only; null = standalone screenplay) */
  season?: number
  episodeNumber?: number
  createdAt: string
  updatedAt: string
}

/** True when a screenplay doc is a numbered episode. */
export function isEpisode(d: Doc): boolean {
  return d.kind === 'screenplay' && d.episodeNumber != null
}

/** "S1 · E3" style label for an episode. */
export function episodeCode(d: Doc): string {
  if (d.episodeNumber == null) return ''
  const s = d.season ?? 1
  return `S${s} · E${d.episodeNumber}`
}

/** The writer's up-front intent for a project — grounds the co-writer. */
export interface Brief {
  logline?: string
  format?: string
  tone?: string
  protagonist?: string
  conflict?: string
  theme?: string
  comps?: string
}

/** True when a brief has at least one answered field. */
export function briefHasContent(b: Brief | undefined): boolean {
  return !!b && Object.values(b).some(v => typeof v === 'string' && v.trim() !== '')
}

export interface Project {
  id: string
  name: string
  /** Title-page fields for PDF export */
  author?: string
  contact?: string
  /** The writer's story brief (optional, feeds the co-writer) */
  brief?: Brief
  createdAt: string
  updatedAt: string
  /** Populated by getProject (document metadata) and guest-mode storage */
  documents?: Doc[]
}
