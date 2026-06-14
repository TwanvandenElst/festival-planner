/**
 * Throwaway exploration script — NOT part of the app, not imported anywhere.
 * Phase A: inspect ONE followthebeat.nl artist page to decide how to extract a
 * given artist's upcoming shows (JSON-LD vs HTML) and whether we can tell NL
 * from non-NL events. One request only.
 *
 * Run with:
 *   npx tsx scripts/explore-followthebeat-artist.ts
 */

import * as cheerio from 'cheerio'

const TARGET = 'https://followthebeat.nl/artiesten/adam-beyer/'

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

function sep(char = '─', len = 72) { console.log(char.repeat(len)) }

// ── JSON-LD extraction (flatten @graph) ───────────────────────────────────────

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

function typesOf(node: Record<string, unknown>): string[] {
  const t = node['@type']
  if (typeof t === 'string') return [t]
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === 'string')
  return []
}

const EVENT_TYPE_RE = /event|festival|concert/i

// Dutch date markers, e.g. "12 jul", "za 12 juli 2026", "12-07-2026".
const DATE_RE =
  /\b\d{1,2}\s+(jan|feb|mrt|maart|apr|mei|jun|jul|aug|sep|okt|nov|dec)[a-z]*\b|\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/i

type Loader = ReturnType<typeof cheerio.load>

/** Climb up to ~6 ancestors to find a "row/card" sized chunk of HTML. */
function rowHtml($: Loader, el: cheerio.AnyNode): string {
  let node = $(el)
  for (let i = 0; i < 6; i++) {
    const html = $.html(node)
    if (html.length >= 150 && html.length <= 2500) return html
    const parent = node.parent()
    if (!parent.length) break
    node = parent
  }
  return $.html(node).slice(0, 2500)
}

async function main() {
  console.log('followthebeat.nl artist-page probe — single request')
  console.log(`Target: ${TARGET}`)
  sep('═')

  let res: Response
  try {
    res = await fetch(TARGET, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8',
      },
    })
  } catch (err) {
    console.error('Network error:', err)
    process.exit(1)
  }

  const html = await res.text()
  console.log(`HTTP ${res.status} ${res.statusText}  (final: ${res.url})`)
  console.log(`Body: ${html.length.toLocaleString()} chars`)
  if (!res.ok) { console.log(html.slice(0, 800)); process.exit(1) }

  const $ = cheerio.load(html)
  console.log(`<title>: ${$('title').first().text().trim()}`)

  // ── 2. JSON-LD nodes ──────────────────────────────────────────────────────
  sep('═')
  console.log('\nSTEP 2 — JSON-LD nodes\n')
  const nodes = extractJsonLd(html)
  console.log(`Total nodes: ${nodes.length}`)
  nodes.forEach((n, i) => console.log(`  [${i}] @type=${JSON.stringify(typesOf(n))}`))

  const eventNodes = nodes.filter(n => typesOf(n).some(t => EVENT_TYPE_RE.test(t)))
  console.log(`\nEvent-like nodes (Event/Festival/Concert/MusicEvent): ${eventNodes.length}`)
  eventNodes.forEach((n, i) => {
    sep('·')
    console.log(`[event node ${i}] @type=${JSON.stringify(typesOf(n))}`)
    console.log(JSON.stringify(n, null, 2))
  })
  if (eventNodes.length === 0) {
    console.log('(no event-like JSON-LD on the artist page → shows are likely in the HTML)')
  }

  // ── 3. Locate the upcoming-shows section in the HTML ──────────────────────
  sep('═')
  console.log('\nSTEP 3 — Upcoming-shows section (HTML)\n')

  // 3a. All headings, to reveal section names.
  console.log('Headings (h1–h4):')
  $('h1,h2,h3,h4').each((_, el) => {
    const t = $(el).text().replace(/\s+/g, ' ').trim()
    if (t) console.log(`  <${(el as cheerio.Element).tagName}> ${t.slice(0, 80)}`)
  })

  // 3b. Anchors that look like event/agenda detail links.
  sep()
  console.log('\nEvent/agenda detail links (href contains "/agenda/"), first 5:')
  const eventLinks: { href: string; text: string }[] = []
  const seenHref = new Set<string>()
  $('a[href*="/agenda/"]').each((_, el) => {
    const href = $(el).attr('href') ?? ''
    // skip the agenda listing root and genre filters
    if (/\/agenda\/?$/.test(href) || /\/agenda\/genre\//.test(href)) return
    if (seenHref.has(href)) return
    seenHref.add(href)
    eventLinks.push({ href, text: $(el).text().replace(/\s+/g, ' ').trim().slice(0, 80) })
  })
  eventLinks.slice(0, 5).forEach((l, i) => console.log(`  ${i + 1}. "${l.text}" → ${l.href}`))
  if (eventLinks.length === 0) console.log('  (none found)')

  // 3c. Elements whose OWN text contains a date → likely a show row.
  sep()
  console.log('\nRaw HTML of first 2–3 show rows (located by date pattern):\n')
  const dateEls: cheerio.AnyNode[] = []
  $('*').each((_, el) => {
    if (dateEls.length >= 3) return false
    const own = $(el).clone().children().remove().end().text().replace(/\s+/g, ' ').trim()
    if (own && DATE_RE.test(own)) dateEls.push(el)
  })

  if (dateEls.length === 0) {
    console.log('  No date-bearing rows found by pattern. Falling back to first event link container:')
    if (eventLinks.length > 0) {
      const a = $(`a[href="${eventLinks[0].href}"]`).first()
      if (a.length) console.log(rowHtml($, a.get(0) as cheerio.AnyNode))
    }
  } else {
    dateEls.forEach((el, i) => {
      sep('·')
      console.log(`[row ${i}]`)
      console.log(rowHtml($, el))
    })
    sep('·')
  }

  // ── 4. NL vs non-NL detectability ─────────────────────────────────────────
  sep('═')
  console.log('\nSTEP 4 — Can we tell NL from non-NL?\n')

  const nederlandCount = (html.match(/nederland/gi) ?? []).length
  const nlTokenCount = (html.match(/\bNL\b/g) ?? []).length
  console.log(`  "Nederland" occurrences in page: ${nederlandCount}`)
  console.log(`  standalone "NL" occurrences:     ${nlTokenCount}`)

  // Does a country marker sit inside the located show rows?
  const rowsText = dateEls.map(el => rowHtml($, el)).join('\n')
  const rowHasNederland = /nederland/i.test(rowsText)
  const rowHasCountryFlag = /flag|vlag|🇳🇱|🇧🇪|🇩🇪/i.test(rowsText)
  console.log(`  "Nederland" appears inside a show row: ${rowHasNederland ? 'YES' : 'no'}`)
  console.log(`  flag/country marker inside a show row: ${rowHasCountryFlag ? 'YES' : 'no'}`)
  console.log('\n  → If country/city is inside each row we can filter NL in the row parser.')
  console.log('    If not, we may need to follow each event detail link to get the country.')

  sep()
  console.log('\n── Done ──')
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
