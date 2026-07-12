'use client'

import { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import type { Block, ElementType, Project } from '@/lib/types'
import { saveProject } from '@/lib/storage'

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
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved')

  const refs = useRef<Map<string, HTMLTextAreaElement>>(new Map())
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
      saveProject({ ...initial, blocks: updated, updatedAt: new Date().toISOString() })
      setSaveStatus('saved')
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

    // Enter: split block or create next element
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const el = e.currentTarget
      const cursor = el.selectionStart ?? el.value.length
      const before = el.value.slice(0, cursor)
      const after  = el.value.slice(cursor)
      // Update current block with text before cursor
      updateText(block.id, before)
      // New block: same type if splitting mid-text, smart next type if at end
      const newType = after.length > 0 ? block.type : NEXT_TYPE[block.type]
      addBlockAfter(block.id, newType, after)
      return
    }

    // Backspace on empty block: delete block
    if (e.key === 'Backspace' && e.currentTarget.value === '') {
      e.preventDefault()
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
  }, [blocks, changeType, updateText, addBlockAfter, removeBlock])

  // ── Render ────────────────────────────────────────────────────────────────

  const activeType = blocks.find(b => b.id === activeId)?.type ?? 'action'

  return (
    <div className="flex flex-col min-h-screen bg-[#1a1a1a]">

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 bg-[#111] border-b border-white/10 shrink-0">
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Scripts
        </button>
        <span className="text-white text-sm font-medium">{initial.name}</span>
        <span className="text-xs text-gray-500 w-14 text-right">
          {saveStatus === 'saving' ? 'Saving…' : 'Saved'}
        </span>
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

      {/* Script page */}
      <div
        className="flex-1 overflow-y-auto py-12"
        style={{ backgroundColor: '#3a3a3a' }}
      >
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
              {/* Vertical spacing above certain elements */}
              {idx > 0 && SPACE_ABOVE[block.type] && (
                <div style={{ height: SPACE_ABOVE[block.type] }} />
              )}

              <textarea
                ref={el => {
                  if (el) refs.current.set(block.id, el)
                  else refs.current.delete(block.id)
                }}
                value={block.text}
                rows={1}
                spellCheck
                placeholder={PLACEHOLDERS[block.type]}
                style={{
                  ...getTextareaStyle(block.type),
                  // Placeholder color via CSS custom property trick isn't possible inline;
                  // handled in globals.css
                }}
                onChange={e => {
                  // Block newlines (Enter is handled by onKeyDown)
                  const raw = e.target.value.replace(/\n/g, '')
                  const text = UPPERCASE_TYPES.has(block.type) ? raw.toUpperCase() : raw
                  updateText(block.id, text)
                }}
                onKeyDown={e => handleKeyDown(e, block, idx)}
                onFocus={() => setActiveId(block.id)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
