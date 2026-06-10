import * as cheerio from 'cheerio'
import { supabase } from '../supabase'
import type { Scraper, ScrapedShow } from './types'

const BASE_URL             = 'https://festileaks.com'
const SOURCE_SITE          = 'festileaks'
const DELAY_MS             = 1800   // between every request (artist + festival pages)
const MAX_FESTIVAL_FETCHES = 100
const MAX_ATTEMPTS         = 3
const RETRY_DELAYS_MS      = [1500, 3000] as const  // wait before attempt 2, then 3

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

// ── Types ─────────────────────────────────────────────────────────────────────

type LdAddress = {
  addressLocality?: string
  addressCountry?: string
}

type LdLocation = {
  name?: string
  address?: LdAddress
}

type LdFestival = {
  '@type'?: string
  '@id'?:   string
  name?:      string
  startDate?: string
  url?:       string
  location?:  LdLocation
}

type FestivalData = {
  name:      string
  startDate: string
  city:      string
  country:   string
  url:       string
}

type FestivalRow = {
  festivalName: string
  startDate:    string | null   // null = unknown format; include in work queue
  festivalUrl:  string
}

type PendingEntry = {
  artistName:   string
  festivalUrl:  string
  festivalName: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // strip combining diacritics (ö→o, é→e, â→a)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')      // drop punctuation except spaces and hyphens
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

const DUTCH_MONTHS: Record<string, string> = {
  januari: '01', februari: '02', maart: '03', april: '04',
  mei: '05', juni: '06', juli: '07', augustus: '08',
  september: '09', oktober: '10', november: '11', december: '12',
}

export function parseDutchDate(raw: string): string | null {
  const s = raw.toLowerCase().replace(/\s+/g, ' ').trim()

  const yearMatch = s.match(/\b(20\d{2})\b/)
  if (!yearMatch) return null

  let month: string | null = null
  for (const [name, num] of Object.entries(DUTCH_MONTHS)) {
    if (s.includes(name)) { month = num; break }
  }
  if (!month) return null

  // Handles "10", "10-12", "10 t/m 12", "10 en 12" — take the first day number
  const dayMatch = s.match(/\b(\d{1,2})\b/)
  if (!dayMatch) return null

  return `${yearMatch[1]}-${month}-${dayMatch[1].padStart(2, '0')}`
}

type FetchResult = { status: number; html: string } | null

async function fetchHtml(url: string): Promise<FetchResult> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8',
      },
    })
    const html = res.ok ? await res.text() : ''
    return { status: res.status, html }
  } catch (err) {
    console.error(`[festileaks] Network error fetching ${url}:`, err)
    return null
  }
}

// Retries on 404, 429, 5xx, or network error. Returns the final result
// plus how many extra attempts were needed (0 = succeeded on first try).
async function fetchWithRetry(
  url: string,
  label: string,
): Promise<{ result: FetchResult; retriesUsed: number }> {
  let lastResult: FetchResult = null

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    lastResult = await fetchHtml(url)

    const status = lastResult?.status ?? 0
    const ok     = status >= 200 && status < 300

    if (ok) return { result: lastResult, retriesUsed: attempt - 1 }
    if (attempt === MAX_ATTEMPTS) break

    const delay = RETRY_DELAYS_MS[attempt - 1]
    console.log(
      `[festileaks] ${label} ${lastResult ? `HTTP ${status}` : 'network error'}, ` +
      `retrying (attempt ${attempt + 1}/${MAX_ATTEMPTS}) after ${delay}ms…`,
    )
    await sleep(delay)
  }

  return { result: lastResult, retriesUsed: MAX_ATTEMPTS - 1 }
}

// ── Artist page parser ────────────────────────────────────────────────────────

function parseArtistPage(html: string): FestivalRow[] {
  const $ = cheerio.load(html)
  const rows: FestivalRow[] = []
  const seenUrls = new Set<string>()

  $('a[href*="/festival/"]').each((_, el) => {
    const href = $(el).attr('href') ?? ''
    // Only follow festival detail URLs: /festival/<slug>/<year>/
    if (!/\/festival\/[^/]+\/\d{4}\//.test(href)) return

    const url = (href.startsWith('http') ? href : `${BASE_URL}${href}`)
      .split('?')[0]  // strip any query string
    if (seenUrls.has(url)) return
    seenUrls.add(url)

    // Festival name may be inside the <a> itself, or in an ancestor container.
    // Check the link first; then walk up from .parent() so the node type stays
    // consistent (Cheerio<AnyNode>) throughout the loop.
    const nameInLink = $(el).find('h4').first().text().replace(/\s+/g, ' ').trim()

    let node = $(el).parent()
    for (let i = 0; i < 5; i++) {
      if (node.find('h4').length > 0) break
      node = node.parent()
    }

    const festivalName = nameInLink || node.find('h4').first().text().replace(/\s+/g, ' ').trim()
    if (!festivalName) return  // no name recoverable; skip

    const dateText  = node.find('span').first().text().replace(/\s+/g, ' ').trim()
    const startDate = parseDutchDate(dateText)
    if (!startDate) {
      console.warn(`[festileaks] Could not parse date "${dateText}" for "${festivalName}" — will still fetch festival page`)
    }

    rows.push({ festivalName, startDate, festivalUrl: url })
  })

  return rows
}

// ── Festival page parser (JSON-LD) ────────────────────────────────────────────

function parseFestivalPage(html: string): FestivalData | null {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null

  while ((m = re.exec(html)) !== null) {
    let parsed: unknown
    try { parsed = JSON.parse(m[1].trim()) } catch { continue }

    // Find a Festival node either at the top level or inside a @graph array
    let festival: LdFestival | null = null
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>
      if (obj['@type'] === 'Festival') {
        festival = obj as LdFestival
      } else if (Array.isArray(obj['@graph'])) {
        festival = (obj['@graph'] as LdFestival[]).find(n => n['@type'] === 'Festival') ?? null
      }
    }

    if (!festival) continue

    const addr = festival.location?.address ?? festival.location as LdAddress | undefined ?? {}

    return {
      name:      festival.name      ?? '',
      startDate: (festival.startDate ?? '').slice(0, 10),
      city:      addr.addressLocality ?? '',
      country:   addr.addressCountry  ?? '',
      url:       festival.url ?? festival['@id'] ?? '',
    }
  }

  return null
}

