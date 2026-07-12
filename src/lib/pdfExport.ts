import type { Block, ElementType, Project } from './types'
import { wrapText, CHARS_PER_LINE, BLANKS_BEFORE, LINES_PER_PAGE } from './screenplay'

// US Letter in points
const PAGE_W = 612
const PAGE_H = 792
const FONT_SIZE = 12
const LINE_H = 12 // 6 lines per inch
const TOP_MARGIN = 72
const RIGHT_EDGE = 540 // 1in right margin

// Left x-position per element (points from page edge)
const X_POS: Record<ElementType, number> = {
  'scene-header': 108,
  'action': 108,
  'character': 266,
  'dialog': 180,
  'parenthetical': 216,
  'extension': 266,
  'transition': RIGHT_EDGE, // right-aligned
  'shot': 108,
}

const UPPERCASE: Record<ElementType, boolean> = {
  'scene-header': true,
  'action': false,
  'character': true,
  'dialog': false,
  'parenthetical': false,
  'extension': true,
  'transition': true,
  'shot': true,
}

export async function exportPdf(project: Project): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  doc.setFont('courier', 'normal')
  doc.setFontSize(FONT_SIZE)

  // ── Title page ─────────────────────────────────────────────────────────
  const title = project.name.toUpperCase()
  const centerX = PAGE_W / 2
  doc.text(title, centerX, 280, { align: 'center' })
  // Underline the title
  const titleW = doc.getTextWidth(title)
  doc.line(centerX - titleW / 2, 284, centerX + titleW / 2, 284)
  doc.text('Written by', centerX, 340, { align: 'center' })
  doc.text(project.author || '', centerX, 376, { align: 'center' })
  if (project.contact) {
    const contactLines = project.contact.split('\n')
    contactLines.forEach((l, i) => doc.text(l, 72, 684 + i * LINE_H))
  }

  // ── Script pages ───────────────────────────────────────────────────────
  doc.addPage()
  let pageNum = 1 // title page is unnumbered; first script page = 1
  let line = 0

  const newPage = () => {
    doc.addPage()
    pageNum++
    line = 0
    doc.setFont('courier', 'normal')
    doc.setFontSize(FONT_SIZE)
    doc.text(`${pageNum}.`, RIGHT_EDGE, 36, { align: 'right' })
  }

  const blocks = project.blocks.filter(b => b.text.trim())
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]
    const width = CHARS_PER_LINE[b.type]
    const text = UPPERCASE[b.type] ? b.text.toUpperCase() : b.text
    const lines = wrapText(text, width)
    const blanks = line === 0 ? 0 : BLANKS_BEFORE[b.type]

    // Page break if this block (plus keep-together space) won't fit
    let needed = blanks + lines.length
    if (b.type === 'character') needed += 2
    if (line + needed > LINES_PER_PAGE && line > 0) newPage()
    else line += blanks

    const bold = b.type === 'scene-header'
    doc.setFont('courier', bold ? 'bold' : 'normal')

    for (const l of lines) {
      if (line >= LINES_PER_PAGE) newPage()
      const y = TOP_MARGIN + line * LINE_H
      if (b.type === 'transition') {
        doc.text(l, RIGHT_EDGE, y, { align: 'right' })
      } else {
        doc.text(l, X_POS[b.type], y)
      }
      line++
    }
  }

  const safe = project.name.replace(/[^\w\s-]/g, '').trim() || 'screenplay'
  doc.save(`${safe}.pdf`)
}
