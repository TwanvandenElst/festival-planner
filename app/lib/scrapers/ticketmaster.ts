import { supabase } from '../supabase'
import type { Scraper, ScrapedShow } from './types'

const API_BASE      = 'https://app.ticketmaster.com/discovery/v2'
const SOURCE_SITE   = 'ticketmaster'
const COUNTRY       = 'NL'
const DELAY_MS      = 300                 // polite spacing between requests
const MAX_ATTEMPTS  = 3                   // total tries per request
const RETRY_BASE_MS = 500                 // exponential backoff base for 429 / network

// ── Response shapes (only the fields we map) ──────────────────────────────────

type TmAttraction = {
  id: string
  name: string
  url?: string
  upcomingEvents?: Record<string, number>   // e.g. { _total: 3, NL: 1 }
}

type TmAttractionsResponse = {
  _embedded?: { attractions?: TmAttraction[] }
}

type TmVenue = {
  name?: string
  city?: { name?: string }
  country?: { name?: string; countryCode?: string }
}

type TmEvent = {
  name?: string
  url?: string
  dates?: { start?: { localDate?: string } }
  _embedded?: { venues?: TmVenue[] }
}

type TmEventsResponse = {
  _embedded?: { events?: TmEvent[] }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function upcomingTotal(a: TmAttraction): number {
  return a.upcomingEvents?._total ?? 0
}

type TmResult<T> = { status: number; data: T | null }

/**
 * GET a Discovery endpoint as JSON. The apikey is attached here so call sites
 * never handle (or log) it. Retries up to MAX_ATTEMPTS on HTTP 429 and network
 * errors with exponential backoff (honouring Retry-After when present).
 */
async function tmGet<T>(
  endpoint: string,
  params: Record<string, string>,
  label: string,
): Promise<TmResult<T>> {
  const apikey = process.env.TICKETMASTER_API_KEY ?? ''
  const qs = new URLSearchParams({ ...params, apikey })
  const url = `${API_BASE}/${endpoint}?${qs.toString()}`

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url)

      if (res.ok) {
        return { status: res.status, data: (await res.json()) as T }
      }

      // Rate limited → back off and retry while attempts remain.
      if (res.status === 429 && attempt < MAX_ATTEMPTS) {
        const retryAfter = Number(res.headers.get('retry-after'))
        const backoff =
          Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : RETRY_BASE_MS * 2 ** (attempt - 1)
        console.log(
          `[ticketmaster] ${label}: HTTP 429, retry ${attempt + 1}/${MAX_ATTEMPTS} after ${backoff}ms…`,
        )
        await sleep(backoff)
        continue
      }

      // Any other non-2xx (or 429 on the last attempt) is terminal.
      return { status: res.status, data: null }
    } catch (err) {
      if (attempt < MAX_ATTEMPTS) {
        const backoff = RETRY_BASE_MS * 2 ** (attempt - 1)
        console.log(
          `[ticketmaster] ${label}: network error, retry ${attempt + 1}/${MAX_ATTEMPTS} after ${backoff}ms…`,
        )
        await sleep(backoff)
        continue
      }
      console.error(`[ticketmaster] ${label}: network error after ${MAX_ATTEMPTS} attempt(s):`, err)
      return { status: 0, data: null }
    }
  }

  return { status: 0, data: null }
}

/**
 * Pick the attraction for a followed artist: prefer an exact case-insensitive
 * name match; otherwise the candidate with the most upcoming events.
 */
function pickAttraction(name: string, attractions: TmAttraction[]): TmAttraction | null {
  if (attractions.length === 0) return null

  const exact = attractions.find(a => a.name.toLowerCase() === name.toLowerCase())
  if (exact) return exact

  return attractions.reduce(
    (best, a) => (upcomingTotal(a) > upcomingTotal(best) ? a : best),
    attractions[0],
  )
}

// ── Scraper ───────────────────────────────────────────────────────────────────

export const ticketmasterScraper: Scraper = {
  name: SOURCE_SITE,

  async scrape(): Promise<ScrapedShow[]> {
    if (!process.env.TICKETMASTER_API_KEY) {
      console.error('[ticketmaster] TICKETMASTER_API_KEY not set — skipping.')
      return []
    }

    // ── 1. Fetch followed artists ─────────────────────────────────────────────
    const { data: artists, error: artistsError } = await supabase
      .from('artists')
      .select('name')

    if (artistsError) {
      console.error(`[ticketmaster] Failed to fetch artists: ${artistsError.message}`)
      return []
    }
    if (!artists || artists.length === 0) {
      console.log('[ticketmaster] No followed artists — nothing to do.')
      return []
    }

    let attractionsFound = 0
    let attractionsNotFound = 0
    let nlEventsFound = 0
    const shows: ScrapedShow[] = []

    let firstRequest = true
    async function politeWait(): Promise<void> {
      if (firstRequest) { firstRequest = false; return }
      await sleep(DELAY_MS)
    }

    // ── 2. Per artist: search attraction, then fetch its NL events ─────────────
    for (const artist of artists) {
      // a. Attraction search
      await politeWait()
      const search = await tmGet<TmAttractionsResponse>(
        'attractions.json',
        { keyword: artist.name, countryCode: COUNTRY },
        `search "${artist.name}"`,
      )

      if (search.data === null) {
        attractionsNotFound++
        console.warn(`[ticketmaster] "${artist.name}": search failed (HTTP ${search.status}), skipping`)
        continue
      }

      const attraction = pickAttraction(artist.name, search.data._embedded?.attractions ?? [])
      if (!attraction) {
        attractionsNotFound++
        console.log(`[ticketmaster] "${artist.name}": no attraction match, skipping`)
        continue
      }

      attractionsFound++
      console.log(
        `[ticketmaster] "${artist.name}" → attraction ${attraction.id} ` +
        `("${attraction.name}", upcoming _total=${upcomingTotal(attraction)})`,
      )

      // b. Upcoming NL events for that attraction
      await politeWait()
      const eventsRes = await tmGet<TmEventsResponse>(
        'events.json',
        { attractionId: attraction.id, countryCode: COUNTRY },
        `events "${artist.name}"`,
      )

      if (eventsRes.data === null) {
        console.warn(`[ticketmaster] "${artist.name}": events fetch failed (HTTP ${eventsRes.status})`)
        continue
      }

      const events = eventsRes.data._embedded?.events ?? []

      // c. Map each NL event to a ScrapedShow
      let artistShows = 0
      for (const ev of events) {
        const venue = ev._embedded?.venues?.[0]
        if (venue?.country?.countryCode?.toUpperCase() !== COUNTRY) continue

        nlEventsFound++

        const date = ev.dates?.start?.localDate
        if (!date) {
          console.warn(`[ticketmaster] "${artist.name}": NL event "${ev.name ?? '?'}" has no date, skipping`)
          continue
        }

        shows.push({
          artistName: artist.name,
          date,
          venue:      venue.name ?? '',
          city:       venue.city?.name ?? '',
          sourceUrl:  ev.url ?? '',
          sourceSite: SOURCE_SITE,
        })
        artistShows++
      }

      console.log(`[ticketmaster] "${artist.name}": ${artistShows} NL show(s)`)
    }

    // ── 3. Summary ────────────────────────────────────────────────────────────
    console.log(`[ticketmaster] Artists checked: ${artists.length}`)
    console.log(`[ticketmaster] Attractions found: ${attractionsFound}, not found: ${attractionsNotFound}`)
    console.log(`[ticketmaster] NL events found: ${nlEventsFound}`)
    console.log(`[ticketmaster] ScrapedShows produced: ${shows.length}`)

    return shows
  },
}
