/**
 * Throwaway exploration script — NOT part of the app, not imported anywhere.
 * Phase A: probe the Ticketmaster Discovery API (official REST, no scraping) to
 * learn how to map its responses onto our ScrapedShow shape.
 *
 * Reads TICKETMASTER_API_KEY from .env.local (loaded via dotenv below).
 *
 * Run with:
 *   npx tsx scripts/explore-ticketmaster.ts
 */

import { config } from 'dotenv'

// A plain tsx run doesn't load .env.local the way Next.js does, so load it
// explicitly. The key never gets printed.
config({ path: '.env.local' })

const API_KEY = process.env.TICKETMASTER_API_KEY
const BASE = 'https://app.ticketmaster.com/discovery/v2'

// ── Minimal response shapes (only the fields we care about) ───────────────────

type TmAttraction = {
  id: string
  name: string
  url?: string
  upcomingEvents?: Record<string, number> // e.g. { _total: 3, NL: 1, ... }
}

type TmVenue = {
  name?: string
  city?: { name?: string }
  country?: { name?: string; countryCode?: string }
  state?: { name?: string; stateCode?: string }
}

type TmEvent = {
  name: string
  url?: string
  dates?: { start?: { localDate?: string; dateTime?: string } }
  _embedded?: { venues?: TmVenue[]; attractions?: { name?: string }[] }
}

type AttractionsResponse = {
  _embedded?: { attractions?: TmAttraction[] }
  page?: { totalElements?: number }
}

type EventsResponse = {
  _embedded?: { events?: TmEvent[] }
  page?: { totalElements?: number }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sep(char = '─', len = 72) {
  console.log(char.repeat(len))
}

function sleep(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms))
}

/** GET a Discovery endpoint. apikey is added here so call sites never see it. */
async function tmGet<T>(
  endpoint: string,
  params: Record<string, string>,
): Promise<{ data: T | null; status: number; error?: string }> {
  const qs = new URLSearchParams({ ...params, apikey: API_KEY ?? '' })
  try {
    const res = await fetch(`${BASE}/${endpoint}?${qs.toString()}`)
    if (!res.ok) {
      const body = await res.text()
      return { data: null, status: res.status, error: body.slice(0, 300) }
    }
    return { data: (await res.json()) as T, status: res.status }
  } catch (err) {
    return { data: null, status: 0, error: String(err) }
  }
}

// ── 1. Attraction search (artist-first) ───────────────────────────────────────

async function searchAttraction(name: string): Promise<TmAttraction[]> {
  console.log(`\nAttraction search: "${name}"`)
  const { data, status, error } = await tmGet<AttractionsResponse>('attractions.json', {
    keyword: name,
    countryCode: 'NL',
  })

  if (error) {
    console.log(`  ✗ HTTP ${status}: ${error}`)
    return []
  }

  const attractions = data?._embedded?.attractions ?? []
  console.log(`  totalElements=${data?.page?.totalElements ?? 0}, showing top 3:`)

  const top3 = attractions.slice(0, 3)
  top3.forEach((a, i) => {
    const upcoming = a.upcomingEvents?._total ?? '?'
    console.log(`  [${i}] id=${a.id}`)
    console.log(`      name:     ${a.name}`)
    console.log(`      url:      ${a.url ?? '(none)'}`)
    console.log(`      upcoming: ${upcoming} (upcomingEvents._total)`)
  })
  if (top3.length === 0) console.log('  (no attractions returned)')

  return attractions
}

/** Prefer an exact case-insensitive name match, else fall back to the first. */
function pickBestMatch(name: string, attractions: TmAttraction[]): TmAttraction | null {
  if (attractions.length === 0) return null
  const exact = attractions.find(a => a.name.toLowerCase() === name.toLowerCase())
  return exact ?? attractions[0]
}

// ── 2. Events for an attraction ───────────────────────────────────────────────

