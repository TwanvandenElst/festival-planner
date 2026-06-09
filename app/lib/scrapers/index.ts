import { supabase } from '../supabase'
import { fakeScraper } from './fake'
import type { Scraper, ScrapedShow } from './types'

const scrapers: Scraper[] = [fakeScraper]

export type OrchestratorResult = {
  totalScraped: number
  matched: number
  inserted: number
  skipped: number
  shows: ScrapedShow[]
}

export async function runScrapers(): Promise<OrchestratorResult> {
  // 1. Collect all scraped shows
  const allShows: ScrapedShow[] = []
  for (const scraper of scrapers) {
    const shows = await scraper.scrape()
    allShows.push(...shows)
  }

  // 2. Fetch followed artists
  const { data: artists, error: artistsError } = await supabase
    .from('artists')
    .select('id, name')

  if (artistsError) throw new Error(`Failed to fetch artists: ${artistsError.message}`)

  if (!artists || artists.length === 0) {
    return { totalScraped: allShows.length, matched: 0, inserted: 0, skipped: 0, shows: [] }
  }

  // 3. Match scraped shows against followed artists (case-insensitive)
  const artistMap = new Map(artists.map(a => [a.name.toLowerCase().trim(), a.id as string]))
  const matched = allShows.filter(s => artistMap.has(s.artistName.toLowerCase().trim()))

  if (matched.length === 0) {
    return { totalScraped: allShows.length, matched: 0, inserted: 0, skipped: 0, shows: [] }
  }

  // 4. Fetch existing shows for matched artists to deduplicate
  const matchedArtistIds = [
    ...new Set(matched.map(s => artistMap.get(s.artistName.toLowerCase().trim())!)),
  ]
  const { data: existingShows } = await supabase
    .from('shows')
    .select('artist_id, date, source_url')
    .in('artist_id', matchedArtistIds)

  const existingKeys = new Set(
    (existingShows ?? []).map(s => `${s.artist_id}|${s.date}|${s.source_url}`)
  )

  // 5. Insert new (non-duplicate) matched shows
  let inserted = 0
  let skipped = 0
  const insertedShows: ScrapedShow[] = []

  for (const show of matched) {
    const artistId = artistMap.get(show.artistName.toLowerCase().trim())!
    const key = `${artistId}|${show.date}|${show.sourceUrl}`

    if (existingKeys.has(key)) {
      skipped++
      continue
    }

    const { error } = await supabase.from('shows').insert({
      artist_id: artistId,
      date: show.date,
      venue: show.venue,
      city: show.city,
      source_url: show.sourceUrl,
      source_site: show.sourceSite,
    })

    if (!error) {
      inserted++
      existingKeys.add(key) // prevent duplicates within this same run
      insertedShows.push(show)
    }
  }

  return {
    totalScraped: allShows.length,
    matched: matched.length,
    inserted,
    skipped,
    shows: insertedShows,
  }
}
