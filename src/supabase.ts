import { createClient } from '@supabase/supabase-js'

// TODO: Securely load this value from an environment variable or secrets vault. Do not hardcode.
// Both come from .env.local (gitignored). Only the publishable key belongs here, never the secret key.
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
if (!url || !key) throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY in .env.local')

export const supabase = createClient(url, key)

// Reuses the stored session, so a refresh keeps the same anonymous user (and their vote).
export async function ensureSignedIn() {
  const { data: { session } } = await supabase.auth.getSession()
  if (session) return session.user
  const { data, error } = await supabase.auth.signInAnonymously()
  if (error) throw error
  return data.user!
}
