import { supabase } from '../supabase'
import { sendTelegramMessage, escapeHtml } from '../telegram'
// import { fakeScraper } from './fake'  // keep for local testing; disabled in prod
import { raScraper } from './ra'
import { festivalinfoScraper } from './festivalinfo'
import { festileaksScraper } from './festileaks'
import { ticketmasterScraper } from './ticketmaster'
import type { Scraper, ScrapedShow } from './types'

const scrapers: Scraper[] = [
  raScraper,
  festivalinfoScraper,
  festileaksScraper,
  ticketmasterScraper,
  // fakeScraper,
]

export type OrchestratorResult = {
  totalScraped: number
  matched: number
  inserted: number
  merged: number
  skipped: number
  shows: ScrapedShow[]
}

// Noise words dropped when deriving a fuzzy event key.
// Mirrors the list in supabase/migrations/0003_sources.sql.
const NOISE_WORDS = new Set([
  'the', 'a', 'an', 'festival', 'fest', 'event', 'events', 'presents',
])

/**
 * Fuzzy event key: the first significant word of a normalized title.
 * Mirrors pg_temp.fuzzy_event_key() in migration 0003_sources.sql so the
 * orchestrator dedups exactly the way the migration did:
 *   lowercase -> strip punctuation -> drop pure-number tokens (years/editions)
 *   & noise words -> first remaining word ('' if none).
 *
 *   "Awakenings Summer Festival 2026" -> "awakenings"
 *   "Awakenings Festival 2026"        -> "awakenings"  (same event)
 */
export function normalize(raw: string | null | undefined): string {
  const words = (raw ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)

  for (const w of words) {
    if (/^[0-9]+$/.test(w)) continue   // pure numbers: years, editions
    if (NOISE_WORDS.has(w)) continue
    return w
  }
  return ''
}

/** Formats one newly inserted show as a Telegram HTML message block. */
function formatShowNotification(show: ScrapedShow): string {
  const datum = new Date(show.date).toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC', // date is "YYYY-MM-DD"; avoid a local-tz day shift
  })
  return (
    `🎵 <b>${escapeHtml(show.artistName)}</b>\n` +
    `📅 ${escapeHtml(datum)}\n` +
    `🎪 ${escapeHtml(show.venue)}\n` +
    `📍 ${escapeHtml(show.city)}\n` +
    `🔗 <a href="${escapeHtml(show.sourceUrl)}">Bekijk event</a>`
  )
}

/**
 * Notifies about newly inserted shows. 1–3 shows → one message each; more than
 * 3 → a single batched message to avoid spam. 0 shows → nothing sent.
 */
async function notifyNewShows(shows: ScrapedShow[]): Promise<void> {
  if (shows.length === 0) return

  if (shows.length > 3) {
    const header = `🎵 <b>${shows.length} nieuwe shows gevonden</b>`
    const body = shows.map(formatShowNotification).join('\n\n')
    await sendTelegramMessage(`${header}\n\n${body}`)
    return
  }

  for (const show of shows) {
    await sendTelegramMessage(formatShowNotification(show))
  }
}

/**
 * Runs every scraper and stores matched shows.
 * Pass `{ artistName }` to narrow matching/insertion to a single followed
 * artist (used by the auto-scrape-on-add flow). The scrapers themselves still
 * run in full; only this artist's shows are matched and stored.
 */
export async function runScrapers(
  options?: { artistName?: string },
): Promise<OrchestratorResult> {
  // 1. Collect all scraped shows
  const allShows: ScrapedShow[] = []
  for (const scraper of scrapers) {
    const shows = await scraper.scrape()
    allShows.push(...shows)
  }

  // 2. Fetch followed artists (optionally narrowed to a single one)
  const { data: artists, error: artistsError } = await supabase
    .from('artists')
    .select('id, name')

  if (artistsError) throw new Error(`Failed to fetch artists: ${artistsError.message}`)

  const filterName = options?.artistName?.toLowerCase().trim()
  const followed = filterName
    ? (artists ?? []).filter(a => a.name.toLowerCase().trim() === filterName)
    : (artists ?? [])

  if (followed.length === 0) {
    return { totalScraped: allShows.length, matched: 0, inserted: 0, merged: 0, skipped: 0, shows: [] }
  }

  // 3. Match scraped shows against followed artists (case-insensitive)
  const artistMap = new Map(followed.map(a => [a.name.toLowerCase().trim(), a.id as string]))
  const matched = allShows.filter(s => artistMap.has(s.artistName.toLowerCase().trim()))

  if (matched.length === 0) {
    return { totalScraped: allShows.length, matched: 0, inserted: 0, merged: 0, skipped: 0, shows: [] }
  }

  // 4. Fetch existing shows for matched artists, keyed by fuzzy event identity
  //    (artist_id + date + first significant word of the venue/title).
  const matchedArtistIds = [
    ...new Set(matched.map(s => artistMap.get(s.artistName.toLowerCase().trim())!)),
  ]
  const { data: existingShows } = await supabase
    .from('shows')
    .select('id, artist_id, date, venue, sources')
    .in('artist_id', matchedArtistIds)

  type Survivor = { id: string; sources: string[] }
  const existing = new Map<string, Survivor>()
  for (const s of existingShows ?? []) {
    const key = `${s.artist_id}|${s.date}|${normalize(s.venue)}`
    const sources = (s.sources as string[] | null) ?? []
    const current = existing.get(key)
    if (!current) {
      existing.set(key, { id: s.id, sources: [...sources] })
    } else {
      // Defensive: pre-existing rows sharing a fuzzy key fold into one survivor.
      for (const src of sources) {
        if (!current.sources.includes(src)) current.sources.push(src)
      }
    }
  }

  // 5. For each matched show: merge its source into the existing event, or
  //    insert a new event with sources = [source_site].
  let inserted = 0
  let merged = 0
  let skipped = 0
  const insertedShows: ScrapedShow[] = []

  for (const show of matched) {
    const artistId = artistMap.get(show.artistName.toLowerCase().trim())!
    const key = `${artistId}|${show.date}|${normalize(show.venue)}`
    const found = existing.get(key)

    if (found) {
      // Same event already tracked. Record this source if new; never insert.
      if (show.sourceSite && !found.sources.includes(show.sourceSite)) {
        const newSources = [...found.sources, show.sourceSite]
        const { error } = await supabase
          .from('shows')
          .update({ sources: newSources })
          .eq('id', found.id)
        if (!error) {
          found.sources = newSources
          merged++
        }
      } else {
        skipped++
      }
      continue
    }

    // New event → insert with sources seeded from this scrape's source.
    const sources = show.sourceSite ? [show.sourceSite] : []
    const { data: row, error } = await supabase
      .from('shows')
      .insert({
        artist_id: artistId,
        date: show.date,
        venue: show.venue,
        city: show.city,
        source_url: show.sourceUrl,
        source_site: show.sourceSite,
        sources,
      })
      .select('id')
      .single()

    if (!error && row) {
      inserted++
      insertedShows.push(show)
      // Track in-memory so later shows in this same run merge instead of dup.
      existing.set(key, { id: row.id, sources })
    }
  }

  // 6. Notify (best-effort) about newly inserted shows.
  await notifyNewShows(insertedShows)

  return {
    totalScraped: allShows.length,
    matched: matched.length,
    inserted,
    merged,
    skipped,
    shows: insertedShows,
  }
}
