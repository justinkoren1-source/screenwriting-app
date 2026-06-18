'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getProject } from '@/lib/storage'
import type { Project } from '@/lib/types'
import ScreenplayEditor from '@/components/ScreenplayEditor'

export default function ScriptPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [project, setProject] = useState<Project | null>(null)

  useEffect(() => {
    const p = getProject(id)
    if (!p) { router.push('/'); return }
    setProject(p)
  }, [id, router])

  if (!project) return <div className="min-h-screen bg-[#111]" />

  return <ScreenplayEditor project={project} />
}
