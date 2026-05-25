import { createBrowserClient } from '@supabase/ssr'

const PLACEHOLDER_URL = 'https://placeholder.supabase.co'
const PLACEHOLDER_KEY = 'placeholder-key'

function isValidUrl(s: string | undefined): boolean {
  if (!s) return false
  try {
    const u = new URL(s)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

// Singleton — one client instance per browser session.
// Multiple instances each register their own auth listeners; when one
// refreshes the token the others can fire onAuthStateChange(null) and
// sign the user out. A single shared instance avoids this entirely.
let _client: ReturnType<typeof createBrowserClient> | null = null

// Note: once your Supabase project is created, regenerate types with:
//   npx supabase gen types typescript --project-id YOUR_ID > src/types/database.ts
export function createClient() {
  if (!_client) {
    const url = isValidUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)
      ? process.env.NEXT_PUBLIC_SUPABASE_URL!
      : PLACEHOLDER_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || PLACEHOLDER_KEY
    _client = createBrowserClient(url, key)
  }
  return _client
}
