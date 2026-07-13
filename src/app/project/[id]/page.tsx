'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getProject, createDocument, deleteDocument } from '@/lib/storage'
import type { Doc, Project } from '@/lib/types'

const KIND_META: Record<string, { label: string; icon: string; tile: string }> = {
  screenplay: { label: 'Screenplay', icon: '🎬', tile: 'linear-gradient(135deg, #7c3aed, #ec4899)' },
  note: { label: 'Note', icon: '📝', tile: 'linear-gradient(135deg, #f59e0b, #ef4444)' },
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

  if (!project) return <div className="min-h-screen" />

  const docs = project.documents ?? []
  const sorted = [...docs].sort((a, b) =>
    a.kind === b.kind ? a.createdAt.localeCompare(b.createdAt) : a.kind === 'screenplay' ? -1 : 1
  )

  return (
    <main className="min-h-screen relative overflow-x-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[720px] h-[480px] rounded-full opacity-20 blur-3xl"
        style={{ background: 'radial-gradient(ellipse at center, #7c3aed 0%, #ec4899 45%, transparent 70%)' }}
      />

      <header className="relative border-b border-white/10 px-8 py-5">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4 min-w-0">
            <button
              onClick={() => router.push('/')}
              className="pressable flex items-center gap-1.5 text-neutral-400 hover:text-white text-sm px-2 py-2 -ml-2 rounded-lg hover:bg-white/5 shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Projects
            </button>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-white truncate">{project.name}</h1>
              <p className="text-xs text-neutral-500 mt-0.5" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {docs.length} {docs.length === 1 ? 'document' : 'documents'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="pressable grad-bg text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg shadow-fuchsia-500/20 hover:shadow-fuchsia-500/40 hover:brightness-110 shrink-0"
          >
            + New Document
          </button>
        </div>
      </header>

      <div className="relative max-w-2xl mx-auto px-8 py-10">
        <div className="space-y-2.5">
          {sorted.map((doc, i) => {
            const meta = KIND_META[doc.kind]
            return (
              <div
                key={doc.id}
                onClick={() => router.push(`/project/${id}/doc/${doc.id}`)}
                className="fade-up flex items-center justify-between bg-[#17171f] border border-white/8 rounded-2xl px-4 py-3.5 cursor-pointer hover:border-white/20 hover:bg-[#1c1c26] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/40 transition-[transform,background-color,border-color,box-shadow] duration-150 ease-out group"
                style={{ animationDelay: `${Math.min(i * 45, 360)}ms` }}
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div
                    className="w-11 h-11 rounded-xl shrink-0 flex items-center justify-center text-xl"
                    style={{ background: meta.tile }}
                  >
                    {meta.icon}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-neutral-100 text-sm truncate">{doc.title}</p>
                    <p className="text-xs text-neutral-500 mt-0.5" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {meta.label} · edited {new Date(doc.updatedAt).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric',
                      })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {doc.kind !== 'screenplay' && (
                    <button
                      onClick={e => handleDeleteDoc(e, doc)}
                      className="text-xs text-neutral-600 hover:text-red-400 transition-colors duration-150 opacity-0 group-hover:opacity-100 px-2 py-2"
                    >
                      Delete
                    </button>
                  )}
                  <svg
                    className="w-4 h-4 text-neutral-600 group-hover:text-neutral-300 group-hover:translate-x-0.5 transition-[color,transform] duration-150"
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            )
          })}
        </div>

        <p className="text-xs text-neutral-600 mt-8 text-center" style={{ textWrap: 'pretty' }}>
          Add research, character bios, outlines, or general notes alongside your screenplay.
        </p>
      </div>

      {showModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={e => { if (e.target === e.currentTarget) { setShowModal(false); setDocTitle('') } }}
        >
          <div className="fade-up bg-[#17171f] border border-white/10 rounded-3xl shadow-2xl w-full max-w-md p-8">
            <h2 className="text-xl font-semibold text-white mb-1">New Document</h2>
            <p className="text-sm text-neutral-400 mb-6">A notes page inside this project</p>
            <input
              autoFocus
              type="text"
              maxLength={200}
              placeholder="e.g. General Notes, Character Bios, Research"
              value={docTitle}
              onChange={e => setDocTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateDoc()}
              className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-neutral-600 outline-none focus:border-fuchsia-400/60 focus:ring-2 focus:ring-fuchsia-500/20 transition-[border-color,box-shadow] duration-150"
            />
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowModal(false); setDocTitle('') }}
                className="pressable flex-1 text-sm text-neutral-400 border border-white/10 rounded-xl py-2.5 hover:bg-white/5 hover:text-neutral-200"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateDoc}
                disabled={!docTitle.trim() || busy}
                className="pressable flex-1 text-sm grad-bg text-white font-medium rounded-xl py-2.5 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
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
