'use server'

import { createClient } from './supabase/server'

/**
 * Saves a browser PushSubscription for the signed-in user. Called from the
 * notifications prompt after the user grants permission and the browser returns
 * a subscription. Idempotent: the unique(user_id, subscription) constraint means
 * re-subscribing the same device is ignored rather than duplicated.
 */
export async function savePushSubscription(
  subscription: unknown,
): Promise<{ ok: boolean; error?: string }> {
  if (!subscription) return { ok: false, error: 'Missing subscription.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      { user_id: user.id, subscription },
      { onConflict: 'user_id,subscription', ignoreDuplicates: true },
    )

  if (error) {
    console.error('[push] savePushSubscription failed:', error.message)
    return { ok: false, error: error.message }
  }
  return { ok: true }
}
