import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Resolves the display name of an inviter for the public /invite/[userId] page.
 * Reads auth.users raw_user_meta_data->>'full_name' via the service-role client
 * (an anonymous visitor has no session). Falls back to "A friend" when the
 * user doesn't exist or has no name set.
 */
export async function getInviterName(userId: string): Promise<string> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.auth.admin.getUserById(userId)
    if (error || !data.user) {
      console.error('[invite] getUserById failed', { userId, error })
      return 'A friend'
    }
    const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>
    // Surface what's actually present so we can confirm which key OAuth used.
    console.log('[invite] user_metadata keys', { userId, keys: Object.keys(meta) })

    // Google OAuth stores the display name under "full_name" or "name".
    const fullName = typeof meta.full_name === 'string' ? meta.full_name.trim() : ''
    const name = typeof meta.name === 'string' ? meta.name.trim() : ''
    return fullName || name || 'A friend'
  } catch (err) {
    console.error('[invite] getInviterName threw', err)
    return 'A friend'
  }
}
