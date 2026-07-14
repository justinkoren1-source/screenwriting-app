'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getChatMessages, type ChatMessage } from '@/lib/storage'
import { parseAssistantContent, type EditOp } from '@/lib/coWriter'
import type { Block, ElementType, Project } from '@/lib/types'

const ELEMENT_LABEL: Record<ElementType, string> = {
  'scene-header': 'Scene',
  'action': 'Action',
  'character': 'Character',
  'dialog': 'Dialog',
  'parenthetical': 'Parenthetical',
  'extension': 'Extension',
  'transition': 'Transition',
  'shot': 'Shot',
}

// Quick-start prompts, grouped by what writers most commonly need
const PROMPT_CATEGORIES: { icon: string; title: string; prompts: string[] }[] = [
  {
    icon: '🚧', title: 'Get unstuck', prompts: [
      "I'm stuck — what could happen next?",
      'Give me a few ways this scene could end.',
      'How do the characters get out of this?',
    ],
  },
  {
    icon: '🧹', title: 'Clean up', prompts: [
      'Find and fix any typos and formatting mistakes.',
      'Standardize all my scene headings.',
      'Check for inconsistent character-name spellings.',
    ],
  },
  {
    icon: '💬', title: 'Dialogue & lines', prompts: [
      'Punch up the dialogue in the latest scene.',
      'Give me a stronger version of the last line.',
      'This dialogue feels flat — tighten it.',
    ],
  },
  {
    icon: '📝', title: 'Get notes', prompts: [
      'Give me honest notes on the script so far.',
      "What's not working in the opening?",
      "Is my protagonist's want vs. need clear?",
    ],
  },
  {
    icon: '💡', title: 'Brainstorm', prompts: [
      'Give me five ideas for a twist here.',
      'Suggest a compelling B-story.',
      'What could a stronger opening image be?',
    ],
  },
  {
    icon: '🎭', title: 'Plot & character', prompts: [
      'Are there any plot holes so far?',
      'Help me deepen my main character.',
      'Does the midpoint raise the stakes enough?',
    ],
  },
]

