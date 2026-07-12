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
    getProject(id)
      .then(p => {
        if (!p) router.push('/')
        else setProject(p)
      })
      .catch(() => router.push('/'))
  }, [id, router])

  if (!project) return <div className="min-h-screen bg-[#111]" />

  return <ScreenplayEditor project={project} />
}
