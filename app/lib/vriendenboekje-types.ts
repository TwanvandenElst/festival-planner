// Shared types for the "Vriendenboekje" feature. Kept separate from
// vriendenboekje.ts so that module can stay a pure "use server" file.
//
// Question set v2 (migration 0011): identity (naam, dj_naam, foto_url,
// telefoonnummer) + the open questions below + two kept stellingen. Legacy
// columns (ontmoet, dancefloor, dans_*, beschamend, … stelling_gekust/beland,
// afsluiting) still exist in the table for old entries but are no longer part
// of the form or this payload.

/** Payload the form sends to the insert server action. All questions but
 *  `naam` are optional/skippable, so everything else is nullable. */
export type VriendenboekjeInput = {
  naam: string
  dj_naam: string | null
  snack: string | null
  eerste_indruk: string | null
  guilty_pleasure: string | null
  bijnaam: string | null
  jeugdheld: string | null
  dilemma: string | null
  stopwoordje: string | null
  meezingen: string | null
  onthoud_mij: string | null
  stelling_afterparty: boolean | null
  stelling_afterparty_toelichting: string | null
  stelling_festivaldag: boolean | null
  stelling_festivaldag_toelichting: string | null
  foto_url: string | null
  telefoonnummer: string | null
}

/** A saved row from the `vriendenboekjes` table. */
export type Vriendenboekje = VriendenboekjeInput & {
  id: string
  created_at: string
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
  { key: 'snack', label: 'Beschrijf jezelf als een snack', text: e => e.snack },
  { key: 'eerste_indruk', label: 'Wat was/is je eerste indruk van mij?', text: e => e.eerste_indruk },
  {
    key: 'stelling_afterparty',
    label: 'De afterparty is altijd beter dan het festival zelf',
    text: e => e.stelling_afterparty_toelichting,
    stelling: e => e.stelling_afterparty,
  },
  { key: 'guilty_pleasure', label: 'Wat is je guilty pleasure?', text: e => e.guilty_pleasure },
  { key: 'bijnaam', label: 'Grappigste bijnaam gekregen of gegeven?', text: e => e.bijnaam },
  {
    key: 'stelling_festivaldag',
    label: 'Ik ken mensen beter na één festivaldag dan na een jaar normaal contact',
    text: e => e.stelling_festivaldag_toelichting,
    stelling: e => e.stelling_festivaldag,
  },
  { key: 'jeugdheld', label: 'Jouw jeugdheld?', text: e => e.jeugdheld },
  {
    key: 'dilemma',
    label: 'Weten wanneer je dood gaat of weten hoe je dood gaat?',
    text: e => e.dilemma,
  },
  { key: 'stopwoordje', label: 'Jouw stopwoordje?', text: e => e.stopwoordje },
  { key: 'meezingen', label: 'Welk nummer zing jij volle borst mee?', text: e => e.meezingen },
  {
    key: 'onthoud_mij',
    label: 'Als je één ding wilt dat ik over jou onthoudt, wat is het?',
    text: e => e.onthoud_mij,
  },
]
