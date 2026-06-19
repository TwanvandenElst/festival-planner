import { supabase } from '@/lib/supabase'
import { getMyFestivals } from '@/lib/festivals'
import { getJoinsByFestival } from '@/lib/festival-joins'
import ShowsClient from './ShowsClient'
import FestivalsSection from './FestivalsSection'

// Festivals are user-editable; always reflect the latest state.
export const dynamic = 'force-dynamic'

type Show = {
  id: string
  artist_id: string
  date: string
  venue: string
  city: string
  source_url: string
  source_site: string
  sources: string[]
  found_at: string
  artists: { name: string } | null
}

export default async function ShowsPage() {
  const [{ data: shows }, { data: artists }, festivals, joins] = await Promise.all([
    supabase.from('shows').select('*, artists(name)').order('date', { ascending: true }),
    supabase.from('artists').select('id, name').order('name', { ascending: true }),
    getMyFestivals(),
    getJoinsByFestival(),
  ])

  // Computed once on the server (request time) so the festivals section renders
  // identically on SSR and client hydration (avoids a date-rollover mismatch).
  const today = new Date().toISOString().slice(0, 10)

  // Lightweight shows for festival↔artist matching in the festivals section.
  const showMatches = ((shows ?? []) as Show[]).map(s => ({
    artistName: s.artists?.name ?? '',
    venue: s.venue,
    date: s.date,
  }))

  return (
    <div className="mx-auto w-full max-w-5xl space-y-14 px-4 py-10">
      <section>
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">My Festivals</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Festivals you&apos;re attending. Search below to add one.
          </p>
        </header>
        <FestivalsSection initialFestivals={festivals} today={today} shows={showMatches} joins={joins} />
      </section>

      <section>
        <header className="mb-6">
          <h2 className="text-xl font-semibold tracking-tight">Found shows</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Every show matched for your followed artists.
          </p>
        </header>
        <ShowsClient shows={(shows ?? []) as Show[]} artists={artists ?? []} />
      </section>
    </div>
  )
}