function PromptLibrary({ onPick }: { onPick: (p: string) => void }) {
  return (
    <div className="space-y-3">
      {PROMPT_CATEGORIES.map(cat => (
        <div key={cat.title}>
          <div className="text-[11px] font-semibold text-neutral-400 mb-1.5">
            <span className="mr-1">{cat.icon}</span>{cat.title}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {cat.prompts.map(p => (
              <button
                key={p}
                onClick={() => onPick(p)}
                className="text-left text-xs text-neutral-300 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg px-2.5 py-1.5 transition-colors"
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

interface Props {
  project: Project
  docId: string
  blocks: Block[]
  onInsert: (blocks: { type: ElementType; text: string }[]) => void
  onApplyEdits: (ops: EditOp[]) => void
  onClose: () => void
}

export default function CoWriterPanel({ project, docId, blocks, onInsert, onApplyEdits, onClose }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsAuth, setNeedsAuth] = useState(false)
  const [accepted, setAccepted] = useState<Set<string>>(new Set())
  const [showPrompts, setShowPrompts] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const pickPrompt = (p: string) => {
    setInput(p)
    setShowPrompts(false)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { setNeedsAuth(true); return }
      getChatMessages(project.id).then(setMessages).catch(() => {})
    })
  }, [project.id])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || busy) return
    setError(null)
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: text }, { role: 'assistant', content: '' }])
    setBusy(true)

    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) { setNeedsAuth(true); setBusy(false); return }

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ projectId: project.id, docId, message: text }),
      })

      if (!res.ok || !res.body) {
        let msg = 'Something went wrong.'
        try { msg = (await res.json()).error ?? msg } catch {}
        setError(msg)
        setMessages(prev => prev.slice(0, -1)) // drop the empty assistant bubble
        setBusy(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        setMessages(prev => {
          const next = [...prev]
          next[next.length - 1] = {
            role: 'assistant',
            content: next[next.length - 1].content + chunk,
          }
          return next
        })
      }
    } catch {
      setError('Connection lost. Please try again.')
      setMessages(prev => (prev[prev.length - 1]?.content ? prev : prev.slice(0, -1)))
    } finally {
      setBusy(false)
    }
  }, [input, busy, project.id, docId])

  const acceptInsert = (key: string, blocks: { type: ElementType; text: string }[]) => {
    onInsert(blocks)
    setAccepted(prev => new Set(prev).add(key))
  }

  return (
    <aside className="w-96 shrink-0 flex flex-col bg-[#141018] border-l border-white/10">
      <header className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <span className="text-sm font-semibold grad-text">✨ Co-writer</span>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-white w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5 transition-colors"
          title="Close"
        >
          ✕
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {needsAuth ? (
          <div className="text-center text-sm text-neutral-400 mt-8">
            <p className="mb-3">Sign in to use the co-writer — it needs your account to read this project.</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-sm mt-2 space-y-4">
            <p className="text-neutral-300">Your co-writer has read this whole project. Pick a starting point or just type your own:</p>
            <PromptLibrary onPick={pickPrompt} />
          </div>
        ) : (
          messages.map((m, i) => (
            <Message
              key={i}
              message={m}
              streaming={busy && i === messages.length - 1 && m.role === 'assistant'}
              accepted={accepted}
              onAccept={acceptInsert}
              blocks={blocks}
              onApplyEdits={onApplyEdits}
              msgIndex={i}
            />
          ))
        )}
      </div>

      {error && (
        <div className="mx-4 mb-2 bg-red-500/10 border border-red-500/30 text-red-300 text-xs rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {!needsAuth && (
        <div className="relative p-3 border-t border-white/10 shrink-0">
          {showPrompts && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowPrompts(false)} />
              <div className="absolute z-20 left-3 right-3 bottom-full mb-2 max-h-[55vh] overflow-y-auto bg-[#1a1a24] border border-white/10 rounded-2xl shadow-2xl p-3">
                <PromptLibrary onPick={pickPrompt} />
              </div>
            </>
          )}
          <div className="flex items-end gap-2">
            <button
              onClick={() => setShowPrompts(o => !o)}
              className={[
                'pressable rounded-xl w-[42px] h-[42px] flex items-center justify-center shrink-0 border transition-colors',
                showPrompts
                  ? 'bg-white/10 border-white/25 text-white'
                  : 'border-white/10 text-neutral-400 hover:text-white hover:bg-white/5',
              ].join(' ')}
              title="Prompt ideas"
            >
              💡
            </button>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
              }}
              rows={1}
              placeholder="Ask your co-writer…"
              className="flex-1 bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-neutral-600 outline-none focus:border-fuchsia-400/60 resize-none max-h-32"
              style={{ minHeight: '42px' }}
            />
            <button
              onClick={send}
              disabled={busy || !input.trim()}
              className="pressable grad-bg text-white rounded-xl w-[42px] h-[42px] flex items-center justify-center shrink-0 disabled:opacity-40 hover:brightness-110"
              title="Send"
            >
              {busy ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              )}
            </button>
          </div>
          <p className="text-[10px] text-neutral-600 mt-1.5 text-center">
            Suggestions only appear in your script when you accept them.
          </p>
        </div>
      )}
    </aside>
  )
}

