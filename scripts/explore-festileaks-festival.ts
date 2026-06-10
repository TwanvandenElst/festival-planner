/**
 * Throwaway exploration script — NOT part of the app, not imported anywhere.
 * Phase A: read-only. Inspects Festileaks festival pages for location data.
 *
 * Run with:
 *   npx tsx scripts/explore-festileaks-festival.ts
 */

import * as cheerio from 'cheerio'

const FESTIVALS = [
  { label: 'NL',  url: 'https://festileaks.com/festival/awakenings-summer-festival/2026/' },
  { label: 'BE',  url: 'https://festileaks.com/festival/xo-belgium-extrema-outdoor/2026/' },
]

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

function sep(char = '─', len = 64) { console.log(char.repeat(len)) }

async function fetchPage(url: string) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8',
    },
  })
  return { ok: res.ok, status: res.status, html: await res.text() }
}

async function inspectFestival(label: string, url: string) {
  sep('═')
  console.log(`FESTIVAL [${label}]: ${url}\n`)

  const { ok, status, html } = await fetchPage(url)
  console.log(`HTTP ${status}  body: ${html.length.toLocaleString()} chars`)
  if (!ok) { console.log('Non-OK — skipping.'); return }

  const $ = cheerio.load(html)
  console.log(`Page title: "${$('title').text().trim()}"`)

  // ── 1. JSON-LD ────────────────────────────────────────────────────────────────
  sep()
  console.log('\nJSON-LD blocks:')
  const blocks = $('script[type="application/ld+json"]')
  console.log(`  Count: ${blocks.length}`)

  let foundLocationInJsonLd = false

  blocks.each((i, el) => {
    const raw = $(el).html() ?? ''
    let parsed: unknown
    try { parsed = JSON.parse(raw) } catch {
      console.log(`  Block ${i + 1}: parse error`)
      return
    }

    // Walk the object looking for anything with location / address / country
    function hasGeo(node: unknown): boolean {
      if (!node || typeof node !== 'object') return false
      if (Array.isArray(node)) return node.some(hasGeo)
      const obj = node as Record<string, unknown>
      if ('addressCountry' in obj || 'addressLocality' in obj || 'location' in obj) return true
      return Object.values(obj).some(hasGeo)
    }

    const interesting = hasGeo(parsed)
    console.log(`\n  Block ${i + 1} (${raw.length} chars) — ${interesting ? '✓ contains location data' : 'no location fields'}`)
    // Always print the full block (up to 1200 chars) so we can see the shape
    console.log(JSON.stringify(parsed, null, 2).slice(0, 1200))
    if (interesting) foundLocationInJsonLd = true
  })

  // ── 2. Presence checks ────────────────────────────────────────────────────────
  sep()
  console.log('\nPresence checks in raw HTML:')

  const geoTerms = [
    'Nederland', 'Netherlands', 'Belgium', 'België', 'Belgique',
    'Hilvarenbeek', 'addressCountry', 'addressLocality',
  ]
  for (const term of geoTerms) {
    const count = html.split(term).length - 1
    if (count > 0) console.log(`  ✓ "${term}": ${count}×`)
  }

  // ── 3. Element hunt — city / country in the DOM ───────────────────────────────
  sep()
  console.log('\nDOM elements whose own text contains a location hint:')

  const geoRe = /nederland|netherlands|belgium|belgië|belgique|hilvarenbeek|\bNL\b|\bBE\b/i
  const geoHits: string[] = []

  $('*').each((_, el) => {
    const own = $(el).clone().children().remove().end().text().replace(/\s+/g, ' ').trim()
    if (geoRe.test(own) && own.length < 300) {
      const tag = $(el).prop('tagName')?.toLowerCase() ?? '?'
      const cls = $(el).attr('class') ?? ''
      const id  = $(el).attr('id')    ?? ''
      geoHits.push(`<${tag}${id ? ` id="${id}"` : ''}${cls ? ` class="${cls}"` : ''}>: "${own}"`)
    }
  })

  if (geoHits.length > 0) {
    console.log(`  ${geoHits.length} element(s) found:`)
    geoHits.slice(0, 12).forEach(h => console.log(`    ${h}`))
  } else {
    console.log('  ✗ No elements found — country may be JS-injected.')
  }

  // ── 4. Flag images ─────────────────────────────────────────────────────────────
  sep()
  console.log('\nFlag / country images:')
  let flagCount = 0
  $('img').each((_, el) => {
    const alt = $(el).attr('alt') ?? ''
    const src = $(el).attr('src') ?? ''
    if (/flag|land|country|nederland|belgium|\.nl\b|\.be\b/i.test(alt + src)) {
      console.log(`  alt="${alt}"  src="${src.slice(0, 120)}"`)
      flagCount++
    }
  })
  if (flagCount === 0) console.log('  (none)')

  // ── 5. Raw HTML around the location info ─────────────────────────────────────
  sep()
  console.log('\nRaw HTML snippets around location / address info:')

  // Strategy A: find elements with address/location-like class or itemprop
  const locationSelectors = [
    '[class*="location"]', '[class*="address"]', '[class*="country"]',
    '[class*="city"]',     '[class*="place"]',   '[class*="venue"]',
    '[itemprop*="address"]', '[itemprop*="location"]', '[itemprop*="country"]',
  ]

  let printed = 0
  for (const sel of locationSelectors) {
    const els = $(sel)
    if (els.length === 0) continue
    els.each((_, el) => {
      if (printed >= 4) return false
      const h = $.html(el as Parameters<typeof $.html>[0])
      if (h.length < 20 || h.length > 3000) return
      console.log(`\n  Selector: ${sel}`)
      console.log(h.slice(0, 1000))
      printed++
    })
    if (printed >= 4) break
  }

  // Strategy B: if nothing above matched, search for the nearest container
  // around the first occurrence of "Nederland"/"Belgium" in the HTML
  if (printed === 0) {
    console.log('  (no address/location class selectors matched)')

    const geoStr = label === 'NL' ? 'Nederland' : 'Belgium'
    const idx = html.indexOf(geoStr)
    if (idx >= 0) {
      console.log(`\n  Raw HTML slice ±400 chars around first "${geoStr}" (pos ${idx}):`)
      sep('·')
      console.log(html.slice(Math.max(0, idx - 400), idx + 400))
      sep('·')
    }
  }

  // ── 6. Mini verdict ───────────────────────────────────────────────────────────
  sep()
  console.log('\nVERDICT:')
  if (foundLocationInJsonLd) {
    console.log('  ✓ Location data IS in JSON-LD — addressCountry/addressLocality readable without DOM.')
  } else if (geoHits.length > 0) {
    console.log('  ✓ Location data IS in raw HTML DOM (see element list above).')
    console.log('    → Need to pin down the right selector; see elements above.')
  } else {
    console.log('  ✗ Location NOT found in raw HTML.')
    console.log('    → JS-injected. Would need Playwright or a different signal.')
  }
}

async function main() {
  console.log('Festileaks festival-page location diagnostic — 2 requests\n')

  for (const { label, url } of FESTIVALS) {
    await inspectFestival(label, url)
    console.log()
  }

  console.log('\n── Done ──')
}

main().catch(err => {
  console.error('Fatal:', err.message)
  process.exit(1)
})
