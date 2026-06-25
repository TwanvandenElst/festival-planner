// Shared types for the "Vriendenboekje" feature. Kept separate from
// vriendenboekje.ts so that module can stay a pure "use server" file.

export type Dancefloor = 'front' | 'back' | 'bar'
export type NaarHuis = 'voor_middernacht' | 'als_muziek_stopt' | 'wat_is_naar_huis'

/** Payload the form sends to the insert server action. */
export type VriendenboekjeInput = {
  naam: string
  dj_naam: string | null
  ontmoet: string
  eerste_indruk: string
  beschamend: string | null
  seksstandje: string | null
  laatste_google: string | null
  ja_zeggen: string | null
  dancefloor: Dancefloor
  naar_huis: NaarHuis
  dans_zelf: number
  dans_denkt: number
  stelling_afterparty: boolean | null
  stelling_afterparty_toelichting: string | null
  stelling_gekust: boolean | null
  stelling_gekust_toelichting: string | null
  stelling_festivaldag: boolean | null
  stelling_festivaldag_toelichting: string | null
  stelling_beland: boolean | null
  stelling_beland_toelichting: string | null
  afsluiting: string | null
  foto_url: string | null
  telefoonnummer: string | null
}

/** A saved row from the `vriendenboekjes` table. */
export type Vriendenboekje = VriendenboekjeInput & {
  id: string
  created_at: string
}

export const DANCEFLOOR_LABEL: Record<Dancefloor, string> = {
  front: 'Front',
  back: 'Back',
  bar: 'Bar',
}

export const NAAR_HUIS_LABEL: Record<NaarHuis, string> = {
  voor_middernacht: 'Voor middernacht',
  als_muziek_stopt: 'Als de muziek stopt',
  wat_is_naar_huis: 'Wat is naar huis gaan',
}

/** Stable key for a reaction bucket (one entry's answer to one question). */
export function reactionKey(entryId: string, fieldName: string) {
  return `${entryId}::${fieldName}`
}

/**
 * One reactable question+answer pair. `key` is the `field_name` stored in
 * `vriendenboekje_reactions`. The detail page renders these as chat bubbles (in
 * this order) and the feed surfaces the most-reacted ones. `text` returns the
 * answer body (null hides the bubble); when `stelling` is set the answer is an
 * eens/oneens pill and `text` is the optional toelichting.
 */
export type VbField = {
  key: string
  label: string
  text: (e: Vriendenboekje) => string | null
  stelling?: (e: Vriendenboekje) => boolean | null
}

export const VRIENDENBOEKJE_FIELDS: VbField[] = [
  { key: 'ontmoet', label: 'Hoe we elkaar ontmoetten', text: e => e.ontmoet },
  { key: 'eerste_indruk', label: 'Eerste indruk van mij', text: e => e.eerste_indruk },
  { key: 'dancefloor', label: 'Front / back / bar', text: e => DANCEFLOOR_LABEL[e.dancefloor] },
  { key: 'naar_huis', label: 'Naar huis', text: e => NAAR_HUIS_LABEL[e.naar_huis] },
  {
    key: 'dans',
    label: 'Dansen (zelf vs. denkt)',
    text: e => `${e.dans_zelf}/10 · denkt ${e.dans_denkt}/10`,
  },
  { key: 'beschamend', label: 'Meest beschamende festivalmoment', text: e => e.beschamend },
  { key: 'seksstandje', label: 'Favoriete seksstandje', text: e => e.seksstandje },
  { key: 'laatste_google', label: 'Laatste Google', text: e => e.laatste_google },
  { key: 'ja_zeggen', label: "'Ja' zeggen op iets stoms", text: e => e.ja_zeggen },
  {
    key: 'stelling_afterparty',
    label: 'De afterparty is altijd beter dan het festival zelf',
    text: e => e.stelling_afterparty_toelichting,
    stelling: e => e.stelling_afterparty,
  },
  {
    key: 'stelling_gekust',
    label: 'Weleens iemand gekust van wie de naam onbekend was',
    text: e => e.stelling_gekust_toelichting,
    stelling: e => e.stelling_gekust,
  },
  {
    key: 'stelling_festivaldag',
    label: 'Kent mensen beter na één festivaldag',
    text: e => e.stelling_festivaldag_toelichting,
    stelling: e => e.stelling_festivaldag,
  },
  {
    key: 'stelling_beland',
    label: 'Weet niet meer hoe hier beland',
    text: e => e.stelling_beland_toelichting,
    stelling: e => e.stelling_beland,
  },
  { key: 'afsluiting', label: 'Onthoud dit over mij', text: e => e.afsluiting },
]
