'use server'

import { revalidatePath } from 'next/cache'

import { supabase } from './supabase'
import { reactionKey } from './vriendenboekje-types'
import type {
  Dancefloor,
  NaarHuis,
  Vriendenboekje,
  VriendenboekjeInput,
} from './vriendenboekje-types'

const DANCEFLOORS: Dancefloor[] = ['front', 'back', 'bar']
const NAAR_HUIS: NaarHuis[] = ['voor_middernacht', 'als_muziek_stopt', 'wat_is_naar_huis']

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

  if (!DANCEFLOORS.includes(input.dancefloor)) {
    return { ok: false, error: 'Kies een plek op de dancefloor.' }
  }
  if (!NAAR_HUIS.includes(input.naar_huis)) {
    return { ok: false, error: 'Kies hoe laat je naar huis gaat.' }
  }

  const dansZelf = Number(input.dans_zelf)
  const dansDenkt = Number(input.dans_denkt)
  const inRange = (n: number) => Number.isInteger(n) && n >= 1 && n <= 10
  if (!inRange(dansZelf) || !inRange(dansDenkt)) {
    return { ok: false, error: 'Dans-scores moeten tussen 1 en 10 liggen.' }
  }

  const ontmoet = nullable(input.ontmoet)
  const eersteIndruk = nullable(input.eerste_indruk)
  if (!ontmoet) return { ok: false, error: 'Vertel hoe we elkaar ontmoet hebben.' }
  if (!eersteIndruk) return { ok: false, error: 'Wat was je eerste indruk?' }

  const row = {
    naam,
    dj_naam: nullable(input.dj_naam),
    ontmoet,
    eerste_indruk: eersteIndruk,
    // The four "spicy" questions are optional (nullable per migration 0009).
    beschamend: nullable(input.beschamend),
    seksstandje: nullable(input.seksstandje),
    laatste_google: nullable(input.laatste_google),
    ja_zeggen: nullable(input.ja_zeggen),
    dancefloor: input.dancefloor,
    naar_huis: input.naar_huis,
    dans_zelf: dansZelf,
    dans_denkt: dansDenkt,
    stelling_afterparty: input.stelling_afterparty,
    stelling_afterparty_toelichting: nullable(input.stelling_afterparty_toelichting),
    stelling_gekust: input.stelling_gekust,
    stelling_gekust_toelichting: nullable(input.stelling_gekust_toelichting),
    stelling_festivaldag: input.stelling_festivaldag,
    stelling_festivaldag_toelichting: nullable(input.stelling_festivaldag_toelichting),
    stelling_beland: input.stelling_beland,
    stelling_beland_toelichting: nullable(input.stelling_beland_toelichting),
    afsluiting: nullable(input.afsluiting),
    foto_url: nullable(input.foto_url),
    telefoonnummer: nullable(input.telefoonnummer),
  }

  const { data, error } = await supabase
    .from('vriendenboekjes')
    .insert(row)
    .select('id')
    .single()

  if (error || !data) {
    // Surface the real Postgres/PostgREST error in the server logs for debugging
    // (e.g. a missing migration shows up as a not-null / RLS violation here).
    console.error('submitVriendenboekje insert failed:', error)
    return { ok: false, error: 'Kon je vriendenboekje niet opslaan. Probeer het opnieuw.' }
  }

  revalidatePath('/vriendenboekje')
  return { ok: true, id: data.id as string }
}
