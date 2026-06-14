/**
 * Throwaway exploration script — NOT part of the app, not imported anywhere.
 * Phase A, run 5: confirmed Artist type HAS event-like fields. Fix queries.
 *
 * Discoveries from run 4 (2026-06-10):
 *   - __type introspection: HTTP 400 (globally disabled)
 *   - "events" field EXISTS on Artist, returns Event type (not a union —
 *     drop the ... on EventListing fragment)
 *   - "eventListings", "upcomingEvents", "appearances", "gigs",
 *     "performances" also exist on Artist but take NO date-filter args
 *     (error was "Variable '$from' is never used", not "field not found")
 *
 * This run:
 *   1. Query artist(id: 190).events with correct Event subfields (no fragments)
 *   2. For fields that don't accept args, query them without variables
 *   3. Print raw JSON + venue.area data for each working field
 *
 * Run with:
 *   npx tsx scripts/explore-ra-artist.ts
 */

const GRAPHQL_URL = 'https://ra.co/graphql'

const HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Referer: 'https://ra.co/artists',
}

const TODAY_ISO = new Date().toISOString()

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
    const errors = (json.errors ?? []).map(e => e.message)
    return { data: json.data ?? null, errors }
  } catch (err) {
    return { data: null, errors: [String(err)] }
  }
}

type VenueData  = { name: string; address: string | null; area: { name: string; country: { name: string } | null } | null } | null
type EventEntry = { id: string; title: string; date: string; contentUrl: string; venue: VenueData }

// ─────────────────────────────────────────────────────────────────────────────
// Query 1: artist.events — plain Event fields, no inline fragments
// ─────────────────────────────────────────────────────────────────────────────

// events() requires a mandatory `type` argument of enum type EventQueryType.
// Try the three most likely values in order.
function buildEventsQuery(typeValue: string): string {
  return /* graphql */ `
    query ARTIST_EVENTS($artistId: ID!) {
      artist(id: $artistId) {
        id
        name
        events(type: ${typeValue}) {
          id
          title
          date
          contentUrl
          venue {
            name
            address
            area { name country { name } }
          }
        }
      }
    }
  `
}

