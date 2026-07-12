import type { Block, ElementType } from './types'

// Industry-standard screenplay metrics: 12pt Courier, 6 lines/inch,
// US Letter. ~55 usable lines per page.
export const LINES_PER_PAGE = 55

// Max characters per line for each element (10 chars/inch in Courier 12pt)
export const CHARS_PER_LINE: Record<ElementType, number> = {
  'scene-header': 60,
  'action': 60,
  'character': 33,
  'dialog': 35,
  'parenthetical': 25,
  'extension': 33,
  'transition': 60,
  'shot': 60,
}

// Blank lines printed before each element type
export const BLANKS_BEFORE: Record<ElementType, number> = {
  'scene-header': 2,
  'action': 1,
  'character': 1,
  'dialog': 0,
  'parenthetical': 0,
  'extension': 0,
  'transition': 1,
  'shot': 1,
}

/** Word-wrap text to a max width (monospace column count) */
export function wrapText(text: string, width: number): string[] {
  const t = text.trim()
  if (!t) return ['']
  const words = t.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    if (line === '') {
      line = word
    } else if (line.length + 1 + word.length <= width) {
      line += ' ' + word
    } else {
      lines.push(line)
      line = word
    }
    // Hard-break single words longer than the column
    while (line.length > width) {
      lines.push(line.slice(0, width))
      line = line.slice(width)
    }
  }
  lines.push(line)
  return lines
}

export interface Pagination {
  totalPages: number
  /** block id → 1-based page the block starts on */
  pageOfBlock: Map<string, number>
  /** block ids that begin a new page (page 2+) */
  breakBefore: Set<string>
}

/** Compute page layout for a list of blocks (shared by editor + PDF export) */
export function paginate(blocks: Block[]): Pagination {
  const pageOfBlock = new Map<string, number>()
  const breakBefore = new Set<string>()
  let page = 1
  let line = 0 // lines used on current page

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]
    const lines = wrapText(b.text, CHARS_PER_LINE[b.type]).length
    const blanks = i === 0 || line === 0 ? 0 : BLANKS_BEFORE[b.type]
    let needed = blanks + lines

    // Keep a character name attached to at least 2 lines of what follows
    if (b.type === 'character') needed += 2

    if (line + needed > LINES_PER_PAGE && line > 0) {
      page++
      line = 0
      breakBefore.add(b.id)
      pageOfBlock.set(b.id, page)
      line += lines
    } else {
      pageOfBlock.set(b.id, page)
      line += blanks + lines
    }
  }

  return { totalPages: page, pageOfBlock, breakBefore }
}

/** Canonical character name: strip parenthetical extensions and (CONT'D) */
export function cleanCharacterName(text: string): string {
  return text.replace(/\([^)]*\)/g, '').trim().toUpperCase()
}

/** Unique character names in the script, for autocomplete */
export function characterNames(blocks: Block[], excludeId?: string): string[] {
  const names = new Set<string>()
  for (const b of blocks) {
    if (b.type !== 'character' || b.id === excludeId) continue
    const name = cleanCharacterName(b.text)
    if (name) names.add(name)
  }
  return [...names].sort()
}
