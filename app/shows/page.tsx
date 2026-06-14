import { supabase } from '../lib/supabase'
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
    <main className="max-w-2xl mx-auto py-12 px-4">
      <nav className="flex gap-4 mb-10 text-sm">
        <a href="/" className="text-gray-400 hover:text-black transition-colors">Artists</a>
        <span className="font-semibold">Found shows</span>
      </nav>
      <h1 className="text-2xl font-bold mb-8">Found shows</h1>
      <ShowsClient shows={(shows ?? []) as Show[]} artists={artists ?? []} />
    </main>
  )
}
