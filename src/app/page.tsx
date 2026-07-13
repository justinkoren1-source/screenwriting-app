'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getProjects, createProject, createDocument, deleteProject, saveDocument } from '@/lib/storage'
import { supabase } from '@/lib/supabase'
import type { Project } from '@/lib/types'

// Each project gets a stable gradient tile based on its name
const TILE_GRADIENTS = [
  'linear-gradient(135deg, #7c3aed, #ec4899)',
  'linear-gradient(135deg, #f59e0b, #ef4444)',
  'linear-gradient(135deg, #06b6d4, #7c3aed)',
  'linear-gradient(135deg, #10b981, #06b6d4)',
  'linear-gradient(135deg, #ec4899, #f59e0b)',
]
function tileFor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  return TILE_GRADIENTS[Math.abs(h) % TILE_GRADIENTS.length]
}

export default function HomePage() {
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [showModal, setShowModal] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    try {
      const all = await getProjects()
      setProjects(
        [...all].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      )
    } catch (e) {
      console.error('Failed to load projects:', e)
    }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { router.replace('/login'); return }
      setUserEmail(data.session.user.email ?? null)
      setReady(true)
      refresh()
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) { router.replace('/login'); return }
      setUserEmail(session.user.email ?? null)
      refresh()
    })
    return () => sub.subscription.unsubscribe()
  }, [refresh, router])

  const handleCreate = async () => {
    const name = projectName.trim()
    if (!name) return
    try {
      const project = await createProject(name)
      router.push(`/project/${project.id}`)
    } catch (e) {
      console.error(e)
      setImportError('Could not create the project. Are you online?')
      setShowModal(false)
    }
  }

  const closeModal = () => {
    setShowModal(false)
    setProjectName('')
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (fileInputRef.current) fileInputRef.current.value = ''

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setImportError('That file is not a PDF.')
      return
    }
    if (file.size > 25 * 1024 * 1024) {
      setImportError('PDF is too large (max 25MB).')
      return
    }

    setImporting(true)
    setImportError(null)

    try {
      const { parsePdfToBlocks, titleFromFilename } = await import('@/lib/pdfParser')
      const blocks = await parsePdfToBlocks(file)
      const name = titleFromFilename(file.name)
      const project = await createProject(name)
      const screenplay = await createDocument(project.id, 'screenplay', 'Screenplay')
      await saveDocument({ ...screenplay, blocks, updatedAt: new Date().toISOString() })
      router.push(`/project/${project.id}/doc/${screenplay.id}`)
    } catch (err) {
      console.error('PDF import error:', err)
      setImportError('Could not parse this PDF. Make sure it is a text-based (not scanned) screenplay.')
      setImporting(false)
    }
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (!confirm('Delete this project and all its documents?')) return
    try {
      await deleteProject(id)
      setProjects(prev => prev.filter(p => p.id !== id))
    } catch (err) {
      console.error(err)
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  if (!ready) return <main className="min-h-screen" />

  return (
    <main className="min-h-screen relative overflow-x-hidden">
      {/* Spotlight glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[720px] h-[480px] rounded-full opacity-25 blur-3xl"
        style={{ background: 'radial-gradient(ellipse at center, #7c3aed 0%, #ec4899 45%, transparent 70%)' }}
      />

      <header className="relative border-b border-white/10 px-8 py-5">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight">
              <span className="mr-2">🎬</span>
              <span className="grad-text">Screenplay</span>
            </h1>
            <p className="text-xs text-neutral-500 mt-0.5 truncate">
              {userEmail ?? 'Every great film starts with FADE IN.'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleSignOut}
              className="pressable text-neutral-400 text-sm px-3 py-2.5 rounded-lg hover:text-white hover:bg-white/5"
            >
              Sign out
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="pressable text-neutral-200 border border-white/15 text-sm px-4 py-2.5 rounded-xl hover:bg-white/10 hover:border-white/25 disabled:opacity-50 flex items-center gap-2"
            >
              {importing ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Importing…
                </>
              ) : (
                'Upload PDF'
              )}
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="pressable grad-bg text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg shadow-fuchsia-500/20 hover:shadow-fuchsia-500/40 hover:brightness-110"
            >
              + New Project
            </button>
          </div>
        </div>
      </header>

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={handleUpload}
      />

      {importError && (
        <div className="relative max-w-2xl mx-auto px-8 pt-4">
          <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-xl px-4 py-3 flex items-center justify-between">
            <span>{importError}</span>
            <button onClick={() => setImportError(null)} className="text-red-400 hover:text-red-200 ml-4 w-8 h-8 -my-1">✕</button>
          </div>
        </div>
      )}

      <div className="relative max-w-2xl mx-auto px-8 py-10">
        {projects.length === 0 ? (
          <div className="text-center py-24 fade-up">
            <div className="w-20 h-20 rounded-3xl grad-bg mx-auto mb-6 flex items-center justify-center text-4xl shadow-xl shadow-fuchsia-500/25">
              🎬
            </div>
            <h2 className="text-lg font-semibold text-white mb-1.5" style={{ textWrap: 'balance' }}>
              Every great film starts with FADE IN.
            </h2>
            <p className="text-sm text-neutral-400 mb-8" style={{ textWrap: 'pretty' }}>
              Write in perfect industry format — or bring in a script you already have.
            </p>
            <div className="flex items-center gap-3 justify-center">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="pressable text-neutral-200 border border-white/15 text-sm px-5 py-3 rounded-xl hover:bg-white/10 hover:border-white/25"
              >
                Upload PDF
              </button>
              <button
                onClick={() => setShowModal(true)}
                className="pressable grad-bg text-white text-sm font-medium px-5 py-3 rounded-xl shadow-lg shadow-fuchsia-500/20 hover:shadow-fuchsia-500/40 hover:brightness-110"
              >
                + New Project
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-xs font-semibold text-neutral-500 mb-3 uppercase tracking-widest">Your Projects</p>
            <div className="space-y-2.5">
              {projects.map((project, i) => (
                <div
                  key={project.id}
                  onClick={() => router.push(`/project/${project.id}`)}
                  className="fade-up flex items-center justify-between bg-[#17171f] border border-white/8 rounded-2xl px-4 py-3.5 cursor-pointer hover:border-white/20 hover:bg-[#1c1c26] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/40 transition-[transform,background-color,border-color,box-shadow] duration-150 ease-out group"
                  style={{ animationDelay: `${Math.min(i * 45, 360)}ms` }}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div
                      className="w-11 h-11 rounded-xl shrink-0 flex items-center justify-center text-white font-bold text-base shadow-inner"
                      style={{ background: tileFor(project.name) }}
                    >
                      {project.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-neutral-100 text-sm truncate">{project.name}</p>
                      <p className="text-xs text-neutral-500 mt-0.5" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        Edited {new Date(project.updatedAt).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric',
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      onClick={e => handleDelete(e, project.id)}
                      className="text-xs text-neutral-600 hover:text-red-400 transition-colors duration-150 opacity-0 group-hover:opacity-100 px-2 py-2"
                    >
                      Delete
                    </button>
                    <svg
                      className="w-4 h-4 text-neutral-600 group-hover:text-neutral-300 group-hover:translate-x-0.5 transition-[color,transform] duration-150"
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {showModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={e => { if (e.target === e.currentTarget) closeModal() }}
        >
          <div className="fade-up bg-[#17171f] border border-white/10 rounded-3xl shadow-2xl w-full max-w-md p-8">
            <h2 className="text-xl font-semibold text-white mb-1">New Project</h2>
            <p className="text-sm text-neutral-400 mb-6" style={{ textWrap: 'pretty' }}>
              Name your project — it&rsquo;s a folder for your script (or episodes) and notes. You&rsquo;ll add those next.
            </p>
            <input
              autoFocus
              type="text"
              maxLength={200}
              placeholder="e.g. The Dark Knight, or your series name"
              value={projectName}
              onChange={e => setProjectName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-neutral-600 outline-none focus:border-fuchsia-400/60 focus:ring-2 focus:ring-fuchsia-500/20 transition-[border-color,box-shadow] duration-150"
            />

            <div className="flex gap-3 mt-6">
              <button
                onClick={closeModal}
                className="pressable flex-1 text-sm text-neutral-400 border border-white/10 rounded-xl py-2.5 hover:bg-white/5 hover:text-neutral-200"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!projectName.trim()}
                className="pressable flex-1 text-sm grad-bg text-white font-medium rounded-xl py-2.5 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Create Project
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
