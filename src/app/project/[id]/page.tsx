'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getProject, createDocument, deleteDocument, saveProjectMeta } from '@/lib/storage'
import { supabase } from '@/lib/supabase'
import type { Brief, Doc, DocKind, Project } from '@/lib/types'
import { briefHasContent, isEpisode, episodeCode } from '@/lib/types'
import BriefFields from '@/components/BriefFields'

type NewKind = 'episode' | 'screenplay' | 'note'

const NEW_OPTIONS: { kind: NewKind; label: string; hint: string; icon: string }[] = [
  { kind: 'episode', label: 'Episode', hint: 'A numbered TV episode', icon: '📺' },
  { kind: 'screenplay', label: 'Screenplay', hint: 'A standalone script or film', icon: '🎬' },
  { kind: 'note', label: 'Note', hint: 'Research, bios, outline', icon: '📝' },
]

const BRIEF_SUMMARY: { key: keyof Brief; label: string }[] = [
  { key: 'logline', label: 'Logline' },
  { key: 'format', label: 'Format' },
  { key: 'tone', label: 'Tone' },
  { key: 'protagonist', label: 'Protagonist' },
  { key: 'conflict', label: 'Conflict' },
  { key: 'theme', label: 'Theme' },
  { key: 'comps', label: 'In the vein of' },
]

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [project, setProject] = useState<Project | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [newKind, setNewKind] = useState<NewKind | null>(null)
  const [docTitle, setDocTitle] = useState('')
  const [season, setSeason] = useState(1)
  const [episodeNumber, setEpisodeNumber] = useState(1)
  const [busy, setBusy] = useState(false)
  const [briefModal, setBriefModal] = useState(false)
  const [briefDraft, setBriefDraft] = useState<Brief>({})
  const [savingBrief, setSavingBrief] = useState(false)

  const load = useCallback(async () => {
    try {
      const p = await getProject(id)
      if (!p) { router.push('/'); return }
      setProject(p)
    } catch {
      router.push('/')
    }
  }, [id, router])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { router.replace('/login'); return }
      load()
    })
  }, [load, router])

  const startNew = (kind: NewKind) => {
    setMenuOpen(false)
    setNewKind(kind)
    setDocTitle('')
    if (kind === 'episode') {
      // Suggest the next episode number in the highest existing season
      const eps = (project?.documents ?? []).filter(d => d.episodeNumber != null)
      const maxSeason = eps.reduce((m, d) => Math.max(m, d.season ?? 1), 1)
      const inSeason = eps.filter(d => (d.season ?? 1) === maxSeason)
      const nextNum = inSeason.reduce((m, d) => Math.max(m, d.episodeNumber ?? 0), 0) + 1
      setSeason(maxSeason)
      setEpisodeNumber(nextNum)
    }
  }

  const closeNew = () => { setNewKind(null); setDocTitle('') }

  const handleCreateDoc = async () => {
    const title = docTitle.trim()
    if (!title || busy || !newKind) return
    setBusy(true)
    try {
      const kind: DocKind = newKind === 'note' ? 'note' : 'screenplay'
      const meta = newKind === 'episode' ? { season, episodeNumber } : undefined
      const doc = await createDocument(id, kind, title, meta)
      router.push(`/project/${id}/doc/${doc.id}`)
    } catch (e) {
      console.error(e)
      setBusy(false)
    }
  }

  const openBrief = () => {
    setBriefDraft(project?.brief ?? {})
    setBriefModal(true)
  }

  const saveBrief = async () => {
    if (!project || savingBrief) return
    setSavingBrief(true)
    try {
      await saveProjectMeta({ ...project, brief: briefDraft, updatedAt: new Date().toISOString() })
      setProject({ ...project, brief: briefDraft })
      setBriefModal(false)
    } catch (e) {
      console.error(e)
    } finally {
      setSavingBrief(false)
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
  const screenplayCount = docs.filter(d => d.kind === 'screenplay').length
  const sorted = [...docs].sort((a, b) => {
    // Screenplays/episodes first (ordered by season, then episode #, then created),
    // notes after (by created)
    if (a.kind !== b.kind) return a.kind === 'screenplay' ? -1 : 1
    if (a.kind === 'screenplay') {
      const sa = a.season ?? 0, sb = b.season ?? 0
      if (sa !== sb) return sa - sb
      const ea = a.episodeNumber ?? 0, eb = b.episodeNumber ?? 0
      if (ea !== eb) return ea - eb
    }
    return a.createdAt.localeCompare(b.createdAt)
  })

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
          <div className="relative shrink-0">
            <button
              onClick={() => setMenuOpen(o => !o)}
              className="pressable grad-bg text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg shadow-fuchsia-500/20 hover:shadow-fuchsia-500/40 hover:brightness-110 flex items-center gap-1.5"
            >
              + New
              <svg className={`w-3.5 h-3.5 transition-transform ${menuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="fade-up absolute right-0 mt-2 w-64 bg-[#1a1a24] border border-white/10 rounded-2xl shadow-2xl z-20 overflow-hidden p-1.5">
                  {NEW_OPTIONS.map(opt => (
                    <button
                      key={opt.kind}
                      onClick={() => startNew(opt.kind)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors text-left"
                    >
                      <span className="text-lg">{opt.icon}</span>
                      <span>
                        <span className="block text-sm text-neutral-100">{opt.label}</span>
                        <span className="block text-xs text-neutral-500">{opt.hint}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="relative max-w-2xl mx-auto px-8 py-10">
        {/* Story Brief — the writer's intent, feeds the co-writer */}
        {briefHasContent(project.brief) ? (
          <button
            onClick={openBrief}
            className="fade-up w-full text-left mb-4 bg-gradient-to-br from-fuchsia-500/10 to-violet-500/10 border border-fuchsia-400/20 rounded-2xl px-5 py-4 hover:border-fuchsia-400/40 transition-colors group"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold grad-text uppercase tracking-wider">✨ Story Brief</span>
              <span className="text-xs text-neutral-500 group-hover:text-neutral-300 transition-colors">Edit</span>
            </div>
            {project.brief!.logline?.trim() && (
              <p className="text-sm text-neutral-200 italic mb-1.5">“{project.brief!.logline.trim()}”</p>
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-0.5">
              {BRIEF_SUMMARY.filter(f => f.key !== 'logline' && (project.brief![f.key] ?? '').trim()).map(f => (
                <span key={f.key} className="text-[11px] text-neutral-500">
                  <span className="text-neutral-600">{f.label}:</span>{' '}
                  <span className="text-neutral-400">{project.brief![f.key]}</span>
                </span>
              ))}
            </div>
          </button>
        ) : (
          <button
            onClick={openBrief}
            className="fade-up w-full text-left mb-4 bg-[#17171f] border border-dashed border-white/15 rounded-2xl px-5 py-4 hover:border-fuchsia-400/40 transition-colors"
          >
            <p className="text-sm text-neutral-200 font-medium">✨ Set up your story brief</p>
            <p className="text-xs text-neutral-500 mt-0.5">
              A few optional questions about your idea — the more you add, the sharper the co-writer.
            </p>
          </button>
        )}

        {docs.length === 0 && (
          <div className="fade-up text-center py-14 px-6 bg-[#141018] border border-white/8 rounded-2xl">
            <div className="w-14 h-14 rounded-2xl grad-bg mx-auto mb-4 flex items-center justify-center text-2xl">🎬</div>
            <h2 className="text-base font-medium text-neutral-100 mb-1">This project is empty</h2>
            <p className="text-sm text-neutral-500 mb-6" style={{ textWrap: 'pretty' }}>
              Add your first script, episode, or note to get started.
            </p>
            <div className="flex items-center gap-2.5 justify-center flex-wrap">
              <button onClick={() => startNew('screenplay')} className="pressable grad-bg text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg shadow-fuchsia-500/20 hover:brightness-110">
                🎬 New Screenplay
              </button>
              <button onClick={() => startNew('episode')} className="pressable text-neutral-200 border border-white/15 text-sm px-4 py-2.5 rounded-xl hover:bg-white/10">
                📺 New Episode
              </button>
              <button onClick={() => startNew('note')} className="pressable text-neutral-200 border border-white/15 text-sm px-4 py-2.5 rounded-xl hover:bg-white/10">
                📝 New Note
              </button>
            </div>
          </div>
        )}

        <div className="space-y-2.5">
          {sorted.map((doc, i) => {
            const ep = isEpisode(doc)
            const icon = doc.kind === 'note' ? '📝' : ep ? '📺' : '🎬'
            const tile = doc.kind === 'note'
              ? 'linear-gradient(135deg, #f59e0b, #ef4444)'
              : ep
                ? 'linear-gradient(135deg, #06b6d4, #7c3aed)'
                : 'linear-gradient(135deg, #7c3aed, #ec4899)'
            const label = doc.kind === 'note' ? 'Note' : ep ? 'Episode' : 'Screenplay'
            // Screenplays are deletable only when more than one exists (never leave a project with zero)
            const canDelete = doc.kind === 'note' || screenplayCount > 1
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
                    style={{ background: tile }}
                  >
                    {icon}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-neutral-100 text-sm truncate">
                      {ep && <span className="text-cyan-300/80 mr-1.5" style={{ fontVariantNumeric: 'tabular-nums' }}>{episodeCode(doc)}</span>}
                      {doc.title}
                    </p>
                    <p className="text-xs text-neutral-500 mt-0.5" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {label} · edited {new Date(doc.updatedAt).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric',
                      })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {canDelete && (
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

        {docs.length > 0 && (
          <p className="text-xs text-neutral-600 mt-8 text-center" style={{ textWrap: 'pretty' }}>
            Add research, character bios, outlines, or general notes alongside your screenplay.
          </p>
        )}
      </div>

      {newKind && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={e => { if (e.target === e.currentTarget) closeNew() }}
        >
          <div className="fade-up bg-[#17171f] border border-white/10 rounded-3xl shadow-2xl w-full max-w-md p-8">
            <h2 className="text-xl font-semibold text-white mb-1">
              {newKind === 'episode' ? 'New Episode' : newKind === 'screenplay' ? 'New Screenplay' : 'New Note'}
            </h2>
            <p className="text-sm text-neutral-400 mb-6">
              {newKind === 'episode'
                ? 'A numbered episode in this series'
                : newKind === 'screenplay'
                  ? 'A standalone script inside this project'
                  : 'A notes page inside this project'}
            </p>

            {newKind === 'episode' && (
              <div className="flex gap-3 mb-3">
                <div className="w-24">
                  <label className="block text-xs font-medium text-neutral-400 mb-1">Season</label>
                  <input
                    type="number" min={1} max={999}
                    value={season}
                    onChange={e => setSeason(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-fuchsia-400/60"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  />
                </div>
                <div className="w-24">
                  <label className="block text-xs font-medium text-neutral-400 mb-1">Episode</label>
                  <input
                    type="number" min={1} max={9999}
                    value={episodeNumber}
                    onChange={e => setEpisodeNumber(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-fuchsia-400/60"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  />
                </div>
              </div>
            )}

            <label className="block text-xs font-medium text-neutral-400 mb-1">
              {newKind === 'episode' ? 'Episode title' : 'Title'}
            </label>
            <input
              autoFocus
              type="text"
              maxLength={200}
              placeholder={
                newKind === 'episode' ? 'e.g. Pilot'
                  : newKind === 'screenplay' ? 'e.g. The Dark Knight'
                    : 'e.g. General Notes, Character Bios, Research'
              }
              value={docTitle}
              onChange={e => setDocTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateDoc()}
              className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-neutral-600 outline-none focus:border-fuchsia-400/60 focus:ring-2 focus:ring-fuchsia-500/20 transition-[border-color,box-shadow] duration-150"
            />
            <div className="flex gap-3 mt-6">
              <button
                onClick={closeNew}
                className="pressable flex-1 text-sm text-neutral-400 border border-white/10 rounded-xl py-2.5 hover:bg-white/5 hover:text-neutral-200"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateDoc}
                disabled={!docTitle.trim() || busy}
                className="pressable flex-1 text-sm grad-bg text-white font-medium rounded-xl py-2.5 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {busy ? 'Creating…' : newKind === 'note' ? 'Create' : 'Create & write'}
              </button>
            </div>
          </div>
        </div>
      )}

      {briefModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={e => { if (e.target === e.currentTarget) setBriefModal(false) }}
        >
          <div className="fade-up bg-[#17171f] border border-white/10 rounded-3xl shadow-2xl w-full max-w-md p-8 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-semibold text-white mb-1">Story Brief</h2>
            <p className="text-sm text-neutral-400 mb-6" style={{ textWrap: 'pretty' }}>
              Your intent for the story. All optional — the co-writer treats this as the source of truth for what you&rsquo;re going for.
            </p>
            <BriefFields value={briefDraft} onChange={setBriefDraft} />
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setBriefModal(false)}
                className="pressable flex-1 text-sm text-neutral-400 border border-white/10 rounded-xl py-2.5 hover:bg-white/5 hover:text-neutral-200"
              >
                Cancel
              </button>
              <button
                onClick={saveBrief}
                disabled={savingBrief}
                className="pressable flex-1 text-sm grad-bg text-white font-medium rounded-xl py-2.5 hover:brightness-110 disabled:opacity-40"
              >
                {savingBrief ? 'Saving…' : 'Save brief'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
