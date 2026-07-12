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
  createdAt: string
  updatedAt: string
}

export interface Project {
  id: string
  name: string
  /** Title-page fields for PDF export */
  author?: string
  contact?: string
  createdAt: string
  updatedAt: string
  /** Populated by getProject (document metadata) and guest-mode storage */
  documents?: Doc[]
}
