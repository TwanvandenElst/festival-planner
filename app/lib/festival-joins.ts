'use server'

import { revalidatePath } from 'next/cache'

import { supabase } from './supabase'
import { createAdminClient } from './supabase/admin'
import { createClient } from './supabase/server'
// import { sendTelegramMessage, escapeHtml } from './telegram' // disabled: using push instead
import { sendPushNotification } from './push'

// Month abbreviations for the notification date, e.g. "10-12 jul 2026".
// Disabled along with the Telegram join notification below; kept for re-enabling.
// const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

// function formatRange(start: string, end: string | null): string {
//   const [sy, sm, sd] = start.split('-').map(Number)
//   if (!end || end === start) return `${sd} ${MONTHS[sm - 1]} ${sy}`
//   const [ey, em, ed] = end.split('-').map(Number)
//   if (sy === ey && sm === em) return `${sd}-${ed} ${MONTHS[sm - 1]} ${sy}`
//   if (sy === ey) return `${sd} ${MONTHS[sm - 1]} – ${ed} ${MONTHS[em - 1]} ${sy}`
//   return `${sd} ${MONTHS[sm - 1]} ${sy} – ${ed} ${MONTHS[em - 1]} ${ey}`
// }

/**
 * Adds a public "join" to a festival (from the share page). Validates the name,
 * inserts the row, and sends a best-effort Telegram notification.
 */
export async function joinFestival(
  festivalId: string,
  rawName: string,
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const name = rawName.trim()
  if (!festivalId) return { ok: false, error: 'Missing festival.' }
  if (!name) return { ok: false, error: 'Please enter your name.' }
  if (name.length > 80) return { ok: false, error: 'That name is too long.' }

  const { error } = await supabase.from('festival_joins').insert({ festival_id: festivalId, name })
  if (error) return { ok: false, error: error.message }

  // Best-effort Telegram notification — never blocks/breaks the join. The
  // festival is owner-only under RLS, so read it with the admin client (the
  // joiner is anonymous on the public share page).
  const { data: fest } = await createAdminClient()
    .from('festivals')
    .select('name, start_date, end_date, user_id')
    .eq('id', festivalId)
    .single()
  if (fest) {
    // const when = formatRange(fest.start_date as string, (fest.end_date as string | null) ?? null)
    // await sendTelegramMessage( // disabled: using push instead
    //   `🎉 ${escapeHtml(name)} wants to join ${escapeHtml(fest.name as string)} (${escapeHtml(when)})!`,
    // )

    // Push the festival owner (best-effort) that someone joined their lineup.
    const ownerId = fest.user_id as string | null
    if (ownerId) {
      await sendPushNotification(
        ownerId,
        'Someone wants to join you! 🎪',
        `${name} wants to join ${fest.name as string}`,
        '/shows',
      )
    }
  }

  revalidatePath('/festivals/share/[userId]', 'page')
  revalidatePath('/shows')
  return { ok: true, name }
}

/**
 * Joins for the LOGGED-IN user's festivals only, grouped by festival id
 * (id + name), in join order. `festival_joins` is publicly readable (allow-all
 * RLS), so we must scope it explicitly: the `festivals!inner(user_id)` embed +
 * `eq('festivals.user_id', …)` filters to joins on the caller's own festivals.
 */
export async function getJoinsByFestival(): Promise<Record<string, { id: string; name: string }[]>> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return {}

  const { data, error } = await supabase
    .from('festival_joins')
    .select('id, festival_id, name, created_at, festivals!inner(user_id)')
    .eq('festivals.user_id', user.id)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[festival-joins] getJoinsByFestival failed:', error.message)
    return {}
  }

  const map: Record<string, { id: string; name: string }[]> = {}
  for (const row of (data ?? []) as { id: string; festival_id: string; name: string }[]) {
    ;(map[row.festival_id] ??= []).push({ id: row.id, name: row.name })
  }
  return map
}

/** Removes a single join by id (admin action from /shows; not on the share page). */
export async function removeFestivalJoin(joinId: string): Promise<{ ok: boolean; error?: string }> {
  if (!joinId) return { ok: false, error: 'Missing join id.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  // The delete policy on festival_joins is allow-all, so verify the join belongs
  // to one of the caller's own festivals before deleting it.
  const { data: owned } = await supabase
    .from('festival_joins')
    .select('id, festivals!inner(user_id)')
    .eq('id', joinId)
    .eq('festivals.user_id', user.id)
    .maybeSingle()
  if (!owned) return { ok: false, error: 'Not found.' }

  const { error } = await supabase.from('festival_joins').delete().eq('id', joinId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/shows')
  revalidatePath('/festivals/share/[userId]', 'page')
  return { ok: true }
}
