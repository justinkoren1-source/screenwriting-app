'use client'

import { useState, useRef, useEffect, useCallback, useMemo, KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import type { Block, Doc, ElementType, Project } from '@/lib/types'
import { isEpisode, episodeCode } from '@/lib/types'
import { saveDocument, saveProjectMeta } from '@/lib/storage'
import { paginate, characterNames, cleanCharacterName } from '@/lib/screenplay'
import { exportPdf } from '@/lib/pdfExport'
import CoWriterPanel from './CoWriterPanel'

// ─── Config ──────────────────────────────────────────────────────────────────

const UPPERCASE_TYPES = new Set<ElementType>([
  'scene-header', 'character', 'extension', 'transition', 'shot',
])

const NEXT_TYPE: Record<ElementType, ElementType> = {
  'scene-header':  'action',
  'action':        'action',
  'character':     'dialog',
  'dialog':        'character',
  'parenthetical': 'dialog',
  'extension':     'dialog',
  'transition':    'scene-header',
  'shot':          'action',
}

const ELEMENT_DEFS: { type: ElementType; label: string; shortcut: string }[] = [
  { type: 'scene-header',  label: 'Scene Heading', shortcut: '⌘1' },
  { type: 'action',        label: 'Action',        shortcut: '⌘2' },
  { type: 'character',     label: 'Character',     shortcut: '⌘3' },
  { type: 'dialog',        label: 'Dialog',        shortcut: '⌘4' },
  { type: 'parenthetical', label: 'Parenthetical', shortcut: '⌘5' },
  { type: 'extension',     label: 'Extension',     shortcut: '⌘6' },
  { type: 'transition',    label: 'Transition',    shortcut: '⌘7' },
  { type: 'shot',          label: 'Shot',          shortcut: '⌘8' },
]

const TYPE_BY_KEY: Record<string, ElementType> = {
  '1': 'scene-header',
  '2': 'action',
  '3': 'character',
  '4': 'dialog',
  '5': 'parenthetical',
  '6': 'extension',
  '7': 'transition',
  '8': 'shot',
}

const PLACEHOLDERS: Record<ElementType, string> = {
  'scene-header':  'INT. LOCATION — DAY',
  'action':        'Action description...',
  'character':     'CHARACTER NAME',
  'dialog':        'Dialogue...',
  'parenthetical': '(beat)',
  'extension':     '(V.O.)',
  'transition':    'CUT TO:',
  'shot':          'CLOSE ON:',
}

// ── Industry-standard page geometry ──────────────────────────────────────────
// Screen scale: 1 inch = 96px (CSS standard). Page = US Letter 8.5in wide,
// margins 1.5in left / 1in right, Courier 12pt (16px). Real scripts are
// single-spaced (12pt leading); we use 20px on screen for edit comfort while
// keeping print-accurate indents. PDF export uses exact print metrics.
const LINE = 20 // on-screen line height (px)

// Vertical spacing above element: 1 blank line before most elements,
// 2 before a scene heading — exactly like a printed script
const SPACE_ABOVE: Partial<Record<ElementType, number>> = {
  'scene-header': LINE * 2,
  'action':       LINE,
  'character':    LINE,
  'transition':   LINE,
  'shot':         LINE,
}

// Indents from the text margin (1.5in), at 96px/in:
// character 2.2in=211px · dialog 1.0in=96px (3.5in col → 144px right)
// parenthetical 1.6in=154px (≈2.4in col → 192px right)
function getTextareaStyle(type: ElementType): React.CSSProperties {
  const base: React.CSSProperties = {
    fontFamily: "var(--font-courier-prime), 'Courier Prime', Courier, monospace",
    fontSize: '16px',
    lineHeight: `${LINE}px`,
    color: '#1a1a1a',
    resize: 'none',
    overflow: 'hidden',
    background: 'transparent',
    border: 'none',
    outline: 'none',
    width: '100%',
    padding: 0,
    display: 'block',
  }
  switch (type) {
    case 'scene-header':
      return { ...base, textTransform: 'uppercase' }
    case 'action':
      return { ...base }
    case 'character':
      return { ...base, textTransform: 'uppercase', paddingLeft: '211px' }
    case 'dialog':
      return { ...base, paddingLeft: '96px', paddingRight: '144px' }
    case 'parenthetical':
      return { ...base, paddingLeft: '154px', paddingRight: '192px' }
    case 'extension':
      return { ...base, textTransform: 'uppercase', paddingLeft: '211px' }
    case 'transition':
      return { ...base, textTransform: 'uppercase', textAlign: 'right' }
    case 'shot':
      return { ...base, textTransform: 'uppercase' }
    default:
      return base
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ScreenplayEditor({ project: initial, doc }: { project: Project; doc: Doc }) {
  const router = useRouter()
  const initialBlocks = doc.blocks && doc.blocks.length > 0
    ? doc.blocks
    : [{ id: crypto.randomUUID(), type: 'scene-header' as ElementType, text: '' }]
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks)
  const [activeId, setActiveId] = useState<string>(initialBlocks[0]?.id ?? '')
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [coWriterOpen, setCoWriterOpen] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [author, setAuthor] = useState(initial.author ?? '')
  const [contact, setContact] = useState(initial.contact ?? '')
  const [exporting, setExporting] = useState(false)
  // Character autocomplete
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [suggestIndex, setSuggestIndex] = useState(0)

  const refs = useRef<Map<string, HTMLTextAreaElement>>(new Map())
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const metaRef = useRef({ author: initial.author ?? '', contact: initial.contact ?? '' })

  const pagination = useMemo(() => paginate(blocks), [blocks])

  // Auto-resize all textareas when blocks change
  const resizeAll = useCallback(() => {
    refs.current.forEach(el => {
      // Skip if not laid out yet (width 0 would wrap every char to its own line)
      if (el.clientWidth === 0) return
      el.style.height = 'auto'
      el.style.height = el.scrollHeight + 'px'
    })
  }, [])

  useEffect(() => { resizeAll() }, [blocks, resizeAll])

  // Re-measure once layout and fonts have settled, and on window resize
  useEffect(() => {
    const raf = requestAnimationFrame(resizeAll)
    document.fonts?.ready.then(resizeAll)
    window.addEventListener('resize', resizeAll)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resizeAll)
    }
  }, [resizeAll])

  // Focus a newly created block after render
  useEffect(() => {
    if (!pendingFocusId) return
    const el = refs.current.get(pendingFocusId)
    if (el) {
      el.focus()
      el.setSelectionRange(0, 0)
      setPendingFocusId(null)
    }
  }, [pendingFocusId, blocks])

  // Debounced save
  const scheduleSave = useCallback((updated: Block[]) => {
    setSaveStatus('saving')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveDocument({ ...doc, blocks: updated, updatedAt: new Date().toISOString() })
        .then(() => setSaveStatus('saved'))
        .catch(err => { console.error('Save failed:', err); setSaveStatus('error') })
    }, 800)
  }, [doc])

  // ── Block mutations ───────────────────────────────────────────────────────

  const updateText = useCallback((id: string, text: string) => {
    setBlocks(prev => {
      const next = prev.map(b => b.id === id ? { ...b, text } : b)
      scheduleSave(next)
      return next
    })
  }, [scheduleSave])

  const changeType = useCallback((id: string, type: ElementType) => {
    setBlocks(prev => {
      const next = prev.map(b => {
        if (b.id !== id) return b
        const text = UPPERCASE_TYPES.has(type) ? b.text.toUpperCase() : b.text
        return { ...b, type, text }
      })
      scheduleSave(next)
      return next
    })
    setSuggestions([])
    // Restore focus after re-render changes element style
    requestAnimationFrame(() => {
      const el = refs.current.get(id)
      if (el) { el.focus(); const l = el.value.length; el.setSelectionRange(l, l) }
    })
  }, [scheduleSave])

  const addBlockAfter = useCallback((afterId: string, type: ElementType, text = '') => {
    const newId = crypto.randomUUID()
    const newBlock: Block = {
      id: newId,
      type,
      text: UPPERCASE_TYPES.has(type) ? text.toUpperCase() : text,
    }
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === afterId)
      const next = [...prev.slice(0, idx + 1), newBlock, ...prev.slice(idx + 1)]
      scheduleSave(next)
      return next
    })
    setActiveId(newId)
    setPendingFocusId(newId)
  }, [scheduleSave])

  const removeBlock = useCallback((id: string) => {
    setBlocks(prev => {
      if (prev.length <= 1) return prev
      const idx = prev.findIndex(b => b.id === id)
      const next = prev.filter(b => b.id !== id)
      scheduleSave(next)
      const targetId = next[Math.max(0, idx - 1)]?.id
      if (targetId) {
        setActiveId(targetId)
        requestAnimationFrame(() => {
          const el = refs.current.get(targetId)
          if (el) { el.focus(); const l = el.value.length; el.setSelectionRange(l, l) }
        })
      }
      return next
    })
  }, [scheduleSave])

  // ── Insert AI-proposed blocks (approve-to-insert from the co-writer) ──────

  const insertBlocks = useCallback((incoming: { type: ElementType; text: string }[]) => {
    if (!incoming.length) return
    const newBlocks: Block[] = incoming.map(b => ({
      id: crypto.randomUUID(),
      type: b.type,
      text: UPPERCASE_TYPES.has(b.type) ? b.text.toUpperCase() : b.text,
    }))
    setBlocks(prev => {
      // Append to the end of the script — co-writer suggestions are "what comes
      // next," and while chatting the cursor isn't meaningfully in the script.
      // If the script is just a trailing empty line, replace it so there's no gap.
      const lastIdx = prev.length - 1
      const next =
        lastIdx >= 0 && prev[lastIdx].text.trim() === ''
          ? [...prev.slice(0, lastIdx), ...newBlocks]
          : [...prev, ...newBlocks]
      scheduleSave(next)
      return next
    })
    const lastId = newBlocks[newBlocks.length - 1].id
    setActiveId(lastId)
    setPendingFocusId(lastId)
  }, [scheduleSave])

  // ── Auto (CONT'D): same speaker continues after action in the same scene ──

  const withContd = useCallback((blockId: string, text: string): string => {
    if (/\(CONT'D\)/i.test(text)) return text
    const name = cleanCharacterName(text)
    if (!name) return text
    const idx = blocks.findIndex(b => b.id === blockId)
    let sawInterruption = false
    for (let i = idx - 1; i >= 0; i--) {
      const b = blocks[i]
      if (b.type === 'scene-header' || b.type === 'transition') return text // new scene — no CONT'D
      if (b.type === 'action' || b.type === 'shot') { sawInterruption = true; continue }
      if (b.type === 'character') {
        if (cleanCharacterName(b.text) === name && sawInterruption) {
          return text.trim() + " (CONT'D)"
        }
        return text
      }
    }
    return text
  }, [blocks])

  // ── Character autocomplete ────────────────────────────────────────────────

  const refreshSuggestions = useCallback((block: Block, value: string) => {
    if (block.type !== 'character') { setSuggestions([]); return }
    const typed = cleanCharacterName(value)
    if (!typed) { setSuggestions([]); return }
    const matches = characterNames(blocks, block.id)
      .filter(n => n.startsWith(typed) && n !== typed)
      .slice(0, 5)
    setSuggestions(matches)
    setSuggestIndex(0)
  }, [blocks])

  // ── Keyboard handler ──────────────────────────────────────────────────────

  const handleKeyDown = useCallback((
    e: KeyboardEvent<HTMLTextAreaElement>,
    block: Block,
    idx: number,
  ) => {
    const meta = e.metaKey || e.ctrlKey

    // ⌘1–8: change element type
    if (meta && TYPE_BY_KEY[e.key]) {
      e.preventDefault()
      changeType(block.id, TYPE_BY_KEY[e.key])
      return
    }

    const hasSuggestions = suggestions.length > 0 && block.type === 'character'

    // Autocomplete navigation
    if (hasSuggestions && e.key === 'ArrowDown') {
      e.preventDefault()
      setSuggestIndex(i => (i + 1) % suggestions.length)
      return
    }
    if (hasSuggestions && e.key === 'ArrowUp') {
      e.preventDefault()
      setSuggestIndex(i => (i - 1 + suggestions.length) % suggestions.length)
      return
    }
    if (hasSuggestions && e.key === 'Escape') {
      setSuggestions([])
      return
    }
    if (hasSuggestions && e.key === 'Tab') {
      e.preventDefault()
      updateText(block.id, suggestions[suggestIndex])
      setSuggestions([])
      return
    }

    // Enter: split block or create next element
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const el = e.currentTarget
      const cursor = el.selectionStart ?? el.value.length
      let before = el.value.slice(0, cursor)
      const after = el.value.slice(cursor)

      if (block.type === 'character' && after.length === 0) {
        // Accept highlighted autocomplete suggestion, then apply (CONT'D)
        if (hasSuggestions) before = suggestions[suggestIndex]
        before = withContd(block.id, before)
        setSuggestions([])
      }

      updateText(block.id, before)
      // New block: same type if splitting mid-text, smart next type if at end
      const newType = after.length > 0 ? block.type : NEXT_TYPE[block.type]
      addBlockAfter(block.id, newType, after)
      return
    }

    // Backspace on empty block: delete block
    if (e.key === 'Backspace' && e.currentTarget.value === '') {
      e.preventDefault()
      setSuggestions([])
      removeBlock(block.id)
      return
    }

    // Arrow up at start: move to previous block
    if (e.key === 'ArrowUp' && e.currentTarget.selectionStart === 0 && idx > 0) {
      e.preventDefault()
      const prevId = blocks[idx - 1].id
      const el = refs.current.get(prevId)
      if (el) { el.focus(); const l = el.value.length; el.setSelectionRange(l, l); setActiveId(prevId) }
    }

    // Arrow down at end: move to next block
    if (e.key === 'ArrowDown' && idx < blocks.length - 1) {
      const el = e.currentTarget
      if (el.selectionStart === el.value.length) {
        e.preventDefault()
        const nextId = blocks[idx + 1].id
        const nextEl = refs.current.get(nextId)
        if (nextEl) { nextEl.focus(); nextEl.setSelectionRange(0, 0); setActiveId(nextId) }
      }
    }
  }, [blocks, suggestions, suggestIndex, changeType, updateText, addBlockAfter, removeBlock, withContd])

  // ── Export ────────────────────────────────────────────────────────────────

  const handleExport = async () => {
    setExporting(true)
    try {
      metaRef.current = { author, contact }
      const meta: Project = { ...initial, author, contact, updatedAt: new Date().toISOString() }
      await saveProjectMeta(meta)
      const episode = isEpisode(doc) ? { code: episodeCode(doc), title: doc.title } : undefined
      await exportPdf(meta, blocks, episode)
      setShowExport(false)
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setExporting(false)
    }
  }

  // ── Scene navigator data ──────────────────────────────────────────────────

  const scenes = useMemo(
    () => blocks.filter(b => b.type === 'scene-header'),
    [blocks],
  )

  // Group blocks into pages (each rendered as its own paper sheet)
  const pages = useMemo(() => {
    const result: { block: Block; idx: number }[][] = []
    let current: { block: Block; idx: number }[] = []
    blocks.forEach((block, idx) => {
      if (pagination.breakBefore.has(block.id) && current.length) {
        result.push(current)
        current = []
      }
      current.push({ block, idx })
    })
    if (current.length) result.push(current)
    return result
  }, [blocks, pagination])

  // Which page is currently in view (drives the live page indicator)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [viewPage, setViewPage] = useState(1)

  const recomputeViewPage = useCallback(() => {
    const sc = scrollRef.current
    if (!sc) return
    const markerY = sc.getBoundingClientRect().top + sc.clientHeight * 0.3
    let p = 1
    sc.querySelectorAll<HTMLElement>('[data-page]').forEach(el => {
      if (el.getBoundingClientRect().top <= markerY) p = Number(el.dataset.page)
    })
    setViewPage(p)
  }, [])

  // Keep it fresh on scroll, typing, and navigation
  useEffect(() => { recomputeViewPage() }, [blocks, activeId, recomputeViewPage])

  const jumpToBlock = (id: string) => {
    const el = refs.current.get(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.focus()
      setActiveId(id)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const activeType = blocks.find(b => b.id === activeId)?.type ?? 'action'

  return (
    <div className="flex flex-col h-screen bg-[#1a1a1a]">

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 bg-[#111] border-b border-white/10 shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push(`/project/${initial.id}`)}
            className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {initial.name}
          </button>
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="text-gray-400 hover:text-white text-sm transition-colors"
            title="Toggle scene navigator"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
            </svg>
          </button>
        </div>
        <span className="text-white text-sm font-medium truncate max-w-[40%]">
          {isEpisode(doc)
            ? <><span className="text-cyan-300/80 mr-1.5">{episodeCode(doc)}</span>{doc.title}</>
            : initial.name}
        </span>
        <div className="flex items-center gap-4">
          <span className="text-xs text-amber-400/90" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {pagination.totalPages} {pagination.totalPages === 1 ? 'page' : 'pages'}
          </span>
          <span className={`text-xs w-24 text-right ${saveStatus === 'error' ? 'text-red-400' : 'text-gray-500'}`}>
            {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'error' ? 'Save failed' : 'Saved'}
          </span>
          <button
            onClick={() => setCoWriterOpen(o => !o)}
            className={[
              'pressable text-xs font-medium px-3.5 py-2 rounded-lg transition-colors',
              coWriterOpen
                ? 'bg-white/15 text-white'
                : 'text-fuchsia-200 border border-fuchsia-400/40 hover:bg-fuchsia-500/10',
            ].join(' ')}
          >
            ✨ Co-writer
          </button>
          <button
            onClick={() => setShowExport(true)}
            className="pressable grad-bg text-white text-xs font-medium px-3.5 py-2 rounded-lg shadow-md shadow-fuchsia-500/20 hover:brightness-110"
          >
            Export PDF
          </button>
        </div>
      </header>

      {/* Element type toolbar */}
      <div className="flex items-center gap-1 px-3 py-2 bg-[#1e1e1e] border-b border-white/10 overflow-x-auto shrink-0">
        {ELEMENT_DEFS.map(({ type, label, shortcut }) => (
          <button
            key={type}
            onMouseDown={e => {
              e.preventDefault() // prevent losing focus from textarea
              if (activeId) changeType(activeId, type)
            }}
            className={[
              'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs whitespace-nowrap transition-[background-color,color,box-shadow] duration-150',
              activeType === type
                ? 'grad-bg text-white shadow-md shadow-fuchsia-500/25'
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/5',
            ].join(' ')}
          >
            {label}
            <span className="opacity-40">{shortcut}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-1 min-h-0">

        {/* Scene navigator */}
        {sidebarOpen && (
          <aside className="w-56 shrink-0 bg-[#161616] border-r border-white/10 overflow-y-auto">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-4 pt-4 pb-2">
              Scenes
            </p>
            {scenes.length === 0 ? (
              <p className="text-xs text-gray-600 px-4">No scenes yet</p>
            ) : (
              scenes.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => jumpToBlock(s.id)}
                  className="w-full text-left px-4 py-2 hover:bg-white/5 transition-colors group"
                >
                  <span className="text-[10px] text-gray-600 group-hover:text-gray-500 mr-2">{i + 1}</span>
                  <span className="text-xs text-gray-300 group-hover:text-white font-mono">
                    {s.text.trim() || '(empty)'}
                  </span>
                  <span className="block text-[10px] text-gray-600 mt-0.5 ml-5">
                    p. {pagination.pageOfBlock.get(s.id) ?? 1}
                  </span>
                </button>
              ))
            )}
          </aside>
        )}

        {/* Script pages */}
        <div className="relative flex-1 min-w-0">
          <div ref={scrollRef} onScroll={recomputeViewPage} className="h-full overflow-y-auto py-12" style={{ backgroundColor: '#3a3a3a' }}>
            {pages.map((pageBlocks, pageIdx) => (
              <div
                key={pageIdx}
                data-page={pageIdx + 1}
                className="mx-auto bg-white shadow-2xl relative"
                style={{
                  maxWidth: '816px',   // 8.5in at 96px/in
                  minHeight: '1292px', // ~one page of content at screen metrics
                  padding: '96px 96px 96px 144px', // 1in top/bottom/right, 1.5in left
                  marginBottom: '28px',
                }}
                onClick={e => {
                  if (e.target !== e.currentTarget) return
                  const last = pageBlocks[pageBlocks.length - 1]?.block ?? blocks[blocks.length - 1]
                  if (!last) return
                  const el = refs.current.get(last.id)
                  if (el) { el.focus(); const l = el.value.length; el.setSelectionRange(l, l); setActiveId(last.id) }
                }}
              >
                {/* Page number, top-right (industry standard — page 1 unnumbered) */}
                {pageIdx > 0 && (
                  <div
                    className="absolute text-[13px] text-neutral-400 select-none"
                    style={{
                      top: '40px', right: '96px',
                      fontFamily: "var(--font-courier-prime), Courier, monospace",
                    }}
                    contentEditable={false}
                  >
                    {pageIdx + 1}.
                  </div>
                )}

                {pageBlocks.map(({ block, idx }, i) => (
                  <div key={block.id}>
                    {/* Vertical spacing above certain elements (not at the top of a page) */}
                    {i > 0 && SPACE_ABOVE[block.type] && (
                      <div style={{ height: SPACE_ABOVE[block.type] }} />
                    )}

                    <div className="relative">
                      <textarea
                        ref={el => {
                          if (el) refs.current.set(block.id, el)
                          else refs.current.delete(block.id)
                        }}
                        value={block.text}
                        rows={1}
                        spellCheck
                        placeholder={PLACEHOLDERS[block.type]}
                        style={getTextareaStyle(block.type)}
                        onChange={e => {
                          const raw = e.target.value.replace(/\n/g, '')
                          const text = UPPERCASE_TYPES.has(block.type) ? raw.toUpperCase() : raw
                          updateText(block.id, text)
                          refreshSuggestions(block, text)
                        }}
                        onKeyDown={e => handleKeyDown(e, block, idx)}
                        onFocus={() => setActiveId(block.id)}
                        onBlur={() => setTimeout(() => setSuggestions([]), 150)}
                      />

                      {/* Character autocomplete dropdown */}
                      {block.id === activeId && block.type === 'character' && suggestions.length > 0 && (
                        <div
                          className="absolute z-10 bg-white border border-neutral-200 rounded-lg shadow-lg py-1 min-w-[180px]"
                          style={{ left: '211px', top: '100%' }}
                        >
                          {suggestions.map((name, si) => (
                            <button
                              key={name}
                              onMouseDown={e => {
                                e.preventDefault()
                                updateText(block.id, name)
                                setSuggestions([])
                              }}
                              className={[
                                'block w-full text-left px-3 py-1.5 text-sm font-mono',
                                si === suggestIndex ? 'bg-neutral-100 text-black' : 'text-neutral-600',
                              ].join(' ')}
                            >
                              {name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Live page indicator, bottom-right beside the script */}
          <div
            className="absolute bottom-4 right-4 bg-[#111]/90 backdrop-blur border border-white/10 text-xs text-neutral-300 px-3 py-1.5 rounded-full shadow-lg select-none pointer-events-none"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            Page {viewPage} of {pagination.totalPages}
          </div>
        </div>

        {coWriterOpen && (
          <CoWriterPanel
            project={initial}
            docId={doc.id}
            onInsert={insertBlocks}
            onClose={() => setCoWriterOpen(false)}
          />
        )}
      </div>

      {/* Export modal */}
      {showExport && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowExport(false) }}
        >
          <div className="fade-up bg-[#17171f] border border-white/10 rounded-3xl shadow-2xl w-full max-w-md p-8">
            <h2 className="text-xl font-semibold text-white mb-1">Export PDF</h2>
            <p className="text-sm text-neutral-400 mb-6">
              Title page info for &ldquo;{initial.name}&rdquo;
            </p>
            <label className="block text-xs font-medium text-neutral-500 mb-1.5">Written by</label>
            <input
              type="text"
              maxLength={200}
              placeholder="Your name"
              value={author}
              onChange={e => setAuthor(e.target.value)}
              className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-neutral-600 outline-none focus:border-fuchsia-400/60 focus:ring-2 focus:ring-fuchsia-500/20 transition-[border-color,box-shadow] duration-150 mb-4"
            />
            <label className="block text-xs font-medium text-neutral-500 mb-1.5">
              Contact info (optional, shown bottom-left)
            </label>
            <textarea
              maxLength={500}
              placeholder={'email@example.com\n555-123-4567'}
              value={contact}
              onChange={e => setContact(e.target.value)}
              rows={3}
              className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-neutral-600 outline-none focus:border-fuchsia-400/60 focus:ring-2 focus:ring-fuchsia-500/20 transition-[border-color,box-shadow] duration-150 resize-none"
              style={{ overflow: 'auto' }}
            />
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowExport(false)}
                className="pressable flex-1 text-sm text-neutral-400 border border-white/10 rounded-xl py-2.5 hover:bg-white/5 hover:text-neutral-200"
              >
                Cancel
              </button>
              <button
                onClick={handleExport}
                disabled={exporting}
                className="pressable flex-1 text-sm grad-bg text-white font-medium rounded-xl py-2.5 hover:brightness-110 disabled:opacity-40"
              >
                {exporting ? 'Exporting…' : 'Download PDF'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
