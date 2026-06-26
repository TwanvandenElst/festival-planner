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
  dilemma_toelichting: string | null
  stopwoordje: string | null
  meezingen: string | null
  seksstandje: string | null
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
  { key: 'snack', label: 'Describe yourself as a snack', text: e => e.snack },
  { key: 'eerste_indruk', label: 'What was/is your first impression of me?', text: e => e.eerste_indruk },
  {
    key: 'stelling_afterparty',
    label: 'The afterparty is always better than the festival itself',
    text: e => e.stelling_afterparty_toelichting,
    stelling: e => e.stelling_afterparty,
  },
  { key: 'guilty_pleasure', label: 'What is your guilty pleasure?', text: e => e.guilty_pleasure },
  { key: 'bijnaam', label: 'Funniest nickname you\'ve gotten or given?', text: e => e.bijnaam },
  {
    key: 'stelling_festivaldag',
    label: 'I know people better after one festival day than after a year of normal contact',
    text: e => e.stelling_festivaldag_toelichting,
    stelling: e => e.stelling_festivaldag,
  },
  { key: 'jeugdheld', label: 'Your childhood hero?', text: e => e.jeugdheld },
  {
    key: 'dilemma',
    label: 'Know when you\'ll die or know how you\'ll die?',
    text: e => [e.dilemma, e.dilemma_toelichting].filter(Boolean).join(' — ') || null,
  },
  { key: 'stopwoordje', label: 'Your catchphrase?', text: e => e.stopwoordje },
  { key: 'meezingen', label: 'Which song do you belt out at the top of your lungs?', text: e => e.meezingen },
  { key: 'seksstandje', label: 'What is your favorite sex position?', text: e => e.seksstandje },
  {
    key: 'onthoud_mij',
    label: 'If there\'s one thing you want me to remember about you, what is it?',
    text: e => e.onthoud_mij,
  },
]
