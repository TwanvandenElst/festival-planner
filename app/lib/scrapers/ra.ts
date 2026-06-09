import type { Scraper, ScrapedShow } from './types'

const GRAPHQL_URL = 'https://ra.co/graphql'
const NL_AREA_ID  = 176   // "All" Netherlands — verified 2026-06-09
const PAGE_SIZE   = 50
const MAX_PAGES   = 10    // safety cap: 500 events max per run
const PAGE_DELAY_MS = 500 // be polite between pages

// ── RA-specific response types ────────────────────────────────────────────────

type RArtist  = { id: string; name: string }
type RArea    = { id: string; name: string; country: { name: string } | null }
type RVenue   = { id: string; name: string; area: RArea | null } | null
type REvent   = {
  id: string
  title: string
  date: string         // ISO datetime, e.g. "2026-07-12T00:00:00.000Z"
  startTime: string
  endTime: string
  contentUrl: string   // e.g. "/events/2431031"
  venue: RVenue
  artists: RArtist[]
}
type RListing   = { id: string; listingDate: string; event: REvent }
type RAResponse = {
  data?: { eventListings: { totalResults: number; data: RListing[] } }
  errors?: { message: string }[]
}

// ─────────────────────────────────────────────────────────────────────────────

const HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Referer: 'https://ra.co/events/nl/all',
}

const QUERY = /* graphql */ `
  query GET_EVENT_LISTINGS(
    $filters: FilterInputDtoInput
    $pageSize: Int
    $page: Int
  ) {
    eventListings(filters: $filters, pageSize: $pageSize, page: $page) {
      totalResults
      data {
        id
        listingDate
        event {
          id
          title
          date
          startTime
          endTime
          contentUrl
          venue {
            id
            name
            area {
              id
              name
              country { name }
            }
          }
          artists {
            id
            name
          }
        }
      }
    }
  }
`

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

export const raScraper: Scraper = {
  name: 'ra.co',

  async scrape(): Promise<ScrapedShow[]> {
    const now = new Date()
    const inFiveWeeks = new Date(now.getTime() + 35 * 24 * 60 * 60 * 1000)

    const shows: ScrapedShow[] = []
    let page = 1
    let totalPages = 1

    while (page <= totalPages && page <= MAX_PAGES) {
      if (page > 1) await sleep(PAGE_DELAY_MS)

      const variables = {
        filters: {
          areas: { eq: NL_AREA_ID },
          listingDate: {
            gte: now.toISOString(),
            lte: inFiveWeeks.toISOString(),
          },
        },
        pageSize: PAGE_SIZE,
        page,
      }

      let res: Response
      try {
        res = await fetch(GRAPHQL_URL, {
          method: 'POST',
          headers: HEADERS,
          body: JSON.stringify({ query: QUERY, variables }),
        })
      } catch (err) {
        console.error(`[ra.co] Network error on page ${page}:`, err)
        break
      }

      if (!res.ok) {
        console.error(`[ra.co] HTTP ${res.status} ${res.statusText} on page ${page}`)
        break
      }

      const json = (await res.json()) as RAResponse

      if (json.errors?.length) {
        console.error(`[ra.co] GraphQL errors on page ${page}:`, json.errors.map(e => e.message))
        break
      }

      if (!json.data) {
        console.error(`[ra.co] Unexpected response shape on page ${page}`)
        break
      }

      const { totalResults, data: listings } = json.data.eventListings

      if (page === 1) {
        totalPages = Math.ceil(totalResults / PAGE_SIZE)
        console.log(
          `[ra.co] ${totalResults} events found — fetching ${Math.min(totalPages, MAX_PAGES)} page(s)`
        )
      }

      for (const item of listings) {
        const event = item.event
        if (!event.artists || event.artists.length === 0) continue

        const sourceUrl = `https://ra.co${event.contentUrl}`
        const venue     = event.venue?.name ?? ''
        const city      = event.venue?.area?.name ?? ''
        const date      = event.date.slice(0, 10) // "YYYY-MM-DD"

        for (const artist of event.artists) {
          shows.push({
            artistName: artist.name,
            date,
            venue,
            city,
            sourceUrl,
            sourceSite: 'ra.co',
          })
        }
      }

      page++
    }

    console.log(`[ra.co] Collected ${shows.length} artist-show entries`)
    return shows
  },
}
