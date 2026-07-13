import type { Block, Doc, ElementType } from './types'

/** The AI's daily message allowance per user (guards against runaway cost). */
export const DAILY_MESSAGE_CAP = 100

/** How many prior turns of conversation to send as context. */
export const HISTORY_LIMIT = 20

// ── Insert-proposal protocol ─────────────────────────────────────────────────
// The model wraps any screenplay content it wants to add in an <insert>…</insert>
// block, one element per line as "TYPE: text". The client turns each block into
// an Accept/Dismiss card; Accept drops formatted blocks into the script.

const LABEL_TO_TYPE: Record<string, ElementType> = {
  SCENE_HEADING: 'scene-header',
  SCENE: 'scene-header',
  ACTION: 'action',
  CHARACTER: 'character',
  DIALOG: 'dialog',
  DIALOGUE: 'dialog',
  PARENTHETICAL: 'parenthetical',
  EXTENSION: 'extension',
  TRANSITION: 'transition',
  SHOT: 'shot',
}

export interface ParsedInsert {
  blocks: { type: ElementType; text: string }[]
}

export type ContentPart =
  | { type: 'prose'; text: string; insert?: undefined }
  | { type: 'insert'; text?: undefined; insert: ParsedInsert }

/** Split streamed assistant text into prose spans and insert proposals. */
export function parseAssistantContent(text: string): ContentPart[] {
  const parts: ContentPart[] = []
  const re = /<insert>([\s\S]*?)<\/insert>/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: 'prose', text: text.slice(last, m.index) })
    const blocks = parseInsertBody(m[1])
    if (blocks.length) parts.push({ type: 'insert', insert: { blocks } })
    last = re.lastIndex
  }
  if (last < text.length) parts.push({ type: 'prose', text: text.slice(last) })
  return parts
}

function parseInsertBody(body: string): { type: ElementType; text: string }[] {
  const blocks: { type: ElementType; text: string }[] = []
  for (const raw of body.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const colon = line.indexOf(':')
    if (colon === -1) continue
    const label = line.slice(0, colon).trim().toUpperCase().replace(/\s+/g, '_')
    const type = LABEL_TO_TYPE[label]
    if (!type) continue
    const text = line.slice(colon + 1).trim()
    if (text) blocks.push({ type, text })
  }
  return blocks
}

// ── Prompt assembly ──────────────────────────────────────────────────────────

function blocksToScript(blocks: Block[]): string {
  return blocks
    .filter(b => b.text.trim())
    .map(b => `[${b.type}] ${b.text}`)
    .join('\n')
}

/**
 * Build the system prompt: the co-writer persona plus the full contents of the
 * project's documents, so every answer is grounded in the user's actual work.
 */
export function buildSystemPrompt(projectName: string, documents: Doc[]): string {
  const screenplay = documents.find(d => d.kind === 'screenplay')
  const notes = documents.filter(d => d.kind === 'note')

  const parts: string[] = [
    `You are a screenwriting co-writer working alongside the writer on their screenplay "${projectName}". You are a collaborator, not a ghostwriter: the story, characters, and voice are theirs. Your job is to help them write faster and better while keeping everything grounded in what they have already written and what they are going for.`,
    ``,
    `How you help:`,
    `- Brainstorm ideas, break writer's block, and think through plot and character WITH the writer.`,
    `- Ground every suggestion in the actual script and notes below — reference their real characters, scenes, and setups, never generic ones.`,
    `- Draw on solid storytelling craft (structure, want vs. need, escalation, subtext) but apply it to THIS story, not as a lecture.`,
    `- Match the writer's tone and voice. Extend what's on the page; don't overwrite it. When you'd make a big creative swing, offer it as an option and explain the tradeoff.`,
    `- Be concise and practical. Lead with the useful part.`,
    ``,
    `Proposing script content:`,
    `- When you want to suggest actual screenplay lines for the writer to add (dialogue, an action beat, a scene heading, etc.), wrap them in an <insert>...</insert> block so the app can offer them as a one-click accept.`,
    `- Inside the block, put one element per line as "TYPE: text", where TYPE is one of: SCENE_HEADING, ACTION, CHARACTER, DIALOG, PARENTHETICAL, EXTENSION, TRANSITION, SHOT.`,
    `- Example:`,
    `<insert>`,
    `CHARACTER: MAYA`,
    `DIALOG: You said nine. It's almost noon.`,
    `</insert>`,
    `- Only use <insert> for content meant to go INTO the script. Keep discussion, analysis, and questions as normal prose. Never put your explanation inside an <insert> block.`,
    ``,
    `=== THE SCREENPLAY ===`,
    screenplay && screenplay.blocks && screenplay.blocks.length
      ? blocksToScript(screenplay.blocks)
      : '(The screenplay is empty so far.)',
  ]

  for (const note of notes) {
    parts.push(``, `=== NOTE: ${note.title} ===`, note.content?.trim() || '(empty)')
  }

  return parts.join('\n')
}
