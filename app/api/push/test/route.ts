import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { sendPushNotification } from '@/lib/push'

// Always run fresh — this reads the caller's session.
export const dynamic = 'force-dynamic'

/**
 * TEMP debug endpoint: sends a test web push to the logged-in user. Open it in
 * the installed PWA (so the auth cookies are sent) at /api/push/test. The actual
 * delivery result shows in the [push] server logs. Remove once push is verified.
 */
export async function GET() {
  console.log('[push] test endpoint hit')

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ ok: false, error: 'Not signed in.' }, { status: 401 })
  }

  console.log('[push] /api/push/test invoked for userId', user.id)

  // Surface the real error so it shows up in the toast (and logs). Normally
  // sendPushNotification is best-effort, but configureWebPush() can throw
  // synchronously on malformed VAPID env values — that's what we want to see.
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
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true, userId: user.id })
}
