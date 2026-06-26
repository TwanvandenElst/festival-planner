import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Supabase client for the server: Server Components, Server Actions and Route
 * Handlers. Reads/writes the session through Next's request cookies so RLS sees
 * the logged-in user (`auth.uid()`).
 *
 * `cookies()` is async in Next 15+, so this helper is async — call it with
 * `const supabase = await createClient()`.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // `set` throws when called from a Server Component (cookies are
            // read-only there). Safe to ignore: the middleware refreshes the
            // session cookie on every request, so it stays current.
          }
        },
      },
    },
  )
}
