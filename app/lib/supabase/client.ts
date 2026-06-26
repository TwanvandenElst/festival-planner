import { createBrowserClient } from '@supabase/ssr'

/**
 * Supabase client for use in Client Components ("use client").
 *
 * Stores the session in cookies (not localStorage) so the server can read it
 * too. `createBrowserClient` returns a singleton per (url, key), so calling this
 * repeatedly across components is safe and won't spawn multiple auth clients.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
