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

export interface Project {
  id: string
  name: string
  blocks: Block[]
  createdAt: string
  updatedAt: string
  /** Title-page fields for PDF export */
  author?: string
  contact?: string
}
