import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://renddlqjmkkvatqhpysr.supabase.co'
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'sb_publishable_DajDJOuuQPQxBvHKgS6AZw_zkC4DtmU'

/**
 * A Supabase client scoped to a signed-in user's access token. Row-level
 * security is enforced with the user's identity, so this client can only ever
 * read or write that user's own rows — even inside a server route.
 */
export function supabaseForToken(token: string) {
  return createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