async function fetchEvents(attraction: TmAttraction): Promise<void> {
  console.log(`\nEvents for best match: "${attraction.name}" (id=${attraction.id}, countryCode=NL)`)
  const { data, status, error } = await tmGet<EventsResponse>('events.json', {
    attractionId: attraction.id,
    countryCode: 'NL',
  })

  if (error) {
    console.log(`  ✗ HTTP ${status}: ${error}`)
    return
  }

  const events = data?._embedded?.events ?? []
  console.log(`  totalElements=${data?.page?.totalElements ?? 0}, listing ${events.length}:`)

  if (events.length === 0) {
    console.log('  (no upcoming NL events for this attraction right now)')
    return
  }

  events.forEach((ev, i) => {
    const venue = ev._embedded?.venues?.[0]
    console.log(`  [${i}] ${ev.name}`)
    console.log(`      date:    ${ev.dates?.start?.localDate ?? '(none)'}  (dateTime=${ev.dates?.start?.dateTime ?? 'n/a'})`)
    console.log(`      venue:   ${venue?.name ?? '(none)'}`)
    console.log(`      city:    ${venue?.city?.name ?? '(none)'}`)
    console.log(`      country: ${venue?.country?.name ?? '(none)'} (${venue?.country?.countryCode ?? '?'})`)
    console.log(`      url:     ${ev.url ?? '(none)'}`)
  })
}

// ── 3. Field-path report ──────────────────────────────────────────────────────

function reportFieldPaths(): void {
  sep('═')
  console.log('\nFIELD PATH MAP → ScrapedShow\n')
  console.log('  artistName ← attraction.name   (the matched attraction we searched for)')
  console.log('               also at: event._embedded.attractions[].name')
  console.log('  date       ← event.dates.start.localDate            ("YYYY-MM-DD")')
  console.log('  venue      ← event._embedded.venues[0].name')
  console.log('  city       ← event._embedded.venues[0].city.name')
  console.log('  sourceUrl  ← event.url')
  console.log('  (country)  ← event._embedded.venues[0].country.name / .countryCode  (filter to NL)')
  console.log('  sourceSite = "ticketmaster" (constant)')
}

// ── 4. DEBUG: Marlon Hoffstadt events WITHOUT the countryCode filter ──────────
// He shows 5 upcoming events but our NL filter yields 0. Fetch his events with
// NO countryCode param and print each venue's full country/state info, so we
// can see whether the events are simply non-NL or use an unexpected code.

const MARLON_ATTRACTION_ID = 'K8vZ917jKe0'

async function debugMarlonNoCountryFilter(): Promise<void> {
  console.log(`\nMarlon Hoffstadt events (id=${MARLON_ATTRACTION_ID}) — NO countryCode filter`)
  const { data, status, error } = await tmGet<EventsResponse>('events.json', {
    attractionId: MARLON_ATTRACTION_ID,
  })

  if (error) {
    console.log(`  ✗ HTTP ${status}: ${error}`)
    return
  }

  const events = data?._embedded?.events ?? []
  console.log(`  totalElements=${data?.page?.totalElements ?? 0}, showing first 5:`)

  events.slice(0, 5).forEach((ev, i) => {
    const venue = ev._embedded?.venues?.[0]
    console.log(`  [${i}] ${ev.name}`)
    console.log(`      date:    ${ev.dates?.start?.localDate ?? '(none)'}`)
    console.log(`      venue:   ${venue?.name ?? '(none)'}`)
    console.log(`      city:    ${venue?.city?.name ?? '(none)'}`)
    console.log(`      country: name=${venue?.country?.name ?? '(none)'}  countryCode=${venue?.country?.countryCode ?? '?'}`)
    console.log(`      state:   name=${venue?.state?.name ?? '(none)'}  stateCode=${venue?.state?.stateCode ?? '?'}`)
  })
  if (events.length === 0) console.log('  (no events returned at all for this attraction)')
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Ticketmaster Discovery API exploration — Phase A')

  if (!API_KEY) {
    console.error('\n✗ TICKETMASTER_API_KEY not found in process.env (.env.local). Aborting.')
    process.exit(1)
  }
  console.log(`API key loaded: ${API_KEY.slice(0, 4)}… (${API_KEY.length} chars)`)

  sep('═')
  console.log('STEP 1 — Attraction search (top 3 per artist)')

  const adamResults = await searchAttraction('Adam Beyer')
  await sleep(300) // be polite between requests
  await searchAttraction('Marlon Hoffstadt')

  sep('═')
  console.log('\nSTEP 2 — Upcoming NL events for the best "Adam Beyer" match')

  const best = pickBestMatch('Adam Beyer', adamResults)
  if (!best) {
    console.log('  No attraction match for "Adam Beyer" — cannot fetch events.')
  } else {
    await sleep(300)
    await fetchEvents(best)
  }

  sep('═')
  console.log('\nSTEP 3 — DEBUG: Marlon Hoffstadt events without countryCode filter')

  await sleep(300)
  await debugMarlonNoCountryFilter()

  reportFieldPaths()

  sep()
  console.log('\n── Done ──')
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
