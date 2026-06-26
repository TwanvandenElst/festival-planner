'use server'

import { revalidatePath } from 'next/cache'

import { supabase } from './supabase'
import { createClient } from './supabase/server'
import { reactionKey } from './vriendenboekje-types'
import type { Vriendenboekje, VriendenboekjeInput } from './vriendenboekje-types'

/** Trim a string, returning null when it's empty (for nullable columns). */
function nullable(v: string | null | undefined): string | null {
  const t = (v ?? '').trim()
  return t.length > 0 ? t : null
}

/**
 * Entries filled in for a specific host (the logged-in owner's book), newest
 * first. Scoped by `host_user_id` — the public-read RLS returns all rows, so the
 * filter is what isolates one host's entries.
 */
export async function getVriendenboekjesForHost(hostUserId: string): Promise<Vriendenboekje[]> {
  if (!hostUserId) return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('vriendenboekjes')
    .select('*')
    .eq('host_user_id', hostUserId)
    .order('created_at', { ascending: false })

  if (error) return []
  return (data ?? []) as Vriendenboekje[]
}

/**
 * 😂 reaction counts for the given entries, keyed by
 * `reactionKey(entry_id, field_name)`. Scoped to the host's entry ids so counts
 * don't leak across books. Returns {} for no ids / missing reactions table.
 */
export async function getReactionCounts(entryIds: string[]): Promise<Record<string, number>> {
  if (entryIds.length === 0) return {}
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('vriendenboekje_reactions')
    .select('entry_id, field_name')
    .in('entry_id', entryIds)

  if (error || !data) return {}

  const counts: Record<string, number> = {}
  for (const r of data as { entry_id: string; field_name: string }[]) {
    const key = reactionKey(r.entry_id, r.field_name)
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}

/**
 * Validates and inserts a new vriendenboekje (anon insert via RLS). The entry is
 * filed under `hostUserId` — the owner of the share link the visitor used, NOT
 * the visitor — so it shows up in that host's overview.
 */
export async function submitVriendenboekje(
  input: VriendenboekjeInput,
  hostUserId: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const naam = (input.naam ?? '').trim()
  if (!naam) return { ok: false, error: 'Vul je naam in.' }
  if (!hostUserId) return { ok: false, error: 'Onbekend vriendenboekje.' }

  // Question set v2: only `naam` is required — every other question is skippable
  // and nullable. Legacy columns are omitted (they default to null in the table).
  const row = {
    naam,
    host_user_id: hostUserId,
    dj_naam: nullable(input.dj_naam),
    snack: nullable(input.snack),
    eerste_indruk: nullable(input.eerste_indruk),
    guilty_pleasure: nullable(input.guilty_pleasure),
    bijnaam: nullable(input.bijnaam),
    jeugdheld: nullable(input.jeugdheld),
    dilemma: nullable(input.dilemma),
    dilemma_toelichting: nullable(input.dilemma_toelichting),
    stopwoordje: nullable(input.stopwoordje),
    meezingen: nullable(input.meezingen),
    seksstandje: nullable(input.seksstandje),
    onthoud_mij: nullable(input.onthoud_mij),
    stelling_afterparty: input.stelling_afterparty,
    stelling_afterparty_toelichting: nullable(input.stelling_afterparty_toelichting),
    stelling_festivaldag: input.stelling_festivaldag,
    stelling_festivaldag_toelichting: nullable(input.stelling_festivaldag_toelichting),
    foto_url: nullable(input.foto_url),
    telefoonnummer: nullable(input.telefoonnummer),
  }

  const { data, error } = await supabase
    .from('vriendenboekjes')
    .insert(row)
    .select('id')
    .single()

  if (error || !data) {
    // Surface the real Postgres/PostgREST error in the server logs for debugging.
    // A missing migration shows up here as PGRST204 ("Could not find the 'X'
    // column …") or a not-null / RLS violation.
    console.error('submitVriendenboekje insert failed:', {
      code: error?.code,
      message: error?.message,
      details: error?.details,
      hint: error?.hint,
    })
    return { ok: false, error: 'Kon je vriendenboekje niet opslaan. Probeer het opnieuw.' }
  }

  revalidatePath('/vriendenboekje')
  return { ok: true, id: data.id as string }
}
