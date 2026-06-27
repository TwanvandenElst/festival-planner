import { supabase } from '../supabase'
import { createAdminClient } from '../supabase/admin'
import { sendTelegramMessage, escapeHtml } from '../telegram'
import { sendPushNotification } from '../push'
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

/**
 * Normalizes an artist name for matching: lowercase, strip punctuation/accents
 * noise, and collapse whitespace. Tolerates casing and punctuation differences
 * between a followed artist's stored name and how lineups spell it
 * (e.g. "Anyma!" vs "anyma", "Tale Of Us" vs "tale of us").
 */
function normalizeArtist(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Formats one newly inserted show as a Telegram HTML message block. */
function formatShowNotification(show: ScrapedShow): string {
  const date = new Date(show.date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC', // date is "YYYY-MM-DD"; avoid a local-tz day shift
  })
  return (
    `🎵 <b>${escapeHtml(show.artistName)}</b>\n` +
    `📅 ${escapeHtml(date)}\n` +
    `🎪 ${escapeHtml(show.venue)}\n` +
    `📍 ${escapeHtml(show.city)}\n` +
    `🔗 <a href="${escapeHtml(show.sourceUrl)}">View event</a>`
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
 * Web-push every user who follows an artist that just got a newly inserted show.
 * Best-effort. Reads `user_artists` (artist → followers) with the service-role
 * client because the scraper/cron runs without a user session.
 */
async function notifyFollowersOfShows(
  items: { show: ScrapedShow; artistId: string }[],
): Promise<void> {
  console.log(`[push] notifyFollowersOfShows called with ${items.length} new shows`)
  if (items.length === 0) return

  const admin = createAdminClient()
  const artistIds = [...new Set(items.map(i => i.artistId))]
  const { data: follows, error } = await admin
    .from('user_artists')
    .select('user_id, artist_id')
    .in('artist_id', artistIds)

  if (error) {
    console.error('[push] failed to load followers:', error.message)
    return
  }
  if (!follows || follows.length === 0) return

  // artist_id → [user_id, …]
  const followersByArtist = new Map<string, string[]>()
  for (const f of follows as { user_id: string; artist_id: string }[]) {
    const list = followersByArtist.get(f.artist_id) ?? []
    list.push(f.user_id)
    followersByArtist.set(f.artist_id, list)
  }

  for (const { show, artistId } of items) {
    const userIds = followersByArtist.get(artistId) ?? []
    const date = new Date(show.date).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    })
    for (const userId of userIds) {
      await sendPushNotification(
        userId,
        `🎵 ${show.artistName} added to a lineup`,
        `${show.venue}, ${show.city} — ${date}`,
        '/shows',
      )
    }
  }
}

/**
 * Runs every scraper and stores matched shows.
 * Pass `{ artistName }` to narrow matching/insertion to a single followed
 * artist (used by the auto-scrape-on-add flow). The scrapers themselves still
 * run in full; only this artist's shows are matched and stored.
 */
export async function runScrapers(
  options?: { artistName?: string; only?: string[]; exclude?: string[] },
): Promise<OrchestratorResult> {
  // Optionally narrow which scrapers run (by name). Used to split slow sites
  // (festileaks) into their own cron so each invocation fits the 60s limit.
  let active = scrapers
  if (options?.only) active = active.filter(s => options.only!.includes(s.name))
  if (options?.exclude) active = active.filter(s => !options.exclude!.includes(s.name))

  // 1. Collect all scraped shows. Run scrapers in PARALLEL so wall-time is the
  //    slowest single scraper (not the sum), and isolate each one: a site that
  //    blocks/errors yields [] instead of aborting the whole run.
  const scraped = await Promise.all(
    active.map(async scraper => {
      try {
        return await scraper.scrape()
      } catch (err) {
        console.error(`[scrapers] ${scraper.name} failed:`, err instanceof Error ? err.message : err)
        return [] as ScrapedShow[]
      }
    }),
  )
  const allShows: ScrapedShow[] = scraped.flat()

  // 2. Fetch followed artists (optionally narrowed to a single one)
  const { data: artists, error: artistsError } = await supabase
    .from('artists')
    .select('id, name')

  if (artistsError) throw new Error(`Failed to fetch artists: ${artistsError.message}`)

  const filterName = options?.artistName ? normalizeArtist(options.artistName) : undefined
  const followed = filterName
    ? (artists ?? []).filter(a => normalizeArtist(a.name) === filterName)
    : (artists ?? [])

  if (followed.length === 0) {
    return { totalScraped: allShows.length, matched: 0, inserted: 0, merged: 0, skipped: 0, shows: [] }
  }

  // 3. Match scraped shows against followed artists (normalized name match)
  const artistMap = new Map(followed.map(a => [normalizeArtist(a.name), a.id as string]))
  const matched = allShows.filter(s => artistMap.has(normalizeArtist(s.artistName)))

  if (matched.length === 0) {
    return { totalScraped: allShows.length, matched: 0, inserted: 0, merged: 0, skipped: 0, shows: [] }
  }

  // 4. Fetch existing shows for matched artists, keyed by fuzzy event identity
  //    (artist_id + date + first significant word of the venue/title).
  const matchedArtistIds = [
    ...new Set(matched.map(s => artistMap.get(normalizeArtist(s.artistName))!)),
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
  // Same inserted shows, tagged with their artist_id for follower push.
  const insertedWithArtist: { show: ScrapedShow; artistId: string }[] = []

  for (const show of matched) {
    const artistId = artistMap.get(normalizeArtist(show.artistName))!
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
      insertedWithArtist.push({ show, artistId })
      // Track in-memory so later shows in this same run merge instead of dup.
      existing.set(key, { id: row.id, sources })
    }
  }

  // 6. Notify (best-effort): Telegram digest to the owner + a web push to each
  //    user who follows a freshly added artist.
  console.log('[scraper] insertedShows count:', insertedShows.length)
  console.log('[scraper] insertedWithArtist count:', insertedWithArtist.length)
  await notifyNewShows(insertedShows)
  await notifyFollowersOfShows(insertedWithArtist)

  return {
    totalScraped: allShows.length,
    matched: matched.length,
    inserted,
    merged,
    skipped,
    shows: insertedShows,
  }
}
