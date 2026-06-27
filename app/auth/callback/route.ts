import { createServerClient } from '@supabase/ssr'
import type { EmailOtpType } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * OAuth + magic-link landing route. Two flows arrive here:
 *
 *  1. OAuth (Google / GitHub): provider redirects back with `?code=...`, which
 *     we trade for a session via PKCE `exchangeCodeForSession`.
 *  2. Magic link (email): the email template sends `?token_hash=...&type=...`,
 *     which we verify with `verifyOtp`. This deliberately does NOT use the PKCE
 *     `?code` flow — that needs a `code-verifier` cookie from the same browser,
 *     so it breaks when the link opens in a mail app's in-app browser, on a
 *     different device, or after a link-scanner pre-fetches it. `verifyOtp`
 *     needs no such cookie and works across browsers/devices.
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
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  // Only allow internal paths for `next` (avoid open-redirects).
  const nextParam = searchParams.get('next')
  const next = nextParam && nextParam.startsWith('/') ? nextParam : '/'

  // ── DEBUG: what actually arrived at the callback ──────────────────────────
  const cookieNames = request.cookies.getAll().map(c => c.name)
  console.error('[auth/callback] hit', {
    fullUrl: request.url,
    origin,
    hasCode: !!code,
    hasTokenHash: !!tokenHash,
    type,
    oauthError: searchParams.get('error'),
    oauthErrorDescription: searchParams.get('error_description'),
    cookieNames,
    hasVerifierCookie: cookieNames.some(n => n.includes('code-verifier')),
    hasAuthCookie: cookieNames.some(n => n.includes('auth-token')),
  })

  if (!code && !(tokenHash && type)) {
    console.error('[auth/callback] no ?code and no ?token_hash&type — the email template may still point at the implicit/PKCE link, or the provider returned an error above')
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
          // during signInWithOAuth (OAuth flow only).
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

  // Magic link (email): verify the token hash — no code-verifier cookie needed.
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (error) {
      console.error('[auth/callback] verifyOtp failed:', error.message)
      return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`)
    }
    return response
  }

  // OAuth (Google / GitHub): exchange the PKCE code for a session.
  const { error } = await supabase.auth.exchangeCodeForSession(code!)
  if (error) {
    console.error('[auth/callback] exchangeCodeForSession failed:', error.message)
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`)
  }

  // Session cookies are on `response`; the browser stores them and the next
  // request to `next` passes the proxy's auth check.
  return response
}