function Message({
  message, streaming, accepted, onAccept, blocks, onApplyEdits, msgIndex,
}: {
  message: ChatMessage
  streaming: boolean
  accepted: Set<string>
  onAccept: (key: string, blocks: { type: ElementType; text: string }[]) => void
  blocks: Block[]
  onApplyEdits: (ops: EditOp[]) => void
  msgIndex: number
}) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="grad-bg text-white text-sm rounded-2xl rounded-br-sm px-3.5 py-2 max-w-[85%] whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    )
  }

  // Assistant: split into prose, insert proposals, and edit proposals.
  // Suppress a half-streamed, not-yet-closed <insert>/<edits> fragment.
  let content = message.content
  if (streaming) {
    const openIns = content.lastIndexOf('<insert>')
    const openEd = content.lastIndexOf('<edits>')
    const open = Math.max(openIns, openEd)
    const close = Math.max(content.lastIndexOf('</insert>'), content.lastIndexOf('</edits>'))
    if (open > close) content = content.slice(0, open) + '\n*(drafting a suggestion…)*'
  }
  const parts = parseAssistantContent(content)

  return (
    <div className="space-y-2">
      {parts.map((p, i) => {
        if (p.type === 'insert' && p.insert) {
          const key = `${msgIndex}-${i}`
          const isAccepted = accepted.has(key)
          return (
            <div key={i} className="border border-fuchsia-400/30 bg-fuchsia-500/5 rounded-xl overflow-hidden">
              <div className="px-3 py-2 space-y-1 font-mono text-xs text-neutral-200">
                {p.insert.blocks.map((b, j) => (
                  <div key={j}>
                    <span className="text-fuchsia-300/70 mr-2">{ELEMENT_LABEL[b.type]}</span>
                    <span className={b.type === 'scene-header' || b.type === 'character' ? 'uppercase' : ''}>
                      {b.text}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex border-t border-fuchsia-400/20">
                {isAccepted ? (
                  <span className="flex-1 text-center text-xs text-emerald-400 py-2">✓ Added to script</span>
                ) : (
                  <button
                    onClick={() => onAccept(key, p.insert!.blocks)}
                    className="flex-1 text-xs text-white bg-fuchsia-500/20 hover:bg-fuchsia-500/30 py-2 transition-colors font-medium"
                  >
                    Accept into script
                  </button>
                )}
              </div>
            </div>
          )
        }
        if (p.type === 'edits') {
          return <EditCard key={i} ops={p.edits.ops} blocks={blocks} onApply={onApplyEdits} />
        }
        const text = (p.type === 'prose' ? p.text : '').trim()
        if (!text) return null
        return (
          <div key={i} className="text-sm text-neutral-200 whitespace-pre-wrap leading-relaxed">
            {text}
          </div>
        )
      })}
      {streaming && parts.length === 0 && (
        <div className="text-sm text-neutral-500">…</div>
      )}
    </div>
  )
}

function EditCard({
  ops, blocks, onApply,
}: {
  ops: EditOp[]
  blocks: Block[]
  onApply: (ops: EditOp[]) => void
}) {
  // Snapshot the "before" text for each edit once, so it stays stable after applying
  const [before] = useState<string[]>(() => ops.map(op => blocks[op.line - 1]?.text ?? ''))
  const [rejected, setRejected] = useState<Set<number>>(new Set())
  const [applied, setApplied] = useState(false)

  const remaining = ops.map((op, i) => ({ op, i })).filter(x => !rejected.has(x.i))

  return (
    <div className="border border-cyan-400/30 bg-cyan-500/5 rounded-xl overflow-hidden">
      <div className="px-3 py-2 text-[11px] font-semibold text-cyan-300/80 uppercase tracking-wider border-b border-cyan-400/20">
        Proposed edits
      </div>
      <div className="divide-y divide-white/5">
        {ops.map((op, i) => {
          const isRejected = rejected.has(i)
          return (
            <div key={i} className={`px-3 py-2 text-xs ${isRejected ? 'opacity-40' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 font-mono">
                  {op.remove ? (
                    <div>
                      <span className="text-red-300/80 mr-1.5">Delete</span>
                      <span className="text-neutral-500 line-through">{before[i] || `line ${op.line}`}</span>
                    </div>
                  ) : (
                    <>
                      {op.type && <span className="text-cyan-300/60 mr-1.5">→ {ELEMENT_LABEL[op.type]}</span>}
                      {before[i] && (
                        <div className="text-neutral-500 line-through">{before[i]}</div>
                      )}
                      <div className="text-emerald-300">{op.text}</div>
                    </>
                  )}
                </div>
                {!applied && (
                  <button
                    onClick={() =>
                      setRejected(prev => {
                        const next = new Set(prev)
                        if (next.has(i)) next.delete(i)
                        else next.add(i)
                        return next
                      })
                    }
                    className="shrink-0 text-neutral-500 hover:text-white text-[11px] px-1"
                    title={isRejected ? 'Include' : 'Skip this one'}
                  >
                    {isRejected ? '↩︎' : '✕'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <div className="border-t border-cyan-400/20">
        {applied ? (
          <span className="block text-center text-xs text-emerald-400 py-2">✓ Applied to script</span>
        ) : (
          <button
            onClick={() => { onApply(remaining.map(x => x.op)); setApplied(true) }}
            disabled={remaining.length === 0}
            className="w-full text-xs text-white bg-cyan-500/20 hover:bg-cyan-500/30 disabled:opacity-40 py-2 transition-colors font-medium"
          >
            Apply {remaining.length} {remaining.length === 1 ? 'change' : 'changes'}
          </button>
        )}
      </div>
    </div>
  )
}
