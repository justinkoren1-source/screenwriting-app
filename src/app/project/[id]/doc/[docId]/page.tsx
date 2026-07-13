'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getProject, getDocument } from '@/lib/storage'
import { supabase } from '@/lib/supabase'
import type { Doc, Project } from '@/lib/types'
import ScreenplayEditor from '@/components/ScreenplayEditor'
import NoteEditor from '@/components/NoteEditor'

export default function DocPage() {
  const { id, docId } = useParams<{ id: string; docId: string }>()
  const router = useRouter()
  const [project, setProject] = useState<Project | null>(null)
  const [doc, setDoc] = useState<Doc | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { router.replace('/login'); return }
      Promise.all([getProject(id), getDocument(docId)])
        .then(([p, d]) => {
          if (!p || !d || d.projectId !== p.id) { router.push('/'); return }
          setProject(p)
          setDoc(d)
        })
        .catch(() => router.push('/'))
    })
  }, [id, docId, router])

  if (!project || !doc) return <div className="min-h-screen bg-[#111]" />

  return doc.kind === 'screenplay'
    ? <ScreenplayEditor project={project} doc={doc} />
    : <NoteEditor project={project} doc={doc} />
}
