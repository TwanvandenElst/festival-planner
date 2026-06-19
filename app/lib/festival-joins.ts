'use server'

import { revalidatePath } from 'next/cache'

import { supabase } from './supabase'
import { sendTelegramMessage, escapeHtml } from './telegram'

// Dutch month abbreviations for the notification date, e.g. "10-12 jul 2026".
const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

function formatRange(start: string, end: string | null): string {
  const [sy, sm, sd] = start.split('-').map(Number)
  if (!end || end === start) return `${sd} ${MONTHS[sm - 1]} ${sy}`
  const [ey, em, ed] = end.split('-').map(Number)
  if (sy === ey && sm === em) return `${sd}-${ed} ${MONTHS[sm - 1]} ${sy}`
  if (sy === ey) return `${sd} ${MONTHS[sm - 1]} – ${ed} ${MONTHS[em - 1]} ${sy}`
  return `${sd} ${MONTHS[sm - 1]} ${sy} – ${ed} ${MONTHS[em - 1]} ${ey}`
}

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

  // Best-effort Telegram notification — never blocks/breaks the join.
  const { data: fest } = await supabase
    .from('festivals')
    .select('name, start_date, end_date')
    .eq('id', festivalId)
    .single()
  if (fest) {
    const when = formatRange(fest.start_date as string, (fest.end_date as string | null) ?? null)
    await sendTelegramMessage(
      `🎉 ${escapeHtml(name)} wants to join ${escapeHtml(fest.name as string)} (${escapeHtml(when)})!`,
    )
  }

  revalidatePath('/festivals/share')
  revalidatePath('/shows')
  return { ok: true, name }
}

/** All joins grouped by festival id (id + name), in join order. */
export async function getJoinsByFestival(): Promise<Record<string, { id: string; name: string }[]>> {
  const { data, error } = await supabase
    .from('festival_joins')
    .select('id, festival_id, name, created_at')
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

  const { error } = await supabase.from('festival_joins').delete().eq('id', joinId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/shows')
  revalidatePath('/festivals/share')
  return { ok: true }
}
