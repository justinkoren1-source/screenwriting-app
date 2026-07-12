'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getProject, createDocument, deleteDocument } from '@/lib/storage'
import type { Doc, Project } from '@/lib/types'

const KIND_META: Record<string, { label: string; icon: string }> = {
  screenplay: { label: 'Screenplay', icon: '🎬' },
  note: { label: 'Note', icon: '📝' },
}

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [project, setProject] = useState<Project | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [docTitle, setDocTitle] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const p = await getProject(id)
      if (!p) { router.push('/'); return }
      setProject(p)
    } catch {
      router.push('/')
    }
  }, [id, router])

  useEffect(() => { load() }, [load])

  const handleCreateDoc = async () => {
    const title = docTitle.trim()
    if (!title || busy) return
    setBusy(true)
    try {
      const doc = await createDocument(id, 'note', title)
      router.push(`/project/${id}/doc/${doc.id}`)
    } catch (e) {
      console.error(e)
      setBusy(false)
    }
  }

  const handleDeleteDoc = async (e: React.MouseEvent, doc: Doc) => {
    e.stopPropagation()
    if (!confirm(`Delete "${doc.title}"?`)) return
    try {
      await deleteDocument(doc.id)
      load()
    } catch (err) {
      console.error(err)
    }
  }

  if (!project) return <div className="min-h-screen bg-neutral-50" />

  const docs = project.documents ?? []
  // Screenplay always listed first
  const sorted = [...docs].sort((a, b) =>
    a.kind === b.kind ? a.createdAt.localeCompare(b.createdAt) : a.kind === 'screenplay' ? -1 : 1
  )

  return (
    <main className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white px-8 py-5">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4 min-w-0">
            <button
              onClick={() => router.push('/')}
              className="flex items-center gap-1.5 text-neutral-400 hover:text-neutral-700 text-sm transition-colors shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Projects
            </button>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold text-neutral-900 truncate">{project.name}</h1>
              <p className="text-xs text-neutral-400 mt-0.5">
                {docs.length} {docs.length === 1 ? 'document' : 'documents'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="bg-neutral-900 text-white text-sm px-4 py-2 rounded-lg hover:bg-neutral-700 transition-colors shrink-0"
          >
            + New Document
          </button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-8 py-10">
        <div className="space-y-2">
          {sorted.map(doc => {
            const meta = KIND_META[doc.kind]
            return (
              <div
                key={doc.id}
                onClick={() => router.push(`/project/${id}/doc/${doc.id}`)}
                className="flex items-center justify-between bg-white border border-neutral-200 rounded-xl px-5 py-4 cursor-pointer hover:border-neutral-400 hover:shadow-sm transition-all group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xl shrink-0">{meta.icon}</span>
                  <div className="min-w-0">
                    <p className="font-medium text-neutral-900 text-sm truncate">{doc.title}</p>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      {meta.label} · edited {new Date(doc.updatedAt).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric',
                      })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  {doc.kind !== 'screenplay' && (
                    <button
                      onClick={e => handleDeleteDoc(e, doc)}
                      className="text-xs text-neutral-300 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      Delete
                    </button>
                  )}
                  <svg className="w-4 h-4 text-neutral-300 group-hover:text-neutral-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            )
          })}
        </div>

        <p className="text-xs text-neutral-400 mt-6 text-center">
          Add research, character bios, outlines, or general notes alongside your screenplay.
        </p>
      </div>

      {showModal && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={e => { if (e.target === e.currentTarget) { setShowModal(false); setDocTitle('') } }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
            <h2 className="text-xl font-semibold text-neutral-900 mb-1">New Document</h2>
            <p className="text-sm text-neutral-400 mb-6">A notes page inside this project</p>
            <input
              autoFocus
              type="text"
              maxLength={200}
              placeholder="e.g. General Notes, Character Bios, Research"
              value={docTitle}
              onChange={e => setDocTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateDoc()}
              className="w-full border border-neutral-200 rounded-lg px-4 py-3 text-sm outline-none focus:border-neutral-400 focus:ring-2 focus:ring-neutral-100 transition-all"
            />
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowModal(false); setDocTitle('') }}
                className="flex-1 text-sm text-neutral-500 border border-neutral-200 rounded-lg py-2.5 hover:bg-neutral-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateDoc}
                disabled={!docTitle.trim() || busy}
                className="flex-1 text-sm bg-neutral-900 text-white rounded-lg py-2.5 hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {busy ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
