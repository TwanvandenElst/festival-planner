import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Keeps the Supabase session cookie fresh on every request and exposes the
 * current user. Run from the root `middleware.ts`.
 *
 * Phase 1B step 1: only refreshes the session (no redirects). Route protection
 * (redirecting unauthenticated users away from /artists, /shows, etc.) is added
 * in step 3 — the `user` is already resolved here so that's a small change.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // IMPORTANT: do not run any code between createServerClient and getUser().
  // getUser() revalidates the token and triggers the cookie refresh via setAll.
  await supabase.auth.getUser()

  return supabaseResponse
}
