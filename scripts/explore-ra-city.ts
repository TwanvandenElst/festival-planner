/**
 * Throwaway exploration script — NOT part of the app, not imported anywhere.
 * Phase A: find where RA.co stores a real city/location per event so we can
 * replace the useless venue.area.name = "All" that comes from querying area 176.
 *
 * Run with:
 *   npx tsx scripts/explore-ra-city.ts
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

function sep(char = '─', len = 64) { console.log(char.repeat(len)) }

async function gql<T>(
  operationName: string,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<{ data: T | null; errors: string[] }> {
  try {
    const res = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ operationName, query, variables }),
    })
    if (!res.ok) return { data: null, errors: [`HTTP ${res.status} ${res.statusText}`] }
    const json = await res.json() as { data?: T; errors?: { message: string }[] }
    return { data: json.data ?? null, errors: (json.errors ?? []).map(e => e.message) }
  } catch (err) {
    return { data: null, errors: [String(err)] }
  }
}

// ── 1. Introspect Venue type ──────────────────────────────────────────────────

type IntrospectField = {
  name: string
  type: { name: string | null; kind: string; ofType: { name: string | null; kind: string } | null }
}
type IntrospectData = { __type: { name: string; fields: IntrospectField[] } | null }

const INTROSPECT_TYPE_QUERY = /* graphql */ `
  query INTRO_TYPE($typeName: String!) {
    __type(name: $typeName) {
      name
      fields {
        name
        type {
          name
          kind
          ofType { name kind }
        }
      }
    }
  }
`

// ── 2. Wide event query — request every plausible venue/area sub-field ────────

// We deliberately request more fields than the scraper currently does.
// Unknown fields will just error; we'll note which ones come back successfully.
const WIDE_EVENTS_QUERY = /* graphql */ `
  query WIDE_EVENTS($filters: FilterInputDtoInput, $pageSize: Int) {
    eventListings(filters: $filters, pageSize: $pageSize, page: 1) {
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
            capacity
            area {
              id
              name
              urlName
              country { name isoCode }
            }
          }
        }
      }
    }
  }
`

// Narrower fallback in case some venue fields don't exist
const NARROW_EVENTS_QUERY = /* graphql */ `
  query NARROW_EVENTS($filters: FilterInputDtoInput, $pageSize: Int) {
    eventListings(filters: $filters, pageSize: $pageSize, page: 1) {
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
            area {
              id
              name
              country { name }
            }
          }
        }
      }
    }
  }
`

type AreaData = {
  id: string
  name: string
  urlName?: string
  country?: { name: string; isoCode?: string } | null
}
type VenueData = {
  id: string
  name: string
  address?: string | null
  capacity?: number | null
  area?: AreaData | null
}
type EventData = {
  id: string
  title: string
  date: string
  contentUrl: string
  venue?: VenueData | null
}
type EventListingsData = {
  eventListings: {
    totalResults: number
    data: { event: EventData }[]
  }
}

// ── 3. Fetch a single known event by ID ───────────────────────────────────────
// Awakenings Summer Festival 2026 has been seen in area-176 results.
// Query it directly to see if there's richer location data per event.

const EVENT_BY_ID_QUERY = /* graphql */ `
  query EVENT_BY_ID($id: ID!) {
    event(id: $id) {
      id
      title
      date
      contentUrl
      venue {
        id
        name
        address
        area {
          id
          name
          urlName
          country { name isoCode }
        }
      }
    }
  }
`

