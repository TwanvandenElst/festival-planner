/**
 * Throwaway exploration script — NOT part of the app, not imported anywhere.
 * Phase A: find out how to search Festileaks for festivals by name (for the
 * /festivals attendance feature). We don't know the search URL/param yet, so it
 * tries a small ordered list of candidates POLITELY (delay between, stops at the
 * first that returns festival results) and reports structure.
 *
 * Known from the existing scraper: base https://festileaks.com, festival detail
 * URLs look like /festival/<slug>/<year>/ and carry JSON-LD @type "Festival".
 *
 * Run with:
 *   npx tsx scripts/explore-festileaks-search.ts
 */

import * as cheerio from 'cheerio'

const TERM = 'Awakenings'

// Ordered candidates: agenda page with common search params, then a /festivals/
// variant, then the generic WordPress search. Stops at the first that yields
// festival links.
const CANDIDATES = [
  `https://festileaks.com/festivalagenda/?search=${TERM}`,
  `https://festileaks.com/festivalagenda/?q=${TERM}`,
  `https://festileaks.com/festivalagenda/?s=${TERM}`,
  `https://festileaks.com/festivals/?search=${TERM}`,
  `https://festileaks.com/?s=${TERM}`,
]

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

// Festival detail URL shape, e.g. /festival/awakenings-festival/2026/
const DETAIL_RE = /\/festival\/[^/]+\/\d{4}\//
// Dutch date markers, e.g. "12 jul", "za 12 juli 2026", "12-07-2026".
const DATE_RE =
  /\b\d{1,2}\s+(jan|feb|mrt|maart|apr|mei|jun|jul|aug|sep|okt|nov|dec)[a-z]*\b|\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/i

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

function isBotChallenge(html: string): boolean {
  return html.length < 10_000 && (
    /just a moment/i.test(html) ||
    /turnstile|__cf_chl_f_tk|cf-browser-verification/i.test(html)
  )
}

// Empty shell that hydrates client-side?
function looksJsLoaded(html: string): boolean {
  const hasShell = /__NEXT_DATA__|__NUXT__|window\.__INITIAL_STATE__|<div[^>]+id=["'](root|app)["']/i.test(html)
  const textApprox = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length
  return hasShell && textApprox < 2_000
}

type Loader = ReturnType<typeof cheerio.load>

function rowHtml($: Loader, el: cheerio.AnyNode): string {
  let node = $(el)
  for (let i = 0; i < 6; i++) {
    const html = $.html(node)
    if (html.length >= 120 && html.length <= 2200) return html
    const parent = node.parent()
    if (!parent.length) break
    node = parent
  }
  return $.html(node).slice(0, 2200)
}

type FestivalHit = { name: string; url: string; date: string; rowText: string }

/** Collect distinct festival detail links and best-effort name/date/location. */
function extractFestivals($: Loader, max: number): { hits: FestivalHit[]; total: number; firstRowHtml: string } {
  const seen = new Set<string>()
  const hits: FestivalHit[] = []
  let firstRowHtml = ''

  const anchors = $('a[href]').toArray().filter(el => DETAIL_RE.test($(el).attr('href') ?? ''))

  for (const el of anchors) {
    const hrefRaw = $(el).attr('href') ?? ''
    const url = (hrefRaw.startsWith('http') ? hrefRaw : `https://festileaks.com${hrefRaw}`).split('?')[0]
    if (seen.has(url)) continue
    seen.add(url)

    // Name: prefer a heading near the link, else the link's own text.
    let node = $(el)
    let heading = ''
    for (let i = 0; i < 5 && !heading; i++) {
      heading = node.find('h2,h3,h4').first().text().replace(/\s+/g, ' ').trim()
      node = node.parent()
    }
    const name = heading || $(el).text().replace(/\s+/g, ' ').trim() || '(no name found)'

    const block = rowHtml($, el)
    if (!firstRowHtml) firstRowHtml = block
    const rowText = cheerio.load(block).root().text().replace(/\s+/g, ' ').trim()
    const dateMatch = rowText.match(DATE_RE)

    hits.push({ name, url, date: dateMatch ? dateMatch[0] : '(none found)', rowText: rowText.slice(0, 160) })
    if (hits.length >= max) break
  }

  return { hits, total: seen.size, firstRowHtml }
}

async function main() {
  console.log(`Festileaks search probe — term "${TERM}"\n`)

  let firstHit = false

  for (let i = 0; i < CANDIDATES.length; i++) {
    if (i > 0) await sleep(800) // polite spacing between candidates
    const url = CANDIDATES[i]
    sep('═')
    console.log(`CANDIDATE ${i + 1}/${CANDIDATES.length}: ${url}`)

    const res = await fetchPage(url)
    if (res.error) { console.log(`  ✗ network error: ${res.error}`); continue }

    const challenge = isBotChallenge(res.html)
    const jsLoaded = looksJsLoaded(res.html)
    const mentionsTerm = new RegExp(TERM, 'i').test(res.html)
    const $ = cheerio.load(res.html)
    const festivalLinks = $('a[href]').toArray().filter(el => DETAIL_RE.test($(el).attr('href') ?? '')).length

    console.log(`  HTTP ${res.status} ${res.statusText}  body=${res.html.length.toLocaleString()} chars`)
    if (res.finalUrl.replace(/\/$/, '') !== url.replace(/\/$/, '')) console.log(`  ↪ redirected to: ${res.finalUrl}`)
    console.log(`  bot-challenge: ${challenge ? 'YES' : 'no'}  |  looks JS-loaded: ${jsLoaded ? 'YES' : 'no'}  |  mentions "${TERM}": ${mentionsTerm ? 'YES' : 'no'}`)
    console.log(`  festival detail links on page: ${festivalLinks}`)

    if (challenge || festivalLinks === 0) {
      console.log('  → no usable festival results here, trying next candidate…')
      continue
    }

    // First candidate with festival links: extract and report, then stop.
    firstHit = true
    const { hits, total, firstRowHtml } = extractFestivals($, 3)
    const matching = hits.filter(h => new RegExp(TERM, 'i').test(h.name) || new RegExp(TERM, 'i').test(h.url)).length

    console.log(`\n  ✓ SERVER-RENDERED results found here.`)
    console.log(`  distinct festival links: ${total}  |  of the first 3, matching "${TERM}": ${matching}`)
    console.log(`  (If matching is 0 but many links exist, the search param was likely ignored.)`)
    console.log('\n  First 3 festivals:')
    hits.forEach((h, n) => {
      console.log(`    ${n + 1}. ${h.name}`)
      console.log(`       date: ${h.date}`)
      console.log(`       url:  ${h.url}`)
      console.log(`       row:  ${h.rowText}`)
    })

    sep('·')
    console.log('  Raw HTML of the first result row (for parser design):')
    console.log(firstRowHtml)
    break
  }

  sep('═')
  if (!firstHit) {
    console.log('No candidate returned server-rendered festival links.')
    console.log('Likely next steps: the search may be JS/AJAX-driven (check admin-ajax or an')
    console.log('API endpoint), or the agenda uses a different param. Re-run with a different URL.')
  } else {
    console.log('Done. Use the working candidate URL + the row structure above to design the search.')
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
