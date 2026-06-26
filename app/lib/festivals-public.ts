import { createAdminClient } from './supabase/admin'
import type { Festival } from './festivals-types'

/**
 * Public read helpers for /festivals/share/[userId]. These run with the
 * service-role client (RLS bypassed) because the visitor is anonymous, so every
 * query MUST filter by the target `userId` explicitly.
 *
 * Not a `'use server'` module: these are called from the server component
 * directly and should not be exposed as client-callable server actions.
 */

/** A host's festivals, soonest first. Empty for an unknown/empty userId. */
export async function getFestivalsForUser(userId: string): Promise<Festival[]> {
  if (!userId) return []

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('festivals')
    .select('*')
    .eq('user_id', userId)
    .order('start_date', { ascending: true })

  if (error) {
    console.error('[festivals-public] getFestivalsForUser failed:', error.message)
    return []
  }
  return (data ?? []) as Festival[]
}

/**
 * Joins for a host's festivals, grouped by festival id (id + name, in join
 * order). Scoped to the host via an inner join on festivals.user_id.
 */
export async function getJoinsForUserFestivals(
  userId: string,
): Promise<Record<string, { id: string; name: string }[]>> {
  if (!userId) return {}

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('festival_joins')
    .select('id, festival_id, name, created_at, festivals!inner(user_id)')
    .eq('festivals.user_id', userId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[festivals-public] getJoinsForUserFestivals failed:', error.message)
    return {}
  }

  const map: Record<string, { id: string; name: string }[]> = {}
  for (const row of (data ?? []) as { id: string; festival_id: string; name: string }[]) {
    ;(map[row.festival_id] ??= []).push({ id: row.id, name: row.name })
  }
  return map
}