type SingleEventData = {
  event: EventData | null
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const today = new Date().toISOString()
  const in8Weeks = new Date(Date.now() + 56 * 24 * 3600 * 1000).toISOString()

  console.log('RA.co city-field exploration — Phase A')
  console.log(`Date window: ${today.slice(0, 10)} → ${in8Weeks.slice(0, 10)}\n`)

  // ─────────────────────────────────────────────────────────────────────────
  sep('═')
  console.log('STEP 1: Introspect Venue type\n')

  const venueIntro = await gql<IntrospectData>('INTRO_TYPE', INTROSPECT_TYPE_QUERY, { typeName: 'Venue' })
  if (venueIntro.errors.length || !venueIntro.data?.__type) {
    console.log('✗ Venue introspection blocked:', venueIntro.errors[0] ?? 'null')
  } else {
    console.log(`Venue fields (${venueIntro.data.__type.fields.length}):`)
    venueIntro.data.__type.fields.forEach(f => {
      const t = f.type.ofType ? `${f.type.kind}<${f.type.ofType.name ?? f.type.ofType.kind}>` : (f.type.name ?? f.type.kind)
      console.log(`  ${f.name}: ${t}`)
    })
  }

  // ─────────────────────────────────────────────────────────────────────────
  sep('═')
  console.log('\nSTEP 2: Introspect Area type\n')

  const areaIntro = await gql<IntrospectData>('INTRO_TYPE', INTROSPECT_TYPE_QUERY, { typeName: 'Area' })
  if (areaIntro.errors.length || !areaIntro.data?.__type) {
    console.log('✗ Area introspection blocked:', areaIntro.errors[0] ?? 'null')
  } else {
    console.log(`Area fields (${areaIntro.data.__type.fields.length}):`)
    areaIntro.data.__type.fields.forEach(f => {
      const t = f.type.ofType ? `${f.type.kind}<${f.type.ofType.name ?? f.type.ofType.kind}>` : (f.type.name ?? f.type.kind)
      console.log(`  ${f.name}: ${t}`)
    })
  }

  // ─────────────────────────────────────────────────────────────────────────
  sep('═')
  console.log('\nSTEP 3: Wide event query (extra venue fields)\n')
  console.log('Requesting: venue.address, venue.capacity, area.urlName, country.isoCode')
  console.log('(Unknown fields will cause a GraphQL error; we\'ll fall back to the narrow query.)\n')

  const wideFilters = {
    areas: { eq: NL_AREA_ID },
    listingDate: { gte: today, lte: in8Weeks },
  }

  const wide = await gql<EventListingsData>('WIDE_EVENTS', WIDE_EVENTS_QUERY, {
    filters: wideFilters,
    pageSize: 5,
  })

  let events: EventData[] = []

  if (wide.errors.length) {
    console.log(`Wide query errors: ${wide.errors.join('; ')}`)
    console.log('Falling back to narrow query (no extra fields)...\n')

    const narrow = await gql<EventListingsData>('NARROW_EVENTS', NARROW_EVENTS_QUERY, {
      filters: wideFilters,
      pageSize: 5,
    })
    if (narrow.errors.length) {
      console.log('Narrow query also failed:', narrow.errors.join('; '))
    } else {
      events = (narrow.data?.eventListings.data ?? []).map(d => d.event)
      console.log(`✓ Narrow query: ${narrow.data?.eventListings.totalResults} total NL events, showing ${events.length}`)
    }
  } else {
    events = (wide.data?.eventListings.data ?? []).map(d => d.event)
    console.log(`✓ Wide query: ${wide.data?.eventListings.totalResults} total NL events, showing ${events.length}`)
  }

  // ─────────────────────────────────────────────────────────────────────────
  sep('═')
  console.log('\nSTEP 4: Full venue object for each returned event\n')

  for (const ev of events) {
    console.log(`Event: "${ev.title}"  date=${ev.date.slice(0, 10)}  id=${ev.id}`)
    console.log(`  url: https://ra.co${ev.contentUrl}`)
    console.log('  venue (raw JSON):')
    console.log(JSON.stringify(ev.venue, null, 4)
      .split('\n').map(l => '    ' + l).join('\n'))
    console.log()
  }

  // ─────────────────────────────────────────────────────────────────────────
  sep('═')
  console.log('\nSTEP 5: Fetch one event directly by id (bypass area-176 filter)\n')

  // Try to find Awakenings in the list; if not there, use the first event's id
  const awakenings = events.find(e => /awakenings/i.test(e.title))
  const targetId   = awakenings?.id ?? events[0]?.id

  if (!targetId) {
    console.log('No events found to probe individually.')
  } else {
    console.log(`Fetching event id=${targetId} ("${awakenings?.title ?? events[0]?.title}") directly...\n`)
    const single = await gql<SingleEventData>('EVENT_BY_ID', EVENT_BY_ID_QUERY, { id: targetId })

    if (single.errors.length) {
      console.log('errors:', single.errors.join('; '))
    } else {
      console.log('event (raw JSON):')
      console.log(JSON.stringify(single.data?.event, null, 2))
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  sep('═')
  console.log('\nSTEP 6: Summary — what fields carry real city information?\n')

  if (events.length === 0) {
    console.log('No events returned — cannot assess field quality.')
    return
  }

  // Tally which field values are non-empty and non-"All"
  const stats = {
    'venue.name':           0,
    'venue.address':        0,
    'venue.area.name':      0,
    'venue.area.name≠All':  0,
    'venue.area.urlName':   0,
    'venue.area.country':   0,
  }

  for (const ev of events) {
    const v = ev.venue
    if (v?.name)                          stats['venue.name']++
    if (v?.address)                       stats['venue.address']++
    if (v?.area?.name)                    stats['venue.area.name']++
    if (v?.area?.name && v.area.name !== 'All') stats['venue.area.name≠All']++
    if (v?.area?.urlName)                 stats['venue.area.urlName']++
    if (v?.area?.country?.name)           stats['venue.area.country']++
  }

  console.log(`Across ${events.length} events:`)
  Object.entries(stats).forEach(([k, n]) => {
    const pct = Math.round((n / events.length) * 100)
    console.log(`  ${k.padEnd(28)}: ${n}/${events.length} non-empty (${pct}%)`)
  })

  console.log()
  console.log('Distinct venue.area.name values seen:')
  const areaNames = [...new Set(events.map(e => e.venue?.area?.name ?? '(null)'))]
  areaNames.forEach(n => console.log(`  "${n}"`))

  sep()
  console.log('\n── Done ──')
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
