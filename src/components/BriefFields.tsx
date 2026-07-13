'use client'

import type { Brief } from '@/lib/types'

const FIELDS: {
  key: keyof Brief
  label: string
  placeholder: string
  multiline?: boolean
}[] = [
  { key: 'logline', label: 'Logline', placeholder: 'Your story in one sentence', multiline: true },
  { key: 'format', label: 'Format & length', placeholder: 'Feature, short, TV pilot?' },
  { key: 'tone', label: 'Genre & tone', placeholder: 'e.g. grounded thriller, darkly funny' },
  { key: 'protagonist', label: 'Protagonist', placeholder: 'Who they are — and what they want vs. what they need', multiline: true },
  { key: 'conflict', label: 'Central conflict', placeholder: "What's in their way / the antagonist", multiline: true },
  { key: 'theme', label: 'What it’s really about', placeholder: 'The theme underneath' },
  { key: 'comps', label: 'In the vein of', placeholder: 'A couple of comparable films, for tone' },
]

export default function BriefFields({
  value,
  onChange,
}: {
  value: Brief
  onChange: (next: Brief) => void
}) {
  const set = (key: keyof Brief, v: string) => onChange({ ...value, [key]: v })

  const inputClass =
    'w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-neutral-600 outline-none focus:border-fuchsia-400/60 focus:ring-2 focus:ring-fuchsia-500/20 transition-[border-color,box-shadow] duration-150'

  return (
    <div className="space-y-3">
      {FIELDS.map(f => (
        <div key={f.key}>
          <label className="block text-xs font-medium text-neutral-400 mb-1">{f.label}</label>
          {f.multiline ? (
            <textarea
              rows={2}
              maxLength={2000}
              placeholder={f.placeholder}
              value={value[f.key] ?? ''}
              onChange={e => set(f.key, e.target.value)}
              className={`${inputClass} resize-none`}
            />
          ) : (
            <input
              type="text"
              maxLength={500}
              placeholder={f.placeholder}
              value={value[f.key] ?? ''}
              onChange={e => set(f.key, e.target.value)}
              className={inputClass}
            />
          )}
        </div>
      ))}
    </div>
  )
}
