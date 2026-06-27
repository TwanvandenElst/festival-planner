'use server'

import webpush from 'web-push'

import { createAdminClient } from './supabase/admin'

// Configure web-push once with the VAPID details. Returns false (and warns) if
// any of the env vars are missing, so callers can no-op instead of crashing —
// push is always best-effort and must never break the surrounding action.
let configured = false
function configureWebPush(): boolean {
  if (configured) return true

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT

  if (!publicKey || !privateKey || !subject) {
    console.warn(
      '[push] NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY or VAPID_SUBJECT not set — skipping push.',
    )
    return false
  }

  webpush.setVapidDetails(subject, publicKey, privateKey)
  configured = true
  return true
}

/**
 * Sends a web-push notification to every device subscribed by `userId`.
 * Best-effort: swallows errors, and prunes subscriptions the push service
 * reports as gone (404/410). Reads/deletes via the service-role client because
 * callers (cron scraper, public share page) have no user session.
 */
export async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  url: string = '/',
): Promise<void> {
  if (!userId) return
  if (!configureWebPush()) return

  const admin = createAdminClient()

  const { data: subs, error } = await admin
    .from('push_subscriptions')
    .select('id, subscription')
    .eq('user_id', userId)

  if (error) {
    console.error('[push] failed to load subscriptions:', error.message)
    return
  }
  if (!subs || subs.length === 0) return

  const payload = JSON.stringify({ title, body, url })

  await Promise.all(
    subs.map(async row => {
      try {
        await webpush.sendNotification(
          row.subscription as webpush.PushSubscription,
          payload,
        )
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        // 404 Not Found / 410 Gone → the subscription is dead; remove it.
        if (status === 404 || status === 410) {
          await admin.from('push_subscriptions').delete().eq('id', row.id)
        } else {
          console.error('[push] send failed:', status, (err as Error).message)
        }
      }
    }),
  )
}
