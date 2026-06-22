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
