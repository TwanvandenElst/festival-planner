/**
 * Throwaway exploration script — NOT part of the app, not imported anywhere.
 * Phase A (final probe): facetedSearch(types: [ARTIST]) is reachable, but
 * "contains" isn't a valid operator on the filter inputs. This introspects the
 * actual operators on MatchFilterInputDtoInput / StringFilterInputDtoInput, then
 * retries facetedSearch for "adam" with the correct operator on title and name.
 *
 * Max 4 requests (a global counter enforces it).
 *
 * Run with:
 *   npx tsx scripts/explore-ra-artist-search.ts
 */

const GRAPHQL_URL = 'https://ra.co/graphql'
const ARTIST_ENUM = 'ARTIST' // confirmed reachable in the previous probe

const HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Referer: 'https://ra.co/search',
}

function sep(char = '─', len = 72) { console.log(char.repeat(len)) }
function sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)) }

type GqlResponse<T> = { data?: T; errors?: { message: string }[] }

let requestCount = 0
const MAX_REQUESTS = 4

async function gql<T>(label: string, query: string): Promise<GqlResponse<T> | null> {
  if (requestCount >= MAX_REQUESTS) {
    console.log(`  [skipped "${label}" — request budget (${MAX_REQUESTS}) reached]`)
    return null
  }
  if (requestCount > 0) await sleep(500)
  requestCount++
  try {
    const res = await fetch(GRAPHQL_URL, { method: 'POST', headers: HEADERS, body: JSON.stringify({ query }) })
    const text = await res.text()
    try { return JSON.parse(text) as GqlResponse<T> } catch {
      console.log(`  ✗ "${label}" non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`)
      return null
    }
  } catch (err) {
    console.log(`  ✗ "${label}" network error: ${String(err)}`)
    return null
  }
}

// ── Introspection plumbing ────────────────────────────────────────────────────

type TypeRef = { kind: string; name: string | null; ofType: TypeRef | null }
type TField = { name: string; type: TypeRef }
type IntroType = {
  name: string
  kind: string
  fields: TField[] | null
  inputFields: TField[] | null
  enumValues: { name: string }[] | null
  possibleTypes: { name: string; kind: string }[] | null
}

function typeStr(t: TypeRef | null): string {
  if (!t) return '?'
  if (t.kind === 'NON_NULL') return `${typeStr(t.ofType)}!`
  if (t.kind === 'LIST') return `[${typeStr(t.ofType)}]`
  return t.name ?? t.kind
}
function baseType(t: TypeRef | null): { name: string | null; kind: string } {
  let cur = t
  while (cur && (cur.kind === 'NON_NULL' || cur.kind === 'LIST')) cur = cur.ofType
  return { name: cur?.name ?? null, kind: cur?.kind ?? '?' }
}

const TYPE_FRAGMENT = /* graphql */ `
  fragment T on __Type {
    name kind
    fields { name type { kind name ofType { kind name ofType { kind name } } } }
    inputFields { name type { kind name ofType { kind name ofType { kind name } } } }
    enumValues { name }
    possibleTypes { name kind }
  }
`

const typeMap = new Map<string, IntroType>()

async function introspectTypes(names: (string | null)[], label: string): Promise<void> {
  const uniq = [...new Set(names.filter((n): n is string => !!n && !typeMap.has(n)))]
  if (uniq.length === 0) return
  const aliases = uniq.map((n, i) => `t${i}: __type(name: ${JSON.stringify(n)}) { ...T }`).join('\n')
  const res = await gql<Record<string, IntroType | null>>(label, `query { ${aliases} }\n${TYPE_FRAGMENT}`)
  if (res?.errors?.length) console.log(`    introspect errors: ${res.errors.map(e => e.message).join('; ')}`)
  for (const v of Object.values(res?.data ?? {})) if (v) typeMap.set(v.name, v)
}

function selectionFor(typeName: string | null, depth: number): string {
  if (!typeName) return '__typename'
  const t = typeMap.get(typeName)
  if (!t) return '__typename'
  if (t.kind === 'UNION' || t.kind === 'INTERFACE') {
    const frags = (t.possibleTypes ?? []).map(pt => `... on ${pt.name} { ${selectionFor(pt.name, depth)} }`)
    return ['__typename', ...frags].join(' ')
  }
  const parts: string[] = []
  for (const f of t.fields ?? []) {
    const b = baseType(f.type)
    if (b.kind === 'SCALAR' || b.kind === 'ENUM') parts.push(f.name)
    else if ((b.kind === 'OBJECT' || b.kind === 'UNION' || b.kind === 'INTERFACE') && b.name) {
      parts.push(depth > 0 ? `${f.name} { ${selectionFor(b.name, depth - 1)} }` : `${f.name} { __typename }`)
    }
  }
  return parts.length ? [...new Set(parts)].join(' ') : '__typename'
}

/** Focused selection: result totals + the data/results list with item fields. */
function resultSelection(typeName: string | null): string {
  if (!typeName) return '__typename'
  const t = typeMap.get(typeName)
  if (!t || t.kind === 'UNION' || t.kind === 'INTERFACE') return selectionFor(typeName, 2)
  const parts: string[] = ['__typename']
  for (const f of t.fields ?? []) {
    const b = baseType(f.type)
    if ((b.kind === 'SCALAR' || b.kind === 'ENUM') && /total|count/i.test(f.name)) parts.push(f.name)
    else if (/data|results|hits|items|edges|nodes/i.test(f.name) && b.name) {
      parts.push(`${f.name} { ${selectionFor(b.name, 2)} }`)
    }
  }
  return parts.length > 1 ? [...new Set(parts)].join(' ') : selectionFor(typeName, 2)
}

