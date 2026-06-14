/**
 * Throwaway debug probe — NOT part of the app, not imported anywhere.
 *
 * Goal: for events where venue.area.name === "All" (e.g. Beekse Bergen),
 * dump exactly what venue.address contains so we can see why the
 * address→city fallback failed (empty? different format? unparseable?).
 *
 * Run with:
 *   npx tsx scripts/explore-ra-all-city.ts
 */

const GRAPHQL_URL = 'https://ra.co/graphql'
const NL_AREA_ID  = 176

const HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Referer: 'https://ra.co/events/nl/all',
}

const QUERY = /* graphql */ `
  query GET_EVENT_LISTINGS($filters: FilterInputDtoInput, $pageSize: Int, $page: Int) {
    eventListings(filters: $filters, pageSize: $pageSize, page: $page) {
      totalResults
      data {
        event {
          id
          title
          date
          contentUrl
          venue {
            id
            name
            address
            area { id name country { name } }
          }
        }
      }
    }
  }
`

type Area  = { id: string; name: string; country: { name: string } | null }
type Venue = { id: string; name: string; address: string | null; area: Area | null } | null
type Event = { id: string; title: string; date: string; contentUrl: string; venue: Venue }
type Resp  = {
  data?: { eventListings: { totalResults: number; data: { event: Event }[] } }
  errors?: { message: string }[]
}

// ── copy of the scraper's CORRECTED parsing logic so we can show what it produces ──

const COUNTRY_TOKENS = new Set(['netherlands', 'the netherlands', 'nl', 'nederland', 'holland'])

function stripLeadingPostcode(fragment: string): string {
  return fragment.replace(/^\d{4}\s*[A-Za-z]{2}\b\s*/, '').trim()
}

function cityFromAddress(address: string | null | undefined): string | null {
  if (!address) return null
  const parts = address
    .split(',')
    .map(p => p.trim())
    .filter(p => p.length > 0 && !COUNTRY_TOKENS.has(p.toLowerCase()))

  for (let i = parts.length - 1; i >= 0; i--) {
    const candidate = stripLeadingPostcode(parts[i])
    if (!candidate) continue
    if (/\d/.test(candidate)) continue
    if (COUNTRY_TOKENS.has(candidate.toLowerCase())) continue
    return candidate
  }
  return null
}

function isAllOrEmpty(name: string | null | undefined): boolean {
  const n = name?.trim().toLowerCase()
  return !n || n === 'all'
}

/** Mirrors the scraper's cityForVenue so the probe shows the final stored value. */
function cityForVenue(venue: Venue): string {
  const areaName = venue?.area?.name
  if (!isAllOrEmpty(areaName)) return areaName!.trim()
  const fromAddr = cityFromAddress(venue?.address)
  if (fromAddr) return fromAddr
  const fallback = venue?.name?.trim() ?? ''
  return isAllOrEmpty(fallback) ? '' : fallback
}

async function gql(page: number): Promise<Resp> {
  const today    = new Date().toISOString()
  const in8Weeks = new Date(Date.now() + 56 * 24 * 3600 * 1000).toISOString()
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      query: QUERY,
      variables: {
        filters: { areas: { eq: NL_AREA_ID }, listingDate: { gte: today, lte: in8Weeks } },
        pageSize: 50,
        page,
      },
    }),
  })
  return res.json() as Promise<Resp>
}

async function main() {
  console.log('RA.co "All"-city debug probe\n')

  const allEvents: Event[] = []
  // pull a few pages so we surface enough "All" cases (Beekse Bergen, etc.)
  for (let page = 1; page <= 6; page++) {
    const json = await gql(page)
    if (json.errors?.length) {
      console.error('GraphQL errors:', json.errors.map(e => e.message).join('; '))
      break
    }
    const listings = json.data?.eventListings.data ?? []
    if (listings.length === 0) break
    allEvents.push(...listings.map(l => l.event))
    await new Promise(r => setTimeout(r, 400))
  }

  console.log(`Fetched ${allEvents.length} events total.\n`)

  const allCityEvents = allEvents.filter(e => (e.venue?.area?.name ?? '') === 'All')
  console.log(`Events with venue.area.name === "All": ${allCityEvents.length}\n`)
  console.log('═'.repeat(72))

  for (const ev of allCityEvents) {
    const addr     = ev.venue?.address
    const parsed   = cityFromAddress(addr)
    console.log(`Event:        "${ev.title}"`)
    console.log(`  date:       ${ev.date.slice(0, 10)}`)
    console.log(`  url:        https://ra.co${ev.contentUrl}`)
    console.log(`  venue.name: ${JSON.stringify(ev.venue?.name ?? null)}`)
    console.log(`  venue.address (raw):  ${JSON.stringify(addr)}`)
    console.log(`  cityFromAddress() →   ${JSON.stringify(parsed)}`)
    const stored = cityForVenue(ev.venue)
    const note = stored === 'All' ? '  ✗✗ STILL "All"' : (parsed ? '' : '  (fell back to venue.name)')
    console.log(`  STORED city       →   ${JSON.stringify(stored)}${note}`)
    console.log('─'.repeat(72))
  }

  // Spotlight Beekse Bergen specifically if present
  const beekse = allEvents.filter(e => /beekse/i.test(e.venue?.name ?? '') || /beekse/i.test(e.title))
  if (beekse.length) {
    console.log('\nBeekse Bergen spotlight — full venue JSON:\n')
    for (const ev of beekse) {
      console.log(`"${ev.title}"`)
      console.log(JSON.stringify(ev.venue, null, 2))
      console.log()
    }
  } else {
    console.log('\n(No event with "Beekse" in venue.name/title in this window.)')
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
