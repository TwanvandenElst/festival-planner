/**
 * Throwaway exploration script — NOT part of the app, not imported anywhere.
 * Probes the Partyflock API (documented in DeviaVir/node-partyflock, 2019) and,
 * if that's gone, falls back to fetching the HTML agenda page so we can see what
 * is actually retrievable today.
 *
 * One request per probe, polite User-Agent, no loops.
 *
 * Run with:
 *   npx tsx scripts/explore-partyflock.ts
 */

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

// ── Helpers ──────────────────────────────────────────────────────────────────

function sep(char = '─', len = 60) {
  console.log(char.repeat(len))
}

async function safeFetch(url: string, init: RequestInit): Promise<Response | null> {
  try {
    return await fetch(url, init)
  } catch (err) {
    console.error(`Network error fetching ${url}:`, err)
    return null
  }
}

// ── Probe 1: documented JSON API ─────────────────────────────────────────────

async function probeApi() {
  const url = 'https://partyflock.nl/api/party/'

  // The old library used Pf-ResultWish to select fields.
  // We ask for the minimum set we care about.
  const headers: Record<string, string> = {
    'User-Agent': UA,
    Accept: 'application/json',
    'Pf-ResultWish': 'partyname,stamp,locationname,city,country,lineup',
    'Pf-HourOffset': '0',
  }

  // Best-guess query params from the library's party/date API pattern.
  const params = new URLSearchParams({
    country: 'NL',
    upcoming: '1',
    limit: '5',
  })

  const fullUrl = `${url}?${params}`
  console.log(`\n── Probe 1: Partyflock JSON API ──`)
  console.log(`GET ${fullUrl}`)
  sep()

  const res = await safeFetch(fullUrl, { method: 'GET', headers })
  if (!res) return false

  console.log(`HTTP ${res.status} ${res.statusText}`)
  console.log('Response headers of interest:')
  for (const h of ['content-type', 'www-authenticate', 'x-error', 'x-ratelimit-limit']) {
    const v = res.headers.get(h)
    if (v) console.log(`  ${h}: ${v}`)
  }

  const body = await res.text()
  if (!res.ok) {
    console.log('\nBody (first 500 chars):')
    console.log(body.slice(0, 500))
    return false
  }

  // If we somehow get a 200, try to parse and display it.
  try {
    const json = JSON.parse(body)
    console.log('\n✓ Got JSON response — raw dump:')
    console.log(JSON.stringify(json, null, 2))
    return true
  } catch {
    console.log('\nGot 200 but body is not JSON. Raw (first 1000 chars):')
    console.log(body.slice(0, 1000))
    return true
  }
}

// ── Probe 2: HTML agenda page ─────────────────────────────────────────────────

async function probeHtmlAgenda() {
  const url = 'https://partyflock.nl/agenda/nederland/'

  console.log(`\n── Probe 2: HTML agenda page ──`)
  console.log(`GET ${url}`)
  sep()

  const res = await safeFetch(url, {
    method: 'GET',
    headers: { 'User-Agent': UA, Accept: 'text/html' },
  })
  if (!res) return

  console.log(`HTTP ${res.status} ${res.statusText}`)
  console.log('Response headers of interest:')
  for (const h of ['content-type', 'x-robots-tag', 'cf-ray', 'server']) {
    const v = res.headers.get(h)
    if (v) console.log(`  ${h}: ${v}`)
  }

  if (!res.ok) {
    const body = await res.text()
    console.log('\nBody (first 500 chars):')
    console.log(body.slice(0, 500))
    return
  }

  const html = await res.text()
  console.log(`\nPage HTML length: ${html.length} chars`)

  // Look for JSON-LD structured data — the easiest machine-readable signal.
  const jsonLdMatches = [...html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)]
  if (jsonLdMatches.length > 0) {
    console.log(`\n✓ Found ${jsonLdMatches.length} JSON-LD block(s):`)
    for (const match of jsonLdMatches.slice(0, 3)) {
      try {
        const parsed = JSON.parse(match[1].trim())
        console.log(JSON.stringify(parsed, null, 2))
      } catch {
        console.log('(could not parse JSON-LD block)')
      }
      sep('─')
    }
  } else {
    console.log('\nNo JSON-LD structured data found.')
  }

  // Heuristic: look for event-like patterns in the raw HTML.
  // Partyflock typically uses class names like "party", "event", "lineup".
  const classHits = (html.match(/class="[^"]*(?:party|event|lineup|agenda)[^"]*"/gi) ?? []).slice(0, 10)
  if (classHits.length > 0) {
    console.log('\nCSS class hints (first 10 event-related classes found):')
    for (const h of classHits) console.log(' ', h)
  }

  // Show a small window of the raw HTML so we can judge structure.
  const agendaIndex = html.indexOf('agenda')
  const snippet = agendaIndex >= 0
    ? html.slice(Math.max(0, agendaIndex - 100), agendaIndex + 600)
    : html.slice(0, 700)
  console.log('\nHTML snippet around first "agenda" occurrence (or page start):')
  sep()
  console.log(snippet)
  sep()
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Partyflock exploration — one request per probe, no loops')
  sep('═')

  const apiWorked = await probeApi()

  if (!apiWorked) {
    console.log('\nAPI probe failed (expected — API was retired). Trying HTML fallback.')
    await probeHtmlAgenda()
  }

  console.log('\n── Done ──')
}

main()
