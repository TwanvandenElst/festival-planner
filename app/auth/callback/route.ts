import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Magic-link landing route. Supabase's email link verifies the token and
 * redirects here with `?code=...`; we exchange that code for a session (setting
 * the auth cookies) and forward the user to `next` (the artists home by default).
 *
 * The PKCE code verifier lives in the cookies set by the browser client during
 * signInWithOtp, so this works when the link is opened in the same browser that
 * requested it.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // No code, or the exchange failed — bounce back to login with a flag.
  return NextResponse.redirect(`${origin}/login?error=auth`)
}
