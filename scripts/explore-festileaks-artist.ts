/**
 * Throwaway exploration script — NOT part of the app, not imported anywhere.
 * Phase A diagnostic: pinpoint where date, city, country live in Festileaks
 * festival rows for an artist page.
 *
 * Run with:
 *   npx tsx scripts/explore-festileaks-artist.ts
 */

import * as cheerio from 'cheerio'

const ARTIST_URL = 'https://festileaks.com/artist/adam-beyer/'

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

function sep(char = '─', len = 64) { console.log(char.repeat(len)) }

// ── Dutch date parser ─────────────────────────────────────────────────────────
// Handles: "10 juli 2026", "10-12 juli 2026", "10 t/m 12 juli 2026"

const DUTCH_MONTHS: Record<string, string> = {
  januari: '01', februari: '02', maart: '03', april: '04',
  mei: '05', juni: '06', juli: '07', augustus: '08',
  september: '09', oktober: '10', november: '11', december: '12',
}

function parseDutchDate(raw: string): { startDate: string; endDate: string; input: string } {
  const s = raw.replace(/\s+/g, ' ').trim().toLowerCase()

  // Find the year
  const yearMatch = s.match(/\b(20\d{2})\b/)
  const year = yearMatch ? yearMatch[1] : '????'

  // Find the month name
  let month = '??'
  for (const [name, num] of Object.entries(DUTCH_MONTHS)) {
    if (s.includes(name)) { month = num; break }
  }

  // Find day(s): "10", "10-12", "10 t/m 12", "10 en 12"
  const dayRange = s.match(/\b(\d{1,2})\s*(?:-|t\/m|en)\s*(\d{1,2})\b/)
  const singleDay = s.match(/\b(\d{1,2})\b/)

  let startDate = '????-??-??'
  let endDate   = ''

  if (dayRange) {
    const d1 = dayRange[1].padStart(2, '0')
    const d2 = dayRange[2].padStart(2, '0')
    startDate = `${year}-${month}-${d1}`
    endDate   = `${year}-${month}-${d2}`
  } else if (singleDay) {
    startDate = `${year}-${month}-${singleDay[1].padStart(2, '0')}`
  }

  return { startDate, endDate, input: raw }
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Festileaks row-anatomy diagnostic — one request`)
  console.log(`URL: ${ARTIST_URL}\n`)

  const res = await fetch(ARTIST_URL, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8',
    },
  })
  const html = await res.text()
  console.log(`HTTP ${res.status}  body: ${html.length.toLocaleString()} chars\n`)

  if (!res.ok) { console.error('Non-OK response'); process.exit(1) }

  const $ = cheerio.load(html)

  // ── 1. Broad presence checks ─────────────────────────────────────────────────
  sep('═')
  console.log('1. BROAD PRESENCE CHECKS\n')

  const checks: [string, string][] = [
    ['Hilvarenbeek',     'Hilvarenbeek'],
    ['Nederland',        'Nederland'],
    ['Netherlands',      'Netherlands'],
    ['"NL"',             '"NL"'],
    ['flag (any img alt/src)', 'flag'],
    ['/festival/ links', '/festival/'],
  ]
  for (const [label, needle] of checks) {
    const count = html.split(needle).length - 1
    console.log(`  ${count > 0 ? '✓' : '✗'}  "${label}": ${count} occurrence(s)`)
  }

  // Report every img whose alt or src contains country/flag/land hints
  console.log('\n  All imgs with flag/country hint in alt or src:')
  let flagImgCount = 0
  $('img').each((_, el) => {
    const alt = $(el).attr('alt') ?? ''
    const src = $(el).attr('src') ?? ''
    if (/flag|land|country|nederland|nl\b/i.test(alt + src)) {
      console.log(`    alt="${alt}"  src="${src}"`)
      flagImgCount++
    }
  })
  if (flagImgCount === 0) console.log('    (none)')

  // ── 2. Collect festival links ────────────────────────────────────────────────
  sep('═')
  console.log('\n2. FESTIVAL ROW CONTAINERS — first 3 (full HTML)\n')

  const festLinks: ReturnType<typeof $>[] = []
  const seenHrefs = new Set<string>()

  $('a').each((_, el) => {
    if (festLinks.length >= 3) return false
    const href = $(el).attr('href') ?? ''
    if (!/\/festival\//i.test(href)) return
    if (seenHrefs.has(href)) return
    seenHrefs.add(href)
    festLinks.push($(el))
  })

  console.log(`  Total /festival/ links on page: ${$('a[href*="/festival/"]').length}`)
  console.log(`  Examining first ${festLinks.length}\n`)

  for (let i = 0; i < festLinks.length; i++) {
    const link = festLinks[i]
    const href = link.attr('href') ?? ''
    const linkText = link.text().replace(/\s+/g, ' ').trim()

    sep()
    console.log(`\nROW ${i + 1}: "${linkText}"  href="${href}"`)

    // Walk up the DOM trying progressively broader containers.
    // Stop at the first ancestor that is ≥ 200 chars of HTML (enough to
    // hold date + city + country) but ≤ 6 000 chars (not the whole page).
    let container = link.parent()
    let depth = 0
    while (depth < 10) {
      const size = $.html(container).length
      if (size >= 200 && size <= 6000) break
      if (size > 6000) break          // already too big — use previous
      container = container.parent()
      depth++
    }

    const rawHtml = $.html(container)
    console.log(`  Container: depth=${depth}  tag=<${container.prop('tagName')?.toLowerCase()}>  class="${container.attr('class') ?? ''}"  id="${container.attr('id') ?? ''}"  html-size=${rawHtml.length}`)
    console.log('\n  Full container HTML (up to 2 500 chars):')
    sep('·')
    console.log(rawHtml.slice(0, 2500))
    sep('·')

    // ── Date extraction attempt ────────────────────────────────────────────────
    // Collect all text nodes / span text inside the container
    const textNodes: string[] = []
    container.find('*').addBack().each((_, el) => {
      const own = $(el).clone().children().remove().end().text().replace(/\s+/g, ' ').trim()
      if (own.length > 1) textNodes.push(own)
    })
    // Find the first text that looks like a date (contains a Dutch month or dd-dd pattern)
    const dutchMonthRe = /\b(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\b/i
    const dateLike = textNodes.find(t => dutchMonthRe.test(t) || /\b\d{1,2}-\d{1,2}\b/.test(t))

    if (dateLike) {
      const parsed = parseDutchDate(dateLike)
      console.log(`\n  Date text found : "${dateLike}"`)
      console.log(`  Parsed start    : ${parsed.startDate}`)
      console.log(`  Parsed end      : ${parsed.endDate || '(same as start)'}`)
    } else {
      console.log(`\n  No date-like text found in container.`)
      console.log(`  All text nodes: ${textNodes.slice(0, 10).map(t => `"${t}"`).join(', ')}`)
    }

    // ── City / country hunt inside this container ──────────────────────────────
    const innerHtml = rawHtml.toLowerCase()
    const cityHit    = innerHtml.includes('hilvarenbeek') ? '✓ Hilvarenbeek found' : '✗ Hilvarenbeek not in container'
    const countryHit = innerHtml.includes('nederland') || innerHtml.includes('"nl"')
      ? '✓ country signal found'
      : '✗ no NL/Nederland in container'
    console.log(`  City check    : ${cityHit}`)
    console.log(`  Country check : ${countryHit}`)
  }

  // ── 3. Broader hunt for city/country anywhere on the page ────────────────────
  sep('═')
  console.log('\n3. CITY / COUNTRY — BROADER PAGE HUNT\n')

  // Find every element whose own text contains "Hilvarenbeek" or "Nederland"
  const geoHits: string[] = []
  $('*').each((_, el) => {
    const own = $(el).clone().children().remove().end().text().replace(/\s+/g, ' ').trim()
    if (/hilvarenbeek|nederland|netherlands/i.test(own) && own.length < 300) {
      const tag = $(el).prop('tagName')?.toLowerCase() ?? '?'
      const cls = $(el).attr('class') ?? ''
      geoHits.push(`<${tag} class="${cls}">: "${own}"`)
    }
  })

  if (geoHits.length > 0) {
    console.log(`  Elements containing Hilvarenbeek / Nederland (${geoHits.length}):`)
    geoHits.slice(0, 10).forEach(h => console.log(`    ${h}`))
  } else {
    console.log('  ✗ "Hilvarenbeek" and "Nederland" not found in ANY element text.')
    console.log('  → City/country are almost certainly JS-injected and not in raw HTML.')
  }

  // ── 4. JS-injection hints ─────────────────────────────────────────────────────
  sep('═')
  console.log('\n4. JS-INJECTION HINTS\n')

  const scriptHints: string[] = []
  $('script:not([src])').each((_, el) => {
    const src = $(el).html() ?? ''
    for (const line of src.split('\n')) {
      if (/fetch\(|XMLHttpRequest|ajax|location|country|city|stad/i.test(line)) {
        const t = line.trim().slice(0, 160)
        if (t) scriptHints.push(t)
      }
    }
  })

  if (scriptHints.length > 0) {
    console.log(`  Inline script lines hinting at dynamic loading (${scriptHints.length}):`)
    scriptHints.slice(0, 10).forEach(h => console.log(`    ${h}`))
  } else {
    console.log('  No inline script lines mentioning fetch/ajax/location/country.')
  }

  const dataEls: string[] = []
  $('[data-url],[data-city],[data-country],[data-location],[data-lat],[data-lon]').each((_, el) => {
    const attrs = Object.entries((el as unknown as { attribs: Record<string, string> }).attribs)
      .filter(([k]) => /url|city|country|location|lat|lon/i.test(k))
      .map(([k, v]) => `${k}="${v}"`)
      .join(' ')
    if (attrs) dataEls.push(`<${$(el).prop('tagName')?.toLowerCase()}> ${attrs}`)
  })

  if (dataEls.length > 0) {
    console.log(`\n  data-* attributes with geo/url hints (${dataEls.length}):`)
    dataEls.slice(0, 8).forEach(d => console.log(`    ${d}`))
  } else {
    console.log('\n  No data-city/data-country/data-location attributes found.')
  }

  // ── 5. Verdict ────────────────────────────────────────────────────────────────
  sep('═')
  console.log('\n5. VERDICT\n')

  const cityInHtml    = html.includes('Hilvarenbeek')
  const countryInHtml = /nederland|"NL"/i.test(html)

  if (cityInHtml || countryInHtml) {
    console.log('  ✓ City/country ARE in the raw HTML somewhere — see section 3 for the element.')
    console.log('    → Scraper can extract them without JS rendering.')
  } else {
    console.log('  ✗ City/country NOT found in raw HTML.')
    console.log('    → JS-injected. Options:')
    console.log('      a) Playwright render (heavier)')
    console.log('      b) Fetch each linked festival page for city/country')
    console.log('      c) Accept festival name + date only; derive country from domain (festileaks = NL-focused)')
  }

  sep()
  console.log('\n── Done ──')
}

main().catch(err => {
  console.error('Fatal:', err.message)
  process.exit(1)
})