type ArtistEventsData = {
  artist: {
    id: string
    name: string
    events: EventEntry[]
  } | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Query 2: fields that exist but take no args — try each without variables
// ─────────────────────────────────────────────────────────────────────────────

function buildNoArgQuery(fieldName: string): string {
  return /* graphql */ `
    query ARTIST_FIELD($artistId: ID!) {
      artist(id: $artistId) {
        id
        name
        ${fieldName} {
          id
          title
          date
          contentUrl
          venue {
            name
            address
            area { name country { name } }
          }
        }
      }
    }
  `
}

// Also try eventListings — may return EventListing wrappers, not raw Events
function buildEventListingsQuery(fieldName: string): string {
  return /* graphql */ `
    query ARTIST_LISTINGS($artistId: ID!) {
      artist(id: $artistId) {
        id
        name
        ${fieldName} {
          event {
            id
            title
            date
            contentUrl
            venue {
              name
              address
              area { name country { name } }
            }
          }
        }
      }
    }
  `
}

type ArtistFieldData = {
  artist: { id: string; name: string; [key: string]: unknown } | null
}

function printEvents(events: EventEntry[], label: string) {
  if (!events.length) { console.log(`  (${label}: empty list)`); return }
  console.log(`\n${label} — ${events.length} event(s):\n`)
  events.slice(0, 8).forEach(e => {
    const vName   = e.venue?.name                ?? '(no venue)'
    const vAddr   = e.venue?.address             ?? ''
    const aName   = e.venue?.area?.name          ?? '(no area)'
    const country = e.venue?.area?.country?.name ?? '(no country)'
    console.log(`  ${e.date.slice(0, 10)}  "${e.title}"`)
    console.log(`    venue="${vName}"  area="${aName}"  country="${country}"`)
    if (vAddr) console.log(`    address="${vAddr}"`)
    console.log(`    url=https://ra.co${e.contentUrl}`)
    sep('·')
  })
  sep()
  console.log('Raw JSON of first entry:')
  console.log(JSON.stringify(events[0], null, 2))
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('RA artist-first exploration — Phase A, run 5')
  console.log(`Date: ${TODAY_ISO.slice(0, 10)}\n`)

  // ── Query 1: artist.events(type: <ENUM>) — try enum values until one works ────
  sep('═')
  console.log('QUERY 1: artist(id: 190) { events(type: <ENUM>) { ... } }\n')
  console.log('events() requires a mandatory "type: EventQueryType!" arg.')
  console.log('Trying enum values: UPCOMING, PAST, ALL\n')

  // First: try to introspect the EventQueryType enum to get exact values
  console.log('Probing __type(name: "EventQueryType") for valid enum values...')
  const enumIntro = await gql<{ __type: { enumValues: { name: string }[] } | null }>(
    'INTRO_ENUM',
    '{ __type(name: "EventQueryType") { enumValues { name } } }',
  )
  let knownEnumValues: string[] = []
  if (!enumIntro.errors.length && enumIntro.data?.__type?.enumValues?.length) {
    knownEnumValues = enumIntro.data.__type.enumValues.map(v => v.name)
    console.log(`✓ EventQueryType enum values: ${knownEnumValues.join(', ')}\n`)
  } else {
    console.log(`  Introspection blocked/null — trying candidates blindly.\n`)
  }

  // Try known values first; if introspection was blocked, try a broad set of guesses.
  // Print full error text — some GraphQL impls include "Did you mean X?" suggestions.
  const enumCandidates = knownEnumValues.length > 0
    ? knownEnumValues
    : [
        // timing-based guesses
        'UPCOMING', 'PAST', 'ALL', 'FUTURE', 'HISTORY',
        // RA booking/lineup terms
        'ATTENDING', 'PERFORMING', 'HEADLINING', 'ON_LINEUP', 'IN_LINEUP',
        'BOOKED', 'PLAYED', 'ANNOUNCED', 'LIVE',
        // RA event-type terms
        'CLUB', 'FESTIVAL', 'CLUB_NIGHT', 'OPEN_AIR',
        // lowercase variants
        'upcoming', 'past', 'future', 'attending', 'performing',
      ]

  let eventsResult: Awaited<ReturnType<typeof gql<ArtistEventsData>>> | null = null
  let workingEnum = ''

  for (const typeValue of enumCandidates) {
    const r = await gql<ArtistEventsData>(
      'ARTIST_EVENTS', buildEventsQuery(typeValue), { artistId: '190' },
    )
    eventsResult = r
    if (!r.errors.length && r.data?.artist) {
      workingEnum = typeValue
      console.log(`✓ events(type: ${typeValue}) WORKS — ${r.data.artist.events.length} event(s) returned`)
      break
    }
    const isNotFound = r.errors.some(e => /not defined|Cannot query field/i.test(e))
    if (isNotFound) { console.log('  events field no longer found — unexpected'); break }
    // Print full error (not truncated) — catches "Did you mean X?" suggestions
    console.log(`  events(type: ${typeValue}): ${r.errors[0] ?? 'null data'}`)
  }

  if (workingEnum) {
    printEvents(eventsResult!.data!.artist!.events, `artist.events(type: ${workingEnum})`)
  } else {
    console.log('\n✗ No EventQueryType enum value worked.')
    console.log('Last raw error:', eventsResult?.errors[0] ?? '(none)')
  }

  // ── Query 2: no-arg fields — "eventListings" on Artist ───────────────────────
  sep('═')
  console.log('\nQUERY 2: artist.eventListings (no-arg variant, EventListing wrapper)\n')

  const listingsResult = await gql<ArtistFieldData>(
    'ARTIST_LISTINGS', buildEventListingsQuery('eventListings'), { artistId: '190' },
  )

  if (listingsResult.errors.length) {
    // "field not found" errors mean it doesn't exist; anything else is informative
    const missing = listingsResult.errors.every(e => /not defined|not exist|Cannot query/i.test(e))
    if (missing) {
      console.log('✗ eventListings: field does not exist on Artist type')
    } else {
      console.log(`✗ eventListings errors: ${listingsResult.errors.join('\n  ')}`)
    }
  } else {
    const raw = listingsResult.data?.artist?.['eventListings']
    console.log(`✓ artist.eventListings returned:`)
    console.log(JSON.stringify(raw, null, 2).slice(0, 1500))
  }

  // ── Query 3: remaining no-arg candidates — upcomingEvents, appearances ────────
  sep('═')
  console.log('\nQUERY 3: no-arg fields as plain Event lists\n')

  const noArgCandidates = ['upcomingEvents', 'appearances', 'gigs', 'performances']

  for (const fieldName of noArgCandidates) {
    const r = await gql<ArtistFieldData>(
      'ARTIST_FIELD', buildNoArgQuery(fieldName), { artistId: '190' },
    )

    if (r.errors.length) {
      const isNotFound = r.errors.some(e => /not defined|not exist|Cannot query field/i.test(e))
      console.log(`  "${fieldName}": ${isNotFound ? 'field does not exist' : r.errors[0].slice(0, 100)}`)
    } else {
      const raw = r.data?.artist?.[fieldName]
      const count = Array.isArray(raw) ? raw.length : '(not an array)'
      console.log(`\n  ✓ "${fieldName}" EXISTS — ${count} item(s)`)
      console.log('  Raw JSON:')
      console.log(JSON.stringify(raw, null, 2).slice(0, 1200))
    }
  }

  // ── Comparison: filter events from artist.events to upcoming NL only ─────────
  sep('═')
  console.log('\nCOMPARISON: upcoming NL events from artist.events\n')

  if (!eventsResult.errors.length && eventsResult.data?.artist?.events.length) {
    const allEvents = eventsResult.data.artist.events
    const upcomingNl = allEvents.filter(e => {
      const country = e.venue?.area?.country?.name?.toLowerCase() ?? ''
      return e.date >= TODAY_ISO.slice(0, 10) &&
        (country.includes('netherlands') || country.includes('nederland'))
    })
    const upcoming = allEvents.filter(e => e.date >= TODAY_ISO.slice(0, 10))

    console.log(`Total events returned    : ${allEvents.length}`)
    console.log(`Upcoming (>= today)      : ${upcoming.length}`)
    console.log(`Upcoming + NL country    : ${upcomingNl.length}`)
    console.log()

    if (upcomingNl.length === 0 && upcoming.length > 0) {
      console.log('No NL events in upcoming set. Country values seen:')
      const countries = [...new Set(upcoming.map(e => e.venue?.area?.country?.name ?? '(none)'))]
      countries.forEach(c => console.log(`  "${c}"`))
    }

    if (upcomingNl.length > 0) {
      console.log('Upcoming NL events:')
      upcomingNl.forEach(e => {
        console.log(`  ${e.date.slice(0, 10)} "${e.title}" @ ${e.venue?.name ?? '?'}, ${e.venue?.area?.name ?? '?'}`)
      })
    }

    sep()
    console.log('Area/country values across ALL returned events (data-quality check):')
    const seen = new Set<string>()
    allEvents.forEach(e => {
      const k = `area="${e.venue?.area?.name ?? '?'}" country="${e.venue?.area?.country?.name ?? '?'}" addr="${e.venue?.address ?? ''}"`
      if (!seen.has(k)) { seen.add(k); console.log(`  ${k}`) }
    })
  } else {
    console.log('(skipped — artist.events query failed above)')
  }

  sep('═')
  console.log('\n── Done ──')
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
