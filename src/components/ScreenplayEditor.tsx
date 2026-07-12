'use client'

import { useState, useRef, useEffect, useCallback, useMemo, KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import type { Block, ElementType, Project } from '@/lib/types'
import { saveProject } from '@/lib/storage'
import { paginate, characterNames, cleanCharacterName } from '@/lib/screenplay'
import { exportPdf } from '@/lib/pdfExport'

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

// Vertical spacing above element (px)
const SPACE_ABOVE: Partial<Record<ElementType, number>> = {
  'scene-header': 32,
  'character':    16,
  'transition':   32,
  'shot':         16,
}

function getTextareaStyle(type: ElementType): React.CSSProperties {
  const base: React.CSSProperties = {
    fontFamily: "var(--font-courier-prime), 'Courier Prime', Courier, monospace",
    fontSize: '15px',
    lineHeight: '26px',
    color: '#111',
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
      return { ...base, textTransform: 'uppercase', fontWeight: '700' }
    case 'action':
      return { ...base }
    case 'character':
      return { ...base, textTransform: 'uppercase', paddingLeft: '200px' }
    case 'dialog':
      return { ...base, paddingLeft: '88px', paddingRight: '64px' }
    case 'parenthetical':
      return { ...base, paddingLeft: '116px', paddingRight: '96px', fontStyle: 'italic' }
    case 'extension':
      return { ...base, textTransform: 'uppercase', paddingLeft: '200px' }
    case 'transition':
      return { ...base, textTransform: 'uppercase', textAlign: 'right' }
    case 'shot':
      return { ...base, textTransform: 'uppercase', fontWeight: '600' }
    default:
      return base
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ScreenplayEditor({ project: initial }: { project: Project }) {
  const router = useRouter()
  const [blocks, setBlocks] = useState<Block[]>(initial.blocks)
  const [activeId, setActiveId] = useState<string>(initial.blocks[0]?.id ?? '')
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved')
  const [sidebarOpen, setSidebarOpen] = useState(true)
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
      saveProject({
        ...initial,
        blocks: updated,
        author: metaRef.current.author,
        contact: metaRef.current.contact,
        updatedAt: new Date().toISOString(),
      })
        .then(() => setSaveStatus('saved'))
        .catch(err => { console.error('Save failed:', err); setSaveStatus('error') })
    }, 800)
  }, [initial])

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
      const project: Project = {
        ...initial, blocks, author, contact,
        updatedAt: new Date().toISOString(),
      }
      saveProject(project)
      await exportPdf(project)
      setShowExport(false)
    } finally {
      setExporting(false)
    }
  }

  // ── Scene navigator data ──────────────────────────────────────────────────

  const scenes = useMemo(
    () => blocks.filter(b => b.type === 'scene-header'),
    [blocks],
  )

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
            onClick={() => router.push('/')}
            className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Scripts
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
        <span className="text-white text-sm font-medium">{initial.name}</span>
        <div className="flex items-center gap-4">
          <span className="text-xs text-gray-500">
            {pagination.totalPages} {pagination.totalPages === 1 ? 'page' : 'pages'}
          </span>
          <span className={`text-xs w-24 text-right ${saveStatus === 'error' ? 'text-red-400' : 'text-gray-500'}`}>
            {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'error' ? 'Save failed' : 'Saved'}
          </span>
          <button
            onClick={() => setShowExport(true)}
            className="bg-white/10 hover:bg-white/20 text-white text-xs px-3 py-1.5 rounded transition-colors"
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
              'flex items-center gap-1.5 px-3 py-1.5 rounded text-xs whitespace-nowrap transition-colors',
              activeType === type
                ? 'bg-white/15 text-white'
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

        {/* Script page */}
        <div className="flex-1 overflow-y-auto py-12" style={{ backgroundColor: '#3a3a3a' }}>
          <div
            className="mx-auto bg-white shadow-2xl"
            style={{
              maxWidth: '740px',
              minHeight: '900px',
              padding: '80px 64px 160px 96px',
            }}
            onClick={e => {
              if (e.target !== e.currentTarget) return
              const last = blocks[blocks.length - 1]
              if (!last) return
              const el = refs.current.get(last.id)
              if (el) { el.focus(); const l = el.value.length; el.setSelectionRange(l, l); setActiveId(last.id) }
            }}
          >
            {blocks.map((block, idx) => (
              <div key={block.id}>
                {/* Page-break marker */}
                {pagination.breakBefore.has(block.id) && (
                  <div className="flex items-center gap-3 my-6 -mx-12 select-none" contentEditable={false}>
                    <div className="flex-1 border-t border-dashed border-neutral-300" />
                    <span className="text-[10px] text-neutral-400 font-sans">
                      PAGE {pagination.pageOfBlock.get(block.id)}
                    </span>
                    <div className="flex-1 border-t border-dashed border-neutral-300" />
                  </div>
                )}

                {/* Vertical spacing above certain elements */}
                {idx > 0 && SPACE_ABOVE[block.type] && !pagination.breakBefore.has(block.id) && (
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
                      // Block newlines (Enter is handled by onKeyDown)
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
                      style={{ left: '200px', top: '100%' }}
                    >
                      {suggestions.map((name, i) => (
                        <button
                          key={name}
                          onMouseDown={e => {
                            e.preventDefault()
                            updateText(block.id, name)
                            setSuggestions([])
                          }}
                          className={[
                            'block w-full text-left px-3 py-1.5 text-sm font-mono',
                            i === suggestIndex ? 'bg-neutral-100 text-black' : 'text-neutral-600',
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
        </div>
      </div>

      {/* Export modal */}
      {showExport && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowExport(false) }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
            <h2 className="text-xl font-semibold text-neutral-900 mb-1">Export PDF</h2>
            <p className="text-sm text-neutral-400 mb-6">
              Title page info for &ldquo;{initial.name}&rdquo;
            </p>
            <label className="block text-xs font-medium text-neutral-500 mb-1.5">Written by</label>
            <input
              type="text"
              placeholder="Your name"
              value={author}
              onChange={e => setAuthor(e.target.value)}
              className="w-full border border-neutral-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-neutral-400 mb-4"
            />
            <label className="block text-xs font-medium text-neutral-500 mb-1.5">
              Contact info (optional, shown bottom-left)
            </label>
            <textarea
              placeholder={'email@example.com\n555-123-4567'}
              value={contact}
              onChange={e => setContact(e.target.value)}
              rows={3}
              className="w-full border border-neutral-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-neutral-400 resize-none"
              style={{ overflow: 'auto' }}
            />
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowExport(false)}
                className="flex-1 text-sm text-neutral-500 border border-neutral-200 rounded-lg py-2.5 hover:bg-neutral-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleExport}
                disabled={exporting}
                className="flex-1 text-sm bg-neutral-900 text-white rounded-lg py-2.5 hover:bg-neutral-700 disabled:opacity-40 transition-colors"
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
