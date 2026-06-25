'use server'

import { revalidatePath } from 'next/cache'

import { supabase } from './supabase'
import { reactionKey } from './vriendenboekje-types'
import type { Vriendenboekje, VriendenboekjeInput } from './vriendenboekje-types'

/** Trim a string, returning null when it's empty (for nullable columns). */
function nullable(v: string | null | undefined): string | null {
  const t = (v ?? '').trim()
  return t.length > 0 ? t : null
}

/** All entries, newest first (public read). */
export async function getVriendenboekjes(): Promise<Vriendenboekje[]> {
  const { data, error } = await supabase
    .from('vriendenboekjes')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return []
  return (data ?? []) as Vriendenboekje[]
}

/**
 * 😂 reaction counts per answer, keyed by `reactionKey(entry_id, field_name)`.
 * Aggregated in JS (single-user app — the table stays small). Returns an empty
 * map if the reactions table doesn't exist yet (migration 0010 not applied).
 */
export async function getReactionCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('vriendenboekje_reactions')
    .select('entry_id, field_name')

  if (error || !data) return {}

  const counts: Record<string, number> = {}
  for (const r of data as { entry_id: string; field_name: string }[]) {
    const key = reactionKey(r.entry_id, r.field_name)
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}

/** Validates and inserts a new vriendenboekje (anon insert via RLS). */
export async function submitVriendenboekje(
  input: VriendenboekjeInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const naam = (input.naam ?? '').trim()
  if (!naam) return { ok: false, error: 'Vul je naam in.' }

  // Question set v2: only `naam` is required — every other question is skippable
  // and nullable. Legacy columns are omitted (they default to null in the table).
  const row = {
    naam,
    dj_naam: nullable(input.dj_naam),
    snack: nullable(input.snack),
    eerste_indruk: nullable(input.eerste_indruk),
    guilty_pleasure: nullable(input.guilty_pleasure),
    bijnaam: nullable(input.bijnaam),
    jeugdheld: nullable(input.jeugdheld),
    dilemma: nullable(input.dilemma),
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
