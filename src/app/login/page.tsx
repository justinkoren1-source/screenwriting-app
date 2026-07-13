'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { migrateLocalToCloud } from '@/lib/storage'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const submit = async () => {
    if (!email.trim() || !password) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        })
        if (error) throw error
        if (!data.session) {
          setNotice('Check your email for a confirmation link, then sign in.')
          setMode('signin')
          return
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (error) throw error
      }
      await migrateLocalToCloud()
      router.push('/')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const inputClass =
    'w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-neutral-600 outline-none focus:border-fuchsia-400/60 focus:ring-2 focus:ring-fuchsia-500/20 transition-[border-color,box-shadow] duration-150'

  return (
    <main className="min-h-screen relative overflow-hidden flex items-center justify-center p-4">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 w-[720px] h-[480px] rounded-full opacity-25 blur-3xl"
        style={{ background: 'radial-gradient(ellipse at center, #7c3aed 0%, #ec4899 45%, transparent 70%)' }}
      />

      <div className="fade-up relative bg-[#17171f] border border-white/10 rounded-3xl shadow-2xl w-full max-w-md p-8">
        <div className="w-14 h-14 rounded-2xl grad-bg flex items-center justify-center text-2xl mb-5 shadow-lg shadow-fuchsia-500/25">
          🎬
        </div>
        <h1 className="text-xl font-bold text-white mb-1" style={{ textWrap: 'balance' }}>
          {mode === 'signin' ? 'Welcome back' : 'Create your account'}
        </h1>
        <p className="text-sm text-neutral-400 mb-6" style={{ textWrap: 'pretty' }}>
          {mode === 'signin'
            ? 'Sign in to access your scripts anywhere'
            : 'Your scripts will be saved to your account'}
        </p>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-xl px-4 py-3 mb-4">
            {error}
          </div>
        )}
        {notice && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm rounded-xl px-4 py-3 mb-4">
            {notice}
          </div>
        )}

        <label className="block text-xs font-medium text-neutral-500 mb-1.5">Email</label>
        <input
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className={`${inputClass} mb-4`}
        />
        <label className="block text-xs font-medium text-neutral-500 mb-1.5">Password</label>
        <input
          type="password"
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          placeholder={mode === 'signup' ? 'At least 6 characters' : '••••••••'}
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          className={inputClass}
        />

        <button
          onClick={submit}
          disabled={busy || !email.trim() || !password}
          className="pressable w-full grad-bg text-white text-sm font-medium rounded-xl py-3 mt-6 hover:brightness-110 disabled:opacity-40 shadow-lg shadow-fuchsia-500/20"
        >
          {busy ? 'Please wait…' : mode === 'signin' ? 'Sign In' : 'Create Account'}
        </button>

        <p className="text-sm text-neutral-500 text-center mt-5">
          {mode === 'signin' ? (
            <>
              No account?{' '}
              <button onClick={() => { setMode('signup'); setError(null) }} className="text-white font-medium hover:underline">
                Create one
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button onClick={() => { setMode('signin'); setError(null) }} className="text-white font-medium hover:underline">
                Sign in
              </button>
            </>
          )}
        </p>

      </div>
    </main>
  )
}
