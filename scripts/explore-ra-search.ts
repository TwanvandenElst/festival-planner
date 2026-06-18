/**
 * Throwaway exploration script — NOT part of the app, not imported anywhere.
 * Phase A: can we search ra.co events by TITLE/NAME via their GraphQL?
 * We already use eventListings(filters: { areas, listingDate }) for area
 * scraping; this checks whether the same filter input supports free-text title
 * search, and introspects FilterInputDtoInput to list every available filter.
 *
 * Max 3 requests:
 *   1. introspect FilterInputDtoInput (lists all filter fields)
 *   2. attempt a title filter: { title: { contains: "Awakenings" } }
 *   3. attempt a keyword/search filter: { keyword: "Awakenings" }
 *
 * Run with:
 *   npx tsx scripts/explore-ra-search.ts
 */

const GRAPHQL_URL = 'https://ra.co/graphql'
const NL_AREA_ID = 176

const HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Referer: 'https://ra.co/events/nl/all',
}

function sep(char = '─', len = 72) { console.log(char.repeat(len)) }
function sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)) }

type GqlResponse<T> = { data?: T; errors?: { message: string }[] }

async function gql<T>(
  body: { query: string; variables?: Record<string, unknown>; operationName?: string },
): Promise<{ ok: boolean; status: number; json: GqlResponse<T> | null; error?: string }> {
  try {
    const res = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(body),
    })
    const text = await res.text()
    let json: GqlResponse<T> | null = null
    try { json = JSON.parse(text) as GqlResponse<T> } catch { /* non-JSON */ }
    return { ok: res.ok, status: res.status, json, error: json ? undefined : text.slice(0, 300) }
  } catch (err) {
    return { ok: false, status: 0, json: null, error: String(err) }
  }
}

// ── Introspection types ───────────────────────────────────────────────────────

type TypeRef = {
  kind: string
  name: string | null
  ofType: TypeRef | null
}
type InputField = { name: string; type: TypeRef }
type IntrospectData = { __type: { name: string; inputFields: InputField[] | null } | null }

/** Unwraps NON_NULL/LIST wrappers into a readable type string. */
function typeStr(t: TypeRef | null): string {
  if (!t) return '?'
  if (t.kind === 'NON_NULL') return `${typeStr(t.ofType)}!`
  if (t.kind === 'LIST') return `[${typeStr(t.ofType)}]`
  return t.name ?? t.kind
}

const INTROSPECT_QUERY = /* graphql */ `
  query INTROSPECT($name: String!) {
    __type(name: $name) {
      name
      inputFields {
        name
        type {
          kind name
          ofType { kind name ofType { kind name ofType { kind name } } }
        }
      }
    }
  }
`

// ── Search attempt query (minimal event fields) ───────────────────────────────

const SEARCH_QUERY = /* graphql */ `
  query SEARCH($filters: FilterInputDtoInput, $pageSize: Int, $page: Int) {
    eventListings(filters: $filters, pageSize: $pageSize, page: $page) {
      totalResults
      data { event { id title date contentUrl } }
    }
  }
`

type SearchData = {
  eventListings: { totalResults: number; data: { event: { id: string; title: string; date: string; contentUrl: string } }[] }
}

function reportErrors(label: string, errors: { message: string }[] | undefined): boolean {
  if (errors && errors.length) {
    console.log(`  ✗ ${label}: GraphQL errors:`)
    errors.forEach(e => console.log(`     • ${e.message}`))
    return true
  }
  return false
}

async function main() {
  console.log('ra.co event title/name search probe\n')

  // ── REQUEST 1: introspect FilterInputDtoInput ───────────────────────────────
  sep('═')
  console.log('REQUEST 1 — introspect FilterInputDtoInput (all filter fields)\n')

  const intro = await gql<IntrospectData>({
    query: INTROSPECT_QUERY,
    variables: { name: 'FilterInputDtoInput' },
    operationName: 'INTROSPECT',
  })

  if (intro.error) console.log(`  ✗ HTTP ${intro.status}: ${intro.error}`)
  else if (!reportErrors('introspection', intro.json?.errors)) {
    const t = intro.json?.data?.__type
    if (!t) {
      console.log('  ✗ __type returned null — introspection may be disabled on this endpoint.')
    } else if (!t.inputFields) {
      console.log('  ✗ inputFields null.')
    } else {
      console.log(`  ✓ FilterInputDtoInput has ${t.inputFields.length} fields:\n`)
      t.inputFields.forEach(f => console.log(`     ${f.name}: ${typeStr(f.type)}`))
      const textish = t.inputFields.filter(f => /title|name|search|keyword|query|text|q/i.test(f.name))
      console.log('\n  Fields that look like free-text search:',
        textish.length ? textish.map(f => f.name).join(', ') : '(none obvious)')
    }
  }

  // ── REQUEST 2: title filter attempt ─────────────────────────────────────────
  await sleep(600)
  sep('═')
  console.log('\nREQUEST 2 — attempt filters.title: { contains: "Awakenings" }\n')

  const titleAttempt = await gql<SearchData>({
    query: SEARCH_QUERY,
    variables: {
      filters: { areas: { eq: NL_AREA_ID }, title: { contains: 'Awakenings' } },
      pageSize: 10,
      page: 1,
    },
    operationName: 'SEARCH',
  })

  if (titleAttempt.error) console.log(`  ✗ HTTP ${titleAttempt.status}: ${titleAttempt.error}`)
  else if (!reportErrors('title filter', titleAttempt.json?.errors)) {
    const l = titleAttempt.json?.data?.eventListings
    console.log(`  ✓ accepted! totalResults=${l?.totalResults ?? 0}`)
    ;(l?.data ?? []).slice(0, 10).forEach((d, i) =>
      console.log(`     ${i + 1}. ${d.event.title}  (${d.event.date.slice(0, 10)})  https://ra.co${d.event.contentUrl}`))
  }

  // ── REQUEST 3: keyword/search filter attempt ────────────────────────────────
  await sleep(600)
  sep('═')
  console.log('\nREQUEST 3 — attempt filters.keyword: "Awakenings"\n')

  const keywordAttempt = await gql<SearchData>({
    query: SEARCH_QUERY,
    variables: {
      filters: { areas: { eq: NL_AREA_ID }, keyword: 'Awakenings' },
      pageSize: 10,
      page: 1,
    },
    operationName: 'SEARCH',
  })

  if (keywordAttempt.error) console.log(`  ✗ HTTP ${keywordAttempt.status}: ${keywordAttempt.error}`)
  else if (!reportErrors('keyword filter', keywordAttempt.json?.errors)) {
    const l = keywordAttempt.json?.data?.eventListings
    console.log(`  ✓ accepted! totalResults=${l?.totalResults ?? 0}`)
    ;(l?.data ?? []).slice(0, 10).forEach((d, i) =>
      console.log(`     ${i + 1}. ${d.event.title}  (${d.event.date.slice(0, 10)})  https://ra.co${d.event.contentUrl}`))
  }

  // ── Report ──────────────────────────────────────────────────────────────────
  sep('═')
  console.log('\nREPORT\n')
  console.log('  • REQUEST 1 lists the real filter fields — look for title/name/search/keyword/q.')
  console.log('  • REQUEST 2/3: "GraphQL errors: Field <x> is not defined…" means that filter')
  console.log('    does NOT exist; "✓ accepted" with results means we CAN search events by name.')
  console.log('  • If both attempts error and introspection shows no text field → ra.co does not')
  console.log('    support title search via eventListings (likely a separate search endpoint).')

  sep()
  console.log('\n── Done ──')
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
