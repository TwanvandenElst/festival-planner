// Shared types for the festivals feature. Kept separate from festivals.ts so
// that module can stay a pure "use server" file (only async exports allowed).

/** Attendance status for a saved festival. */
export type FestivalStatus = 'tickets_gekocht' | 'in_optie' | 'wishlist'

/**
 * A result in the "Add festival" picker. `city`/`url` are optional because the
 * manual-add path only carries a name + date.
 */
export type FestivalSearchResult = {
  name: string
  date: string
  city?: string
  url?: string
  source: 'library' | 'ra.co' | 'manual'
}

/** A saved festival row from the `festivals` table. */
export type Festival = {
  id: string
  name: string
  start_date: string
  end_date: string | null
  status: FestivalStatus
  rating: number | null
  location: string | null
  url: string | null
  source: string | null
  external_id: string | null
  created_at: string
}
