import { createClient } from '@supabase/supabase-js'

// The publishable key is safe to expose — data access is enforced by
// row-level security on the server, not by hiding this key.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://renddlqjmkkvatqhpysr.supabase.co'
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'sb_publishable_DajDJOuuQPQxBvHKgS6AZw_zkC4DtmU'

export const supabase = createClient(url, key)
