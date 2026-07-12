'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getProjects, createProject, deleteProject, saveProject } from '@/lib/storage'
import { supabase } from '@/lib/supabase'
import type { Project } from '@/lib/types'

export default function HomePage() {
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [showModal, setShowModal] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
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
      setUserEmail(data.session?.user.email ?? null)
      refresh()
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user.email ?? null)
      refresh()
    })
    return () => sub.subscription.unsubscribe()
  }, [refresh])

  const handleCreate = async () => {
    const name = projectName.trim()
    if (!name) return
    try {
      const project = await createProject(name)
      router.push(`/script/${project.id}`)
    } catch (e) {
      console.error(e)
      setImportError('Could not create the script. Are you online?')
      setShowModal(false)
    }
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
      await saveProject({ ...project, blocks })
      router.push(`/script/${project.id}`)
    } catch (err) {
      console.error('PDF import error:', err)
      setImportError('Could not parse this PDF. Make sure it is a text-based (not scanned) screenplay.')
      setImporting(false)
    }
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (!confirm('Delete this script?')) return
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

  return (
    <main className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white px-8 py-5">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-neutral-900">Screenplay</h1>
            <p className="text-xs text-neutral-400 mt-0.5">
              {userEmail ? userEmail : 'Industry-standard format'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {userEmail ? (
              <button
                onClick={handleSignOut}
                className="text-neutral-400 text-sm px-3 py-2 rounded-lg hover:text-neutral-700 transition-colors"
              >
                Sign out
              </button>
            ) : (
              <button
                onClick={() => router.push('/login')}
                className="text-neutral-600 text-sm px-3 py-2 rounded-lg hover:text-neutral-900 transition-colors"
              >
                Sign in
              </button>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="text-neutral-600 border border-neutral-300 text-sm px-4 py-2 rounded-lg hover:bg-neutral-100 disabled:opacity-50 transition-colors flex items-center gap-2"
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
              className="bg-neutral-900 text-white text-sm px-4 py-2 rounded-lg hover:bg-neutral-700 transition-colors"
            >
              + New Script
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
        <div className="max-w-2xl mx-auto px-8 pt-4">
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex items-center justify-between">
            <span>{importError}</span>
            <button onClick={() => setImportError(null)} className="text-red-400 hover:text-red-600 ml-4">✕</button>
          </div>
        </div>
      )}

      {!userEmail && projects.length > 0 && (
        <div className="max-w-2xl mx-auto px-8 pt-4">
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3">
            Your scripts are only saved in this browser.{' '}
            <button onClick={() => router.push('/login')} className="font-medium underline hover:text-amber-900">
              Create a free account
            </button>{' '}
            to access them anywhere.
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-8 py-10">
        {projects.length === 0 ? (
          <div className="text-center py-24">
            <div className="w-16 h-16 rounded-2xl bg-neutral-200 mx-auto mb-5 flex items-center justify-center">
              <svg className="w-8 h-8 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <h2 className="text-base font-medium text-neutral-700 mb-1.5">No scripts yet</h2>
            <p className="text-sm text-neutral-400 mb-6">Start writing your first screenplay</p>
            <div className="flex items-center gap-3 justify-center">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-neutral-600 border border-neutral-300 text-sm px-5 py-2.5 rounded-lg hover:bg-neutral-100 transition-colors"
              >
                Upload PDF
              </button>
              <button
                onClick={() => setShowModal(true)}
                className="bg-neutral-900 text-white text-sm px-5 py-2.5 rounded-lg hover:bg-neutral-700 transition-colors"
              >
                + New Script
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-xs font-medium text-neutral-400 mb-3 uppercase tracking-wider">Your Scripts</p>
            <div className="space-y-2">
              {projects.map(project => (
                <div
                  key={project.id}
                  onClick={() => router.push(`/script/${project.id}`)}
                  className="flex items-center justify-between bg-white border border-neutral-200 rounded-xl px-5 py-4 cursor-pointer hover:border-neutral-400 hover:shadow-sm transition-all group"
                >
                  <div>
                    <p className="font-medium text-neutral-900 text-sm">{project.name}</p>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      Edited {new Date(project.updatedAt).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={e => handleDelete(e, project.id)}
                      className="text-xs text-neutral-300 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      Delete
                    </button>
                    <svg className="w-4 h-4 text-neutral-300 group-hover:text-neutral-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
          className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={e => {
            if (e.target === e.currentTarget) { setShowModal(false); setProjectName('') }
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
            <h2 className="text-xl font-semibold text-neutral-900 mb-1">New Script</h2>
            <p className="text-sm text-neutral-400 mb-6">Give your screenplay a title to get started</p>
            <input
              autoFocus
              type="text"
              maxLength={200}
              placeholder="e.g. The Dark Knight"
              value={projectName}
              onChange={e => setProjectName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              className="w-full border border-neutral-200 rounded-lg px-4 py-3 text-sm outline-none focus:border-neutral-400 focus:ring-2 focus:ring-neutral-100 transition-all"
            />
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowModal(false); setProjectName('') }}
                className="flex-1 text-sm text-neutral-500 border border-neutral-200 rounded-lg py-2.5 hover:bg-neutral-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!projectName.trim()}
                className="flex-1 text-sm bg-neutral-900 text-white rounded-lg py-2.5 hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Get Started
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