// ── Scraper ───────────────────────────────────────────────────────────────────

export const festileaksScraper: Scraper = {
  name: SOURCE_SITE,

  async scrape(): Promise<ScrapedShow[]> {
    const today = new Date().toISOString().slice(0, 10)

    // ── 1. Fetch followed artists ─────────────────────────────────────────────
    const { data: artists, error: artistsError } = await supabase
      .from('artists')
      .select('name')

    if (artistsError) {
      console.error(`[festileaks] Failed to fetch artists: ${artistsError.message}`)
      return []
    }
    if (!artists || artists.length === 0) {
      console.log('[festileaks] No followed artists — nothing to do.')
      return []
    }
    console.log(`[festileaks] Artists to check: ${artists.length}`)

    // ── 2. Fetch each artist page ─────────────────────────────────────────────
    let artistsFound     = 0
    let artistsNotFound  = 0
    let artistErrors     = 0
    let artistsRecovered = 0   // succeeded only after at least one retry

    const pending: PendingEntry[]        = []
    const seenArtistFestival = new Set<string>()
    let firstRequest = true

    for (const artist of artists) {
      if (!firstRequest) await sleep(DELAY_MS)
      firstRequest = false

      const url = `${BASE_URL}/artist/${slugify(artist.name)}/`
      const { result, retriesUsed } = await fetchWithRetry(url, `artist "${artist.name}"`)

      if (result === null) {
        artistErrors++
        continue
      }
      if (result.status === 404) {
        artistsNotFound++
        console.log(`[festileaks] Artist "${artist.name}" not found after ${MAX_ATTEMPTS} attempt(s), skipping`)
        continue
      }
      if (result.status !== 200) {
        artistErrors++
        console.warn(`[festileaks] HTTP ${result.status} for "${artist.name}" after ${MAX_ATTEMPTS} attempt(s), skipping`)
        continue
      }

      artistsFound++
      if (retriesUsed > 0) artistsRecovered++
      const rows = parseArtistPage(result.html)

      for (const row of rows) {
        // Pre-filter: skip if we have a confirmed past date; include if null (unknown)
        if (row.startDate !== null && row.startDate < today) continue

        const key = `${artist.name}|${row.festivalUrl}`
        if (seenArtistFestival.has(key)) continue
        seenArtistFestival.add(key)

        pending.push({
          artistName:  artist.name,
          festivalUrl: row.festivalUrl,
          festivalName: row.festivalName,
        })
      }
    }

    console.log(
      `[festileaks] Artist pages: ${artistsFound} found` +
      (artistsRecovered > 0 ? ` (${artistsRecovered} recovered via retry)` : '') +
      `, ${artistsNotFound} not found after retries, ${artistErrors} error(s)`,
    )
    console.log(`[festileaks] Upcoming festival rows (pre-country-filter): ${pending.length}`)

    // ── 3. Fetch festival pages (deduplicated, capped) ────────────────────────
    const festivalCache = new Map<string, FestivalData | null>()
    const uniqueUrls    = [...new Set(pending.map(p => p.festivalUrl))]

    let fetchCount = 0
    for (const festUrl of uniqueUrls) {
      if (fetchCount >= MAX_FESTIVAL_FETCHES) {
        console.warn(
          `[festileaks] Festival page fetch cap reached (${MAX_FESTIVAL_FETCHES} URL(s)). ` +
          `${uniqueUrls.length - fetchCount} URL(s) not checked.`,
        )
        break
      }

      await sleep(DELAY_MS)
      fetchCount++   // count each unique URL attempted (not individual retry calls)

      const { result } = await fetchWithRetry(festUrl, `festival "${festUrl}"`)
      if (!result || result.status !== 200) {
        festivalCache.set(festUrl, null)
        continue
      }

      festivalCache.set(festUrl, parseFestivalPage(result.html))
    }

    // ── 4. Emit ScrapedShows for confirmed NL festivals ───────────────────────
    const shows: ScrapedShow[] = []
    let nlCount = 0

    for (const p of pending) {
      const festival = festivalCache.get(p.festivalUrl)
      if (!festival) continue
      if (festival.country.toUpperCase() !== 'NL') continue
      if (!festival.startDate) continue   // no date → can't store the show

      nlCount++
      shows.push({
        artistName: p.artistName,
        date:       festival.startDate,
        venue:      festival.name || p.festivalName,
        city:       festival.city,
        sourceUrl:  p.festivalUrl,
        sourceSite: SOURCE_SITE,
      })
    }

    console.log(`[festileaks] NL festivals confirmed: ${nlCount}`)
    console.log(`[festileaks] ScrapedShows produced: ${shows.length}`)

    return shows
  },
}
