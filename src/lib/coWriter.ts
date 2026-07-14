import type { Block, Brief, Doc, ElementType } from './types'

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

/** One proposed change to an existing numbered line. */
export interface EditOp {
  line: number
  type?: ElementType
  text?: string
  remove?: boolean
}
export interface ParsedEdits {
  ops: EditOp[]
}

export type ContentPart =
  | { type: 'prose'; text: string }
  | { type: 'insert'; insert: ParsedInsert }
  | { type: 'edits'; edits: ParsedEdits }

/** Split streamed assistant text into prose, insert proposals, and edit proposals. */
export function parseAssistantContent(text: string): ContentPart[] {
  const parts: ContentPart[] = []
  const re = /<(insert|edits)>([\s\S]*?)<\/\1>/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: 'prose', text: text.slice(last, m.index) })
    if (m[1] === 'insert') {
      const blocks = parseInsertBody(m[2])
      if (blocks.length) parts.push({ type: 'insert', insert: { blocks } })
    } else {
      const ops = parseEditsBody(m[2])
      if (ops.length) parts.push({ type: 'edits', edits: { ops } })
    }
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

function parseEditsBody(body: string): EditOp[] {
  const ops: EditOp[] = []
  for (const raw of body.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const del = line.match(/^DELETE\s+(\d+)/i)
    if (del) {
      ops.push({ line: Number(del[1]), remove: true })
      continue
    }
    // EDIT <n> | <TYPE or -> | <new full text>
    const ed = line.match(/^EDIT\s+(\d+)\s*\|\s*([^|]*)\|\s*([\s\S]*)$/i)
    if (ed) {
      const n = Number(ed[1])
      const label = ed[2].trim().toUpperCase().replace(/\s+/g, '_')
      const type = label && label !== '-' ? LABEL_TO_TYPE[label] : undefined
      const text = ed[3].trim()
      if (n > 0 && (text || type)) ops.push({ line: n, type, text: text || undefined })
    }
  }
  return ops
}

// ── Prompt assembly ──────────────────────────────────────────────────────────

// Number every line by its 1-based position in the full block array so the
// model can target exact lines for edits (numbers match the editor's indices).
function blocksToScript(blocks: Block[]): string {
  return blocks
    .map((b, i) => ({ n: i + 1, b }))
    .filter(x => x.b.text.trim())
    .map(x => `[${x.n}] (${x.b.type}) ${x.b.text}`)
    .join('\n')
}

/**
 * Build the system prompt: the co-writer persona plus the full contents of the
 * project's documents, so every answer is grounded in the user's actual work.
 */
const BRIEF_FIELDS: { key: keyof Brief; label: string }[] = [
  { key: 'logline', label: 'Logline' },
  { key: 'format', label: 'Format & length' },
  { key: 'tone', label: 'Genre & tone' },
  { key: 'protagonist', label: 'Protagonist (want vs. need)' },
  { key: 'conflict', label: 'Central conflict' },
  { key: 'theme', label: 'What it\'s really about' },
  { key: 'comps', label: 'In the vein of' },
]

function briefToText(brief: Brief): string {
  const lines = BRIEF_FIELDS
    .filter(f => (brief[f.key] ?? '').trim())
    .map(f => `${f.label}: ${brief[f.key]!.trim()}`)
  return lines.join('\n')
}

export function buildSystemPrompt(opts: {
  projectName: string
  brief?: Brief
  screenplay?: Doc
  notes: Doc[]
  otherEpisodes?: Doc[]
}): string {
  const { projectName, brief, screenplay, notes, otherEpisodes = [] } = opts
  const briefText = brief ? briefToText(brief) : ''
  const episode = screenplay && screenplay.episodeNumber != null
  const epCode = episode ? `S${screenplay.season ?? 1} · E${screenplay.episodeNumber}` : ''
  const openLabel = episode
    ? `episode "${epCode} — ${screenplay!.title}" of the series "${projectName}"`
    : `screenplay "${projectName}"`

  const parts: string[] = [
    `You are a screenwriting co-writer working alongside the writer on their ${openLabel}. You are a collaborator, not a ghostwriter: the story, characters, and voice are theirs. Your job is to help them write faster and better while keeping everything grounded in what they have already written and what they are going for.`,
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
    `- Only use <insert> for BRAND-NEW content added to the end of the script. Keep discussion, analysis, and questions as normal prose. Never put your explanation inside an <insert> block.`,
    ``,
    `Fixing or changing EXISTING lines (typos, punctuation, a misspelled character name, the wrong element type, standardizing a scene heading, or removing a line):`,
    `- The script below is numbered [1], [2], [3]… Use those numbers to target the exact lines.`,
    `- Emit an <edits> block, one operation per line:`,
    `  · Change a line:  EDIT <number> | <TYPE or -> | <the corrected full line>   (TYPE = one of the element types above, or "-" to keep the line's current type)`,
    `  · Remove a line:  DELETE <number>`,
    `- Example:`,
    `<edits>`,
    `EDIT 3 | - | CLAIRE`,
    `EDIT 12 | action | Claire sits for an interview, arms crossed.`,
    `DELETE 40`,
    `</edits>`,
    `- Put ONLY the lines you are actually changing inside <edits>. NEVER reprint the whole script, and never paste a corrected version into the chat as prose — the writer approves your <edits> and the app applies them in place.`,
    `- Use <edits> to change existing lines; use <insert> only to add new lines at the end.`,
    ``,
    ...(briefText
      ? [
          `=== THE ${episode ? 'SERIES' : 'WRITER’S'} BRIEF (their stated intent — treat this as the source of truth for what the story is trying to be; keep your help aligned with it) ===`,
          briefText,
          ``,
        ]
      : []),
    ...(otherEpisodes.length
      ? [
          `=== OTHER EPISODES IN THIS SERIES (titles only, for continuity — you do NOT have their full scripts here; ask the writer if you need details from another episode) ===`,
          otherEpisodes
            .map(e =>
              e.episodeNumber != null
                ? `S${e.season ?? 1} · E${e.episodeNumber} — ${e.title}`
                : e.title,
            )
            .join('\n'),
          ``,
        ]
      : []),
    `=== ${episode ? `THIS EPISODE (${epCode} — ${screenplay!.title})` : 'THE SCREENPLAY'} — this is what you are helping write right now ===`,
    screenplay && screenplay.blocks && screenplay.blocks.length
      ? blocksToScript(screenplay.blocks)
      : '(Empty so far.)',
  ]

  for (const note of notes) {
    parts.push(``, `=== NOTE: ${note.title} ===`, note.content?.trim() || '(empty)')
  }

  return parts.join('\n')
}
