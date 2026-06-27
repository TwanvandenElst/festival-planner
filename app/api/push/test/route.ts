import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { sendPushNotification } from '@/lib/push'

// Always run fresh — this reads the caller's session.
export const dynamic = 'force-dynamic'
// Force Node.js so server-only env vars (SUPABASE_SERVICE_ROLE_KEY, etc.) are
// always available (route handlers default to nodejs, but be explicit).
export const runtime = 'nodejs'

/**
 * TEMP debug endpoint: sends a test web push to the logged-in user. Open it in
 * the installed PWA (so the auth cookies are sent) at /api/push/test. The actual
 * delivery result shows in the [push] server logs. Remove once push is verified.
 */
export async function GET() {
  console.log('[push] test endpoint hit')

  // Diagnostic: which env vars are visible in this runtime (presence only, never
  // the secret values). Tells us definitively if SUPABASE_SERVICE_ROLE_KEY is
  // actually reachable in the deployment.
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: !!process.env.VAPID_PRIVATE_KEY,
    VAPID_SUBJECT: !!process.env.VAPID_SUBJECT,
  }
  console.log('[push] env presence:', env)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ ok: false, error: 'Not signed in.', env }, { status: 401 })
  }

  console.log('[push] /api/push/test invoked for userId', user.id)

  // Surface the real error so it shows up in the toast (and logs). Normally
  // sendPushNotification is best-effort, but configureWebPush()/createAdminClient()
  // can throw synchronously on missing env — that's what we want to see.
  try {
    await sendPushNotification(
      user.id,
      '🔔 Test push',
      'Manual test from /api/push/test',
      '/shows',
    )
  } catch (err) {
    console.error('[push] test error:', err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err), env },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true, userId: user.id, env })
}
