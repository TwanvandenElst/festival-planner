/**
 * Throwaway exploration script — NOT part of the app, not imported anywhere.
 * Makes a single request to ra.co/graphql and pretty-prints the result so we
 * can understand the real data shape before building the scraper.
 *
 * Run with:
 *   npx tsx scripts/explore-ra.ts
 *
 * ── Verified Dutch area IDs (queried via `areas` lookup, 2026-06-09) ────────
 *   29  – Amsterdam      (Netherlands)
 *  174  – Rotterdam      (Netherlands)
 *  175  – Utrecht        (Netherlands)
 *  176  – All            (Netherlands)  ← nationwide, use this in the scraper
 *  178  – The Hague      (Netherlands)
 *
 * NOTE: area 13 = London (UK). The earlier assumption was wrong.
 *
 * To re-verify any ID yourself:
 *   { areas(searchTerm: "amsterdam", limit: 5) { id name country { name } } }
 * ────────────────────────────────────────────────────────────────────────────
 */

const GRAPHQL_URL = 'https://ra.co/graphql'

// Use area 176 ("All" / Netherlands) to get events across the whole country.
// Swap to 29 (Amsterdam only) if you want to narrow it down.
const NL_AREA_ID = 176

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

type Artist  = { id: string; name: string }
type Area    = { id: number; name: string; country: { name: string } | null }
type Venue   = { id: string; name: string; area: Area | null }
type Event   = {
  id: string
  title: string
  date: string
  startTime: string
  endTime: string
  contentUrl: string
  venue: Venue | null
  artists: Artist[]
}
type Listing = { id: string; listingDate: string; event: Event }

async function main() {
  const now = new Date()
  const inFourWeeks = new Date(now.getTime() + 28 * 24 * 60 * 60 * 1000)

  const variables = {
    filters: {
      areas: { eq: NL_AREA_ID },
      listingDate: {
        gte: now.toISOString(),
        lte: inFourWeeks.toISOString(),
      },
    },
    pageSize: 5,
    page: 1,
  }

  console.log(`Querying ra.co/graphql — Netherlands All (area ${NL_AREA_ID})`)
  console.log(`Date range: ${now.toISOString().slice(0, 10)} → ${inFourWeeks.toISOString().slice(0, 10)}`)
  console.log(`Page size:  5\n`)

  let res: Response
  try {
    res = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ query: QUERY, variables }),
    })
  } catch (err) {
    console.error('Network error — request never left the machine:', err)
    process.exit(1)
  }

  if (!res.ok) {
    console.error(`HTTP ${res.status} ${res.statusText}`)
    console.error(await res.text())
    process.exit(1)
  }

  const json = await res.json() as {
    data?: { eventListings: { totalResults: number; data: Listing[] } }
    errors?: { message: string }[]
  }

  if (json.errors?.length) {
    console.error('GraphQL errors:')
    for (const e of json.errors) console.error(' •', e.message)
    process.exit(1)
  }

  if (!json.data) {
    console.error('Unexpected response shape — no `data` field:')
    console.error(JSON.stringify(json, null, 2))
    process.exit(1)
  }

  const { totalResults, data: listings } = json.data.eventListings
  console.log(`Total results on RA: ${totalResults}`)
  console.log(`Showing first ${listings.length}`)
  console.log('═'.repeat(60))

  for (const item of listings) {
    const e = item.event
    const artists = e.artists?.map(a => a.name).join(', ') || '(none listed)'
    const venue   = e.venue
      ? `${e.venue.name}, ${e.venue.area?.name ?? ''} (${e.venue.area?.country?.name ?? ''})`
      : '(no venue)'
    console.log(`Title:   ${e.title}`)
    console.log(`Date:    ${e.date}  ${e.startTime} – ${e.endTime}`)
    console.log(`Venue:   ${venue}`)
    console.log(`Artists: ${artists}`)
    console.log(`URL:     https://ra.co${e.contentUrl}`)
    console.log('─'.repeat(60))
  }

  console.log('\n── Raw first listing (schema reference) ──')
  console.log(JSON.stringify(listings[0] ?? null, null, 2))
}

main()
