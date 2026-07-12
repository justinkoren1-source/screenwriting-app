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

  return (
    <main className="min-h-screen bg-neutral-50 flex items-center justify-center p-4">
      <div className="bg-white border border-neutral-200 rounded-2xl shadow-sm w-full max-w-md p-8">
        <h1 className="text-xl font-semibold text-neutral-900 mb-1">
          {mode === 'signin' ? 'Welcome back' : 'Create your account'}
        </h1>
        <p className="text-sm text-neutral-400 mb-6">
          {mode === 'signin'
            ? 'Sign in to access your scripts anywhere'
            : 'Your scripts will be saved to your account'}
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
            {error}
          </div>
        )}
        {notice && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg px-4 py-3 mb-4">
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
          className="w-full border border-neutral-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-neutral-400 mb-4"
        />
        <label className="block text-xs font-medium text-neutral-500 mb-1.5">Password</label>
        <input
          type="password"
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          placeholder={mode === 'signup' ? 'At least 6 characters' : '••••••••'}
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          className="w-full border border-neutral-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-neutral-400"
        />

        <button
          onClick={submit}
          disabled={busy || !email.trim() || !password}
          className="w-full bg-neutral-900 text-white text-sm rounded-lg py-2.5 mt-6 hover:bg-neutral-700 disabled:opacity-40 transition-colors"
        >
          {busy ? 'Please wait…' : mode === 'signin' ? 'Sign In' : 'Create Account'}
        </button>

        <p className="text-sm text-neutral-400 text-center mt-5">
          {mode === 'signin' ? (
            <>
              No account?{' '}
              <button onClick={() => { setMode('signup'); setError(null) }} className="text-neutral-900 font-medium hover:underline">
                Create one
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button onClick={() => { setMode('signin'); setError(null) }} className="text-neutral-900 font-medium hover:underline">
                Sign in
              </button>
            </>
          )}
        </p>

        <p className="text-xs text-neutral-300 text-center mt-6">
          <button onClick={() => router.push('/')} className="hover:text-neutral-500 transition-colors">
            ← Continue without an account
          </button>
        </p>
      </div>
    </main>
  )
}
