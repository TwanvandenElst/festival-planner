import { supabase } from '@/lib/supabase'
import ShowsClient from './ShowsClient'

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
  const [{ data: shows }, { data: artists }] = await Promise.all([
    supabase.from('shows').select('*, artists(name)').order('date', { ascending: true }),
    supabase.from('artists').select('id, name').order('name', { ascending: true }),
  ])

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Found shows</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every show matched for your followed artists.
        </p>
      </header>
      <ShowsClient shows={(shows ?? []) as Show[]} artists={artists ?? []} />
    </div>
  )
}
