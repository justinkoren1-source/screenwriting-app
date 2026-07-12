import type { Block, ElementType } from './types'

// Lines to filter out (page artifacts from screenwriting apps)
const SKIP_PATTERNS = [/^\(MORE\)$/i, /^CONTINUED:?$/i, /^-\s*\d+\s*-$/]

function shouldSkip(text: string, x: number, pageWidth: number): boolean {
  const t = text.trim()
  if (!t) return true
  // Right-margin page numbers (e.g. "12." at far right)
  if (x > pageWidth * 0.75 && /^\d+\.?$/.test(t)) return true
  return SKIP_PATTERNS.some(p => p.test(t))
}

function detectType(
  text: string,
  x: number,
  pageWidth: number,
  prevType: ElementType | null,
): ElementType {
  const t = text.trim()
  const isAllCaps = t.length > 0 && t === t.toUpperCase() && /[A-Z]/.test(t)
  // x as fraction of page width (0 = left edge, 1 = right edge)
  const xRatio = x / pageWidth

  // Scene Heading: always starts with INT. / EXT. / INT./EXT. etc.
  if (/^(INT|EXT|INT\/EXT|EXT\/INT)[\.\s]/i.test(t)) return 'scene-header'

  // Transition: all-caps, ends in "TO:" or known fade patterns
  if (
    isAllCaps &&
    (t.endsWith('TO:') ||
      t === 'FADE OUT.' ||
      t === 'FADE IN.' ||
      t === 'THE END' ||
      /^FADE\s+(OUT|IN|TO)[\s.:]/.test(t) ||
      xRatio > 0.55) // right-aligned all-caps = transition, not character
  )
    return 'transition'

  // Parenthetical: text wrapped in parens, following character/dialog
  if (
    /^\(.*\)$/.test(t) &&
    prevType != null &&
    ['character', 'parenthetical', 'dialog'].includes(prevType)
  )
    return 'parenthetical'

  // Dialog: continues after character / parenthetical / prior dialog,
  // but only if the line sits at the dialog indent (~29%). Lines back at
  // the left action margin mean the dialog ended.
  if (
    prevType === 'character' ||
    prevType === 'parenthetical' ||
    prevType === 'dialog'
  ) {
    if (xRatio >= 0.24 && (!isAllCaps || xRatio < 0.38)) return 'dialog'
  }

  // Character: all-caps, indented past ~33% of page (scene headings sit at ~18%)
  if (isAllCaps && xRatio > 0.33 && t.length < 52) return 'character'

  // Shot: all-caps, at action margin (< 22% from left), short
  if (isAllCaps && xRatio < 0.22 && t.length < 50 && !t.includes(' - '))
    return 'shot'

  return 'action'
}

export async function parsePdfToBlocks(file: File): Promise<Block[]> {
  // Dynamic import keeps pdfjs out of the server bundle
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

  const data = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data }).promise

  interface RawLine {
    text: string
    x: number
    normY: number // top-of-doc = 0, increases downward
  }

  const rawLines: RawLine[] = []
  let pageWidth = 612 // standard US Letter in points

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const vp = page.getViewport({ scale: 1 })
    pageWidth = vp.width

    const tc = await page.getTextContent()

    // Bucket items by y-coordinate (quantize to 2pt grid to handle sub-pixel offsets)
    const yMap = new Map<number, { str: string; x: number; w: number }[]>()
    for (const item of tc.items) {
      if (!('str' in item) || !item.str.trim()) continue
      const it = item as { str: string; transform: number[]; width: number }
      const yKey = Math.round(it.transform[5] / 2) * 2
      const bucket = yMap.get(yKey) ?? []
      bucket.push({ str: it.str, x: it.transform[4], w: it.width })
      yMap.set(yKey, bucket)
    }

    for (const [yKey, items] of yMap) {
      items.sort((a, b) => a.x - b.x)
      // Join items, inserting a space when there's a visible gap between them
      // (PDFs often store each word as a separate item without literal spaces)
      let text = ''
      let prevEnd = -1
      for (const i of items) {
        if (prevEnd >= 0 && i.x - prevEnd > 1 && !text.endsWith(' ')) text += ' '
        text += i.str
        prevEnd = i.x + i.w
      }
      text = text.trim()
      if (!text || shouldSkip(text, items[0].x, pageWidth)) continue
      // Normalize y: page 1 starts at 0, each subsequent page adds 100,000
      rawLines.push({
        text,
        x: items[0].x,
        normY: (p - 1) * 100_000 + (vp.height - yKey),
      })
    }
  }

  rawLines.sort((a, b) => a.normY - b.normY)

  const blocks: Block[] = []
  let prevType: ElementType | null = null
  let prevNormY = -1

  for (const line of rawLines) {
    // Strip "(CONT'D)" from character names added by some apps at page breaks
    const t = line.text.replace(/\s*\(CONT'D\)\s*/gi, '').trim()
    if (!t) continue

    const yGap = prevNormY >= 0 ? line.normY - prevNormY : 999
    const type = detectType(t, line.x, pageWidth, prevType)

    const last = blocks[blocks.length - 1]
    // Merge wrapped lines into the same block: same type + gap ≤ ~1.3× line height (≈16pt)
    if (
      last &&
      last.type === type &&
      yGap <= 16 &&
      (type === 'dialog' || type === 'action')
    ) {
      last.text += ' ' + t
    } else {
      blocks.push({ id: crypto.randomUUID(), type, text: t })
    }

    prevType = type
    prevNormY = line.normY
  }

  return blocks.filter(b => b.text.trim().length > 0)
}

/** Turn a filename like "the_dark_knight.pdf" into "The Dark Knight" */
export function titleFromFilename(filename: string): string {
  return filename
    .replace(/\.pdf$/i, '')
    .replace(/[_\-]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim() || 'Untitled Script'
}
