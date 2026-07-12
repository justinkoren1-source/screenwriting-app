'use client'

import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Doc, Project } from '@/lib/types'
import { saveDocument } from '@/lib/storage'

export default function NoteEditor({ project, doc: initial }: { project: Project; doc: Doc }) {
  const router = useRouter()
  const [content, setContent] = useState(initial.content ?? '')
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scheduleSave = useCallback((text: string) => {
    setSaveStatus('saving')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveDocument({ ...initial, content: text, updatedAt: new Date().toISOString() })
        .then(() => setSaveStatus('saved'))
        .catch(err => { console.error('Save failed:', err); setSaveStatus('error') })
    }, 800)
  }, [initial])

  return (
    <div className="flex flex-col h-screen bg-[#1a1a1a]">
      <header className="flex items-center justify-between px-6 py-3 bg-[#111] border-b border-white/10 shrink-0">
        <button
          onClick={() => router.push(`/project/${project.id}`)}
          className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {project.name}
        </button>
        <span className="text-white text-sm font-medium">{initial.title}</span>
        <span className={`text-xs w-16 text-right ${saveStatus === 'error' ? 'text-red-400' : 'text-gray-500'}`}>
          {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'error' ? 'Save failed' : 'Saved'}
        </span>
      </header>

      <div className="flex-1 overflow-y-auto py-12" style={{ backgroundColor: '#3a3a3a' }}>
        <div
          className="mx-auto bg-white shadow-2xl rounded-sm"
          style={{ maxWidth: '740px', minHeight: '900px', padding: '64px 72px' }}
        >
          <textarea
            autoFocus
            value={content}
            placeholder="Write your notes…"
            onChange={e => { setContent(e.target.value); scheduleSave(e.target.value) }}
            className="w-full outline-none border-none resize-none text-[15px] leading-7 text-neutral-800 placeholder:text-neutral-300"
            style={{ minHeight: '780px', overflow: 'hidden', fontFamily: 'inherit' }}
            onInput={e => {
              const el = e.currentTarget
              el.style.height = 'auto'
              el.style.height = el.scrollHeight + 'px'
            }}
          />
        </div>
      </div>
    </div>
  )
}
