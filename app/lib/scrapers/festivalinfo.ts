import type { Scraper, ScrapedShow } from './types'

const AGENDA_URL = 'https://www.festivalinfo.nl/festivals/'
const SOURCE_SITE = 'festivalinfo'

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

// ── JSON-LD types (mirrors confirmed schema.org Festival shape) ───────────────

type LdPerformer = {
  '@type'?: string
  name?: string
}

type LdAddress = {
  addressLocality?: string
  addressCountry?: string
}

type LdLocation = {
  name?: string
  address?: LdAddress
}

type LdFestival = {
  '@type': string
  name?: string
  startDate?: string
  endDate?: string
  url?: string
  '@id'?: string
  location?: LdLocation
  performer?: LdPerformer | LdPerformer[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractJsonLdBlocks(html: string): LdFestival[] {
  const results: LdFestival[] = []
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim()) as LdFestival
      if (parsed['@type'] === 'Festival') results.push(parsed)
    } catch {
      // malformed block — skip
    }
  }
  return results
}

function inWindow(startDate: string, todayIso: string, windowEndIso: string): boolean {
  return startDate >= todayIso && startDate <= windowEndIso
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return []
  return Array.isArray(value) ? value : [value]
}

// ── Scraper ───────────────────────────────────────────────────────────────────

export const festivalinfoScraper: Scraper = {
  name: SOURCE_SITE,

  async scrape(): Promise<ScrapedShow[]> {
    const today      = new Date()
    const windowEnd  = new Date(today.getTime() + 365 * 24 * 60 * 60 * 1000)
    const todayIso   = today.toISOString().slice(0, 10)
    const windowEndIso = windowEnd.toISOString().slice(0, 10)

    // ── Fetch agenda page ────────────────────────────────────────────────────
    let html: string
    try {
      const res = await fetch(AGENDA_URL, {
        method: 'GET',
        headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8' },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
      html = await res.text()
    } catch (err) {
      console.error(`[festivalinfo] Failed to fetch agenda: ${err}`)
      return []
    }

    // ── Parse JSON-LD ────────────────────────────────────────────────────────
    const allFestivals = extractJsonLdBlocks(html)
    console.log(`[festivalinfo] JSON-LD Festival blocks found: ${allFestivals.length}`)

    // ── Filter: NL only, within 12-month rolling window ──────────────────────
    const inWindow12m = allFestivals.filter(f => {
      if (!f.startDate) return false
      const country = f.location?.address?.addressCountry ?? ''
      if (country.toUpperCase() !== 'NL') return false
      return inWindow(f.startDate, todayIso, windowEndIso)
    })
    console.log(`[festivalinfo] In-window NL festivals: ${inWindow12m.length}`)

    // ── Expand to ScrapedShow entries ─────────────────────────────────────────
    const shows: ScrapedShow[] = []
    let withPerformers = 0

    for (const festival of inWindow12m) {
      const performers = toArray(festival.performer).filter(p => p.name)
      if (performers.length === 0) continue
      withPerformers++

      const festivalName = festival.name ?? ''
      const date         = festival.startDate!          // already checked non-null above
      const city         = festival.location?.address?.addressLocality ?? ''
      const sourceUrl    = festival.url ?? festival['@id'] ?? ''

      for (const performer of performers) {
        shows.push({
          artistName: performer.name!,
          date,
          venue:      festivalName,
          city,
          sourceUrl,
          sourceSite: SOURCE_SITE,
        })
      }
    }

    console.log(
      `[festivalinfo] Festivals with performers: ${withPerformers} — ` +
      `ScrapedShows produced: ${shows.length}`
    )
    return shows
  },
}
