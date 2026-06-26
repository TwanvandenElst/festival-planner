import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Resolves the display name of an inviter for the public /invite/[userId] page.
 * Reads auth.users raw_user_meta_data->>'full_name' via the service-role client
 * (an anonymous visitor has no session). Falls back to "Een vriend" when the
 * user doesn't exist or has no name set.
 */
export async function getInviterName(userId: string): Promise<string> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.auth.admin.getUserById(userId)
    if (error || !data.user) return 'Een vriend'
    const meta = data.user.user_metadata as { full_name?: string } | null
    return meta?.full_name?.trim() || 'Een vriend'
  } catch {
    return 'Een vriend'
  }
}