function referencedNames(t: IntroType): string[] {
  const out: string[] = []
  for (const pt of t.possibleTypes ?? []) out.push(pt.name)
  for (const f of t.fields ?? []) {
    const b = baseType(f.type)
    if ((b.kind === 'OBJECT' || b.kind === 'UNION' || b.kind === 'INTERFACE') && b.name) out.push(b.name)
  }
  return out
}

// Preferred operator order: partial-match first, exact last.
const OP_PREFERENCE = [
  'match', 'fuzzy', 'contains', 'startswith', 'prefix', 'like', 'ilike', 'search',
  'eq', 'equals', 'is', 'in',
]
function pickOperator(filterTypeName: string | null): { op: string | null; all: string[] } {
  const ops = (filterTypeName ? typeMap.get(filterTypeName)?.inputFields ?? [] : []).map(f => f.name)
  for (const pref of OP_PREFERENCE) {
    const hit = ops.find(o => o.toLowerCase() === pref)
    if (hit) return { op: hit, all: ops }
  }
  return { op: ops[0] ?? null, all: ops }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('ra.co facetedSearch operator probe (term: "adam")\n')

  // ── REQUEST 1: filter inputs + Query (for facetedSearch return type) ────────
  sep('═')
  console.log('STEP 1 & 2 — introspect MatchFilterInputDtoInput, StringFilterInputDtoInput, FilterInputDtoInput\n')

  await introspectTypes(
    ['Query', 'FilterInputDtoInput', 'MatchFilterInputDtoInput', 'StringFilterInputDtoInput'],
    'introspect filters + Query',
  )

  for (const tn of ['MatchFilterInputDtoInput', 'StringFilterInputDtoInput']) {
    const t = typeMap.get(tn)
    console.log(`  ${tn} operators:`)
    if (t?.inputFields?.length) t.inputFields.forEach(f => console.log(`    ${f.name}: ${typeStr(f.type)}`))
    else console.log('    (not found / introspection blocked)')
    console.log()
  }

  // Which filter-input type do `title` and `name` use?
  const filterInput = typeMap.get('FilterInputDtoInput')
  const titleType = baseType(filterInput?.inputFields?.find(f => f.name === 'title')?.type ?? null).name
  const nameType = baseType(filterInput?.inputFields?.find(f => f.name === 'name')?.type ?? null).name
  const titleOp = pickOperator(titleType)
  const nameOp = pickOperator(nameType)
  console.log(`  title: ${titleType ?? '(missing)'}  → operator "${titleOp.op}"  (available: ${titleOp.all.join(', ') || '?'})`)
  console.log(`  name:  ${nameType ?? '(missing)'}  → operator "${nameOp.op}"  (available: ${nameOp.all.join(', ') || '?'})`)

  // facetedSearch return type → build a valid selection for `data`.
  const facetedField = typeMap.get('Query')?.fields?.find(f => f.name === 'facetedSearch')
  const facetedRet = baseType(facetedField?.type ?? null).name
  console.log(`\n  facetedSearch return type: ${facetedRet ?? '(unknown)'}`)

  // ── REQUEST 2 & 3: introspect the return type chain for the selection ───────
  await introspectTypes([facetedRet], 'introspect facetedSearch return type')
  const retType = facetedRet ? typeMap.get(facetedRet) : undefined
  await introspectTypes(retType ? referencedNames(retType) : [], 'introspect data item type')

  const sel = resultSelection(facetedRet)

  // ── REQUEST 4: retry facetedSearch with the correct operator(s) ─────────────
  sep('═')
  console.log('\nSTEP 3 & 4 — facetedSearch for "adam" with the correct operator(s)\n')

  const aliases: string[] = []
  if (titleType && titleOp.op) {
    aliases.push(`byTitle: facetedSearch(types: [${ARTIST_ENUM}], filters: { title: { ${titleOp.op}: "adam" } }, page: 1, pageSize: 5) { ${sel} }`)
  }
  if (nameType && nameOp.op) {
    aliases.push(`byName: facetedSearch(types: [${ARTIST_ENUM}], filters: { name: { ${nameOp.op}: "adam" } }, page: 1, pageSize: 5) { ${sel} }`)
  }

  if (aliases.length === 0) {
    console.log('  (could not resolve title/name filter operators — nothing to attempt)')
  } else {
    const q = `query {\n  ${aliases.join('\n  ')}\n}`
    console.log(`  query:\n${q.split('\n').map(l => '    ' + l).join('\n')}\n`)
    const res = await gql<Record<string, unknown>>('facetedSearch retry', q)
    if (res?.errors?.length) console.log('  ✗ errors:', res.errors.map(e => e.message).join('; '))
    if (res?.data) {
      for (const [alias, val] of Object.entries(res.data)) {
        console.log(`  ── ${alias} ──`)
        console.log('  ' + JSON.stringify(val).slice(0, 1800))
        console.log()
      }
    }
  }

  // ── Report ──────────────────────────────────────────────────────────────────
  sep('═')
  console.log('\nSTEP 5 — report\n')
  console.log(`  Requests used: ${requestCount}/${MAX_REQUESTS}`)
  console.log('  • If byTitle or byName returns real "Adam Beyer"-like items in `data` →')
  console.log('    ra.co CAN do partial-match artist autocomplete (use that field+operator).')
  console.log('  • Empty data / errors with every operator → ra.co stays exact-slug-only.')

  sep()
  console.log('\n── Done ──')
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
