/**
 * Throwaway exploration script — NOT part of the app, not imported anywhere.
 * Phase A: probe followthebeat.nl (a Dutch dance/electronic festival & event
 * agenda) to learn whether it is server-rendered, exposes JSON-LD
 * (MusicEvent / Festival), and whether it has artist pages — so we can pick an
 * artist-first vs agenda-first scraping strategy before building Phase B.
 *
 * Run with:
 *   npx tsx scripts/explore-followthebeat.ts
 */

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

function sep(char = '─', len = 72) { console.log(char.repeat(len)) }

function sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)) }

type FetchResult = {
  status: number
  statusText: string
  finalUrl: string
  html: string
  error?: string
}

async function fetchPage(url: string): Promise<FetchResult> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8',
      },
    })
    const html = await res.text()
    return { status: res.status, statusText: res.statusText, finalUrl: res.url, html }
  } catch (err) {
    return { status: 0, statusText: '', finalUrl: url, html: '', error: String(err) }
  }
}

// Cloudflare / "just a moment" interstitials look like tiny HTML pages.
function isBotChallenge(html: string): boolean {
  return html.length < 10_000 && (
    /just a moment/i.test(html) ||
    /turnstile|__cf_chl_f_tk|cf-browser-verification/i.test(html)
  )
}

// Rough signal: does the page already contain rendered event content, or does
// it look like an empty shell that hydrates client-side?
function looksJsLoaded(html: string): boolean {
  const hasNextData = /__NEXT_DATA__|__NUXT__|window\.__INITIAL_STATE__/i.test(html)
  const hasRoot = /<div[^>]+id=["'](root|app|__next)["']/i.test(html)
  // Very little text but a JS root → likely client-rendered.
  const textApprox = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length
  return (hasNextData || hasRoot) && textApprox < 2_000
}

// ── JSON-LD extraction ────────────────────────────────────────────────────────

/** Parse every <script type="application/ld+json"> block, flattening @graph. */
function extractJsonLd(html: string): Record<string, unknown>[] {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  const nodes: Record<string, unknown>[] = []
  let m: RegExpExecArray | null

  while ((m = re.exec(html)) !== null) {
    let parsed: unknown
    try { parsed = JSON.parse(m[1].trim()) } catch { continue }

    const pushNode = (val: unknown) => {
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        const obj = val as Record<string, unknown>
        if (Array.isArray(obj['@graph'])) {
          for (const g of obj['@graph'] as unknown[]) pushNode(g)
        } else {
          nodes.push(obj)
        }
      }
    }

    if (Array.isArray(parsed)) parsed.forEach(pushNode)
    else pushNode(parsed)
  }

  return nodes
}

/** A node's @type as a normalized string array. */
function typesOf(node: Record<string, unknown>): string[] {
  const t = node['@type']
  if (typeof t === 'string') return [t]
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === 'string')
  return []
}

function summarizeTypes(nodes: Record<string, unknown>[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const n of nodes) for (const t of typesOf(n)) counts[t] = (counts[t] ?? 0) + 1
  return counts
}

const EVENT_TYPE_RE = /event|festival|concert/i

// ── Steps ─────────────────────────────────────────────────────────────────────

async function step1Robots(): Promise<void> {
  sep('═')
  console.log('STEP 1 — robots.txt\n')

  const res = await fetchPage('https://www.followthebeat.nl/robots.txt')
  if (res.error) { console.log(`  ✗ network error: ${res.error}`); return }
  console.log(`  HTTP ${res.status} ${res.statusText}  (final: ${res.finalUrl})`)
  if (res.status !== 200) return

  const lines = res.html.split('\n').map(l => l.trim()).filter(Boolean)
  const relevant = lines.filter(l =>
    /^(user-agent|allow|disallow|crawl-delay|sitemap)/i.test(l)
  )

  console.log(`  ${lines.length} non-empty line(s); directives:\n`)
  relevant.slice(0, 60).forEach(l => console.log(`    ${l}`))

  const paths = ['/artist', '/artiest', '/agenda', '/event', '/festival']
  const touching = relevant.filter(l =>
    /^disallow/i.test(l) && paths.some(p => l.toLowerCase().includes(p))
  )
  const crawlDelay = relevant.find(l => /^crawl-delay/i.test(l))
  console.log('\n  Summary:')
  console.log(`    crawl-delay: ${crawlDelay ?? '(none specified)'}`)
  console.log(`    disallow rules touching artist/agenda/event paths: ${touching.length ? touching.join(' | ') : 'none'}`)
}

