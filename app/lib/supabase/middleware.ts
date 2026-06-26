import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Routes that require a logged-in user. Everything else (login, auth callback,
 * the public vriendenboekje form/overview, the public /festivals/share page,
 * API/cron routes) stays public.
 *
 * The artists list lives at `/` (there is no `/artists` index route), so `/`
 * itself is protected, plus the artist profile pages under `/artists/...`.
 */
function isProtected(pathname: string): boolean {
  if (pathname === '/') return true
  return ['/artists', '/shows'].some(p => pathname === p || pathname.startsWith(`${p}/`))
}

/**
 * Keeps the Supabase session cookie fresh on every request, then enforces route
 * protection: unauthenticated users on a protected route are sent to /login, and
 * logged-in users who hit /login are sent back to the app. Run from the root
 * proxy (`proxy.ts`).
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
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Not logged in on a protected route → send to login.
  if (!user && isProtected(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    return NextResponse.redirect(url)
  }

  // Already logged in but sitting on /login → bounce into the app.
  if (user && pathname.startsWith('/login')) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
