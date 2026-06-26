import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * OAuth + magic-link landing route. The provider (Google) / email link verifies
 * the user and redirects here with `?code=...`; we exchange that code for a
 * session and forward to `next` (the artists home by default).
 *
 * IMPORTANT: the auth cookies must be written onto the redirect response we
 * return. Cookies set through `next/headers` cookies() do NOT attach to a
 * manually-built NextResponse.redirect in a Route Handler — that dropped the
 * session and caused an /auth/callback → / → /login redirect loop. So we build
 * the redirect response up front and let the SSR client set cookies on it.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // Only allow internal paths for `next` (avoid open-redirects).
  const nextParam = searchParams.get('next')
  const next = nextParam && nextParam.startsWith('/') ? nextParam : '/'

  // ── DEBUG: what actually arrived at the callback ──────────────────────────
  const cookieNames = request.cookies.getAll().map(c => c.name)
  console.error('[auth/callback] hit', {
    fullUrl: request.url,
    origin,
    hasCode: !!code,
    oauthError: searchParams.get('error'),
    oauthErrorDescription: searchParams.get('error_description'),
    cookieNames,
    hasVerifierCookie: cookieNames.some(n => n.includes('code-verifier')),
    hasAuthCookie: cookieNames.some(n => n.includes('auth-token')),
  })

  if (!code) {
    console.error('[auth/callback] missing ?code — token likely came back in the URL #hash (implicit flow) or the provider returned an error above')
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  // The response we'll return on success — the auth cookies get written here.
  const response = NextResponse.redirect(`${origin}${next}`)

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          // Includes the PKCE code-verifier cookie set by the browser client
          // during signInWithOAuth / signInWithOtp.
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    console.error('[auth/callback] exchangeCodeForSession failed:', error.message)
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`)
  }

  // Session cookies are on `response`; the browser stores them and the next
  // request to `next` passes the proxy's auth check.
  return response
}