async function step2ArtistPages(): Promise<void> {
  sep('═')
  console.log('\nSTEP 2 — Artist page probes (does followthebeat have them?)\n')

  const candidates = [
    'https://www.followthebeat.nl/artiest/adam-beyer/',
    'https://www.followthebeat.nl/artist/adam-beyer/',
  ]

  let first = true
  for (const url of candidates) {
    if (!first) await sleep(500)
    first = false

    const res = await fetchPage(url)
    if (res.error) { console.log(`  ${url}\n    ✗ network error: ${res.error}`); continue }

    const challenge = isBotChallenge(res.html)
    const mentionsArtist = /adam\s*beyer/i.test(res.html)
    const ld = extractJsonLd(res.html)
    const redirected = res.finalUrl.replace(/\/$/, '') !== url.replace(/\/$/, '')

    console.log(`  ${url}`)
    console.log(`    HTTP ${res.status} ${res.statusText}  body=${res.html.length.toLocaleString()} chars`)
    if (redirected) console.log(`    ↪ redirected to: ${res.finalUrl}`)
    console.log(`    bot-challenge: ${challenge ? 'YES' : 'no'}  |  mentions "Adam Beyer": ${mentionsArtist ? 'YES' : 'no'}  |  JSON-LD nodes: ${ld.length}`)
    const verdict =
      res.status === 200 && !challenge && mentionsArtist
        ? '✓ looks like a REAL artist page'
        : res.status === 200 && !challenge
          ? '~ 200 but no artist mention (maybe a generic/landing page)'
          : '✗ not usable'
    console.log(`    → ${verdict}\n`)
  }
}

async function step3Agenda(): Promise<void> {
  sep('═')
  console.log('\nSTEP 3 — Agenda page(s) + JSON-LD MusicEvent/Festival check\n')

  const candidates = [
    'https://www.followthebeat.nl/agenda/',
    'https://www.followthebeat.nl/agenda/genre/electronic/',
  ]

  let first = true
  for (const url of candidates) {
    if (!first) await sleep(500)
    first = false

    const res = await fetchPage(url)
    if (res.error) { console.log(`  ${url}\n    ✗ network error: ${res.error}`); continue }

    const challenge = isBotChallenge(res.html)
    const jsLoaded = looksJsLoaded(res.html)
    const nodes = extractJsonLd(res.html)
    const typeCounts = summarizeTypes(nodes)
    const eventNodes = nodes.filter(n => typesOf(n).some(t => EVENT_TYPE_RE.test(t)))

    console.log(`  ${url}`)
    console.log(`    HTTP ${res.status} ${res.statusText}  body=${res.html.length.toLocaleString()} chars  (final: ${res.finalUrl})`)
    console.log(`    bot-challenge: ${challenge ? 'YES' : 'no'}  |  looks JS-loaded (empty shell): ${jsLoaded ? 'YES' : 'no'}`)
    console.log(`    JSON-LD nodes: ${nodes.length}  |  @type counts: ${JSON.stringify(typeCounts)}`)
    console.log(`    event-like nodes (Event/Festival/Concert/MusicEvent): ${eventNodes.length}`)

    if (eventNodes.length > 0) {
      console.log('\n    First 3 event nodes (full JSON, truncated to 1800 chars each):')
      eventNodes.slice(0, 3).forEach((n, i) => {
        sep('·')
        console.log(`    [node ${i}] @type=${JSON.stringify(typesOf(n))}`)
        console.log(JSON.stringify(n, null, 2).slice(0, 1800))
      })
      sep('·')

      // Pull out the fields we'd map, from the first event node.
      const e = eventNodes[0]
      const loc = (e['location'] ?? {}) as Record<string, unknown>
      const addr = (loc['address'] ?? {}) as Record<string, unknown>
      console.log('\n    Field probe on first event node:')
      console.log(`      name:              ${JSON.stringify(e['name'])}`)
      console.log(`      startDate:         ${JSON.stringify(e['startDate'])}`)
      console.log(`      location.name:     ${JSON.stringify(loc['name'])}`)
      console.log(`      address.locality:  ${JSON.stringify(addr['addressLocality'])}`)
      console.log(`      address.country:   ${JSON.stringify(addr['addressCountry'])}`)
      console.log(`      performer:         ${JSON.stringify(e['performer'])?.slice(0, 200) ?? 'undefined'}`)
      console.log(`      url:               ${JSON.stringify(e['url'])}`)
    } else if (res.status === 200 && !challenge) {
      console.log('    (200 but no event-like JSON-LD — agenda may be a listing without per-event JSON-LD, or JS-rendered)')
    }
    console.log()
  }
}

function step4Report(): void {
  sep('═')
  console.log('\nSTEP 4 — Read the output above and answer:\n')
  console.log('  • Server-rendered or JS-loaded? → STEP 3 "looks JS-loaded" flag + body size.')
  console.log('    Big body with event JSON-LD = server-rendered; tiny shell = client-rendered.')
  console.log('  • JSON-LD available? → STEP 3 "@type counts"; look for MusicEvent / Festival /')
  console.log('    Concert with startDate + location.address (locality/country) + performer.')
  console.log('  • Artist pages exist? → STEP 2: any URL marked "✓ looks like a REAL artist page".')
  console.log('  • Strategy:')
  console.log('      - Artist pages with lineup/JSON-LD → artist-first (like Festivalinfo/festileaks).')
  console.log('      - Only the agenda exposes per-event JSON-LD → agenda-first: scrape the agenda,')
  console.log('        emit events, match performer[] against followed artists.')
  console.log('      - Empty JS shell (no JSON-LD) → likely needs Playwright or a hidden JSON/API endpoint.')
}

async function main() {
  console.log('followthebeat.nl exploration — Phase A\n')
  await step1Robots()
  await sleep(500)
  await step2ArtistPages()
  await sleep(500)
  await step3Agenda()
  step4Report()
  sep()
  console.log('\n── Done ──')
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
