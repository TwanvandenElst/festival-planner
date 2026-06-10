/**
 * Throwaway exploration script — NOT part of the app, not imported anywhere.
 * Fetches ONE detail page and locates the lineup section by finding the
 * "BEVESTIGDE ARTIESTEN" heading, then tries multiple extraction patterns.
 *
 * Run with:
 *   npx tsx scripts/explore-festivalinfo-detail.ts
 */

import * as cheerio from 'cheerio'

const TARGET_URL = 'https://www.festivalinfo.nl/festival/36630/Festival-Mind-the-Gap!/2026/'

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

function sep(char = '─', len = 60) { console.log(char.repeat(len)) }

function isBotChallenge(html: string): boolean {
  return html.length < 10_000 && (
    /<title[^>]*>\s*just a moment/i.test(html) ||
    /turnstile|__cf_chl_f_tk/i.test(html)
  )
}

async function main() {
  console.log('Festivalinfo lineup-structure probe — single request')
  console.log(`Target: ${TARGET_URL}`)
  sep('═')

  let res: Response
  try {
    res = await fetch(TARGET_URL, {
      method: 'GET',
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8' },
    })
  } catch (err) {
    console.error('Network error:', err)
    process.exit(1)
  }

  console.log(`HTTP ${res.status} ${res.statusText}`)
  const html = await res.text()
  console.log(`Body: ${html.length.toLocaleString()} chars\n`)

  if (!res.ok || isBotChallenge(html)) {
    console.error('Blocked or non-OK. Body (first 800 chars):')
    console.log(html.slice(0, 800))
    process.exit(1)
  }

  const $ = cheerio.load(html)

  // ── 1. Find the "BEVESTIGDE ARTIESTEN" heading ────────────────────────────
  sep()
  console.log('Searching for heading "BEVESTIGDE ARTIESTEN" (or similar)…\n')

  // Walk every element; collect those whose text matches (case-insensitive).
  const headingKeywords = /bevestigd|artiesten|lineup|line-up|acts/i
  let headingEl = $()

  $('h1,h2,h3,h4,h5,h6,div,span,p,strong,b').each((_, el) => {
    if (headingEl.length) return false   // stop once found
    const own = $(el).clone().children().remove().end().text().trim()
    if (headingKeywords.test(own)) headingEl = $(el)
  })

  if (headingEl.length) {
    const headingText = headingEl.text().replace(/\s+/g, ' ').trim()
    console.log(`✓ Heading found: "${headingText}"`)
    console.log(`  Tag / class: <${headingEl.prop('tagName')?.toLowerCase()}> class="${headingEl.attr('class') ?? ''}"`)

    // Dump the parent container that wraps the heading (likely wraps the artists too).
    const parent = headingEl.parent()
    const parentHtml = (parent.prop('outerHTML') ?? $.html(parent) ?? '').slice(0, 3000)
    sep()
    console.log('\nRaw HTML of heading\'s parent container (first 3 000 chars):')
    sep()
    console.log(parentHtml)
    sep()
  } else {
    console.log('✗ Heading not found by keyword scan.')
    // Dump a broad HTML slice so we can see what IS there.
    console.log('\nHTML from <body> start (2 000 chars) for manual inspection:')
    sep()
    console.log(($('body').html() ?? html).slice(0, 2000))
    sep()
  }

  // ── 2. Try multiple artist-extraction patterns ────────────────────────────
  sep()
  console.log('\nTrying artist-extraction patterns:\n')

  type Hit = { name: string; tag: string; cls: string; href: string }

  function collectHits(label: string, els: cheerio.Cheerio<cheerio.Element>): Hit[] {
    const hits: Hit[] = []
    const seen = new Set<string>()
    els.each((_, el) => {
      const name = $(el).text().replace(/\s+/g, ' ').trim()
      if (name.length < 2 || name.length > 100 || seen.has(name)) return
      seen.add(name)
      hits.push({
        name,
        tag:  $(el).prop('tagName')?.toLowerCase() ?? '',
        cls:  $(el).attr('class') ?? '',
        href: $(el).attr('href') ?? '',
      })
    })
    console.log(`  Pattern "${label}": ${hits.length} hit(s)`)
    return hits
  }

  const patternA = collectHits('a[href*="/artiest/"]',   $('a[href*="/artiest/"]'))
  const patternB = collectHits('a[href*="/artist/"]',    $('a[href*="/artist/"]'))
  const patternC = collectHits('[class*="artiest"]',     $('[class*="artiest"]'))
  const patternD = collectHits('[class*="artist"]',      $('[class*="artist"]'))
  const patternE = collectHits('[class*="lineup"] li',   $('[class*="lineup"] li'))
  const patternF = collectHits('[class*="acts"] li',     $('[class*="acts"] li'))

  // Also try: li / div children immediately inside the heading's parent.
  let patternG: Hit[] = []
  if (headingEl.length) {
    const siblings = headingEl.parent().find('li, a, span, div').filter((_, el) => {
      const t = $(el).text().replace(/\s+/g, ' ').trim()
      return t.length > 1 && t.length < 80
    })
    patternG = collectHits('li/a/span inside heading parent', siblings)
  }

  // Pick the best (most hits).
  const all = [
    { label: 'a[href*="/artiest/"]',           hits: patternA },
    { label: 'a[href*="/artist/"]',            hits: patternB },
    { label: '[class*="artiest"]',             hits: patternC },
    { label: '[class*="artist"]',              hits: patternD },
    { label: '[class*="lineup"] li',           hits: patternE },
    { label: '[class*="acts"] li',             hits: patternF },
    { label: 'children of heading parent',     hits: patternG },
  ]

  const best = all.reduce((a, b) => b.hits.length > a.hits.length ? b : a)

  sep()
  if (best.hits.length === 0) {
    console.log('\n✗ No artist names found by any pattern.')
    console.log('  Lineup may be dynamically injected or inside an image.')
    process.exit(0)
  }

  console.log(`\n✓ Best pattern: "${best.label}" — ${best.hits.length} distinct name(s)`)
  console.log('\nFirst 25 artist names:')
  best.hits.slice(0, 25).forEach((h, i) => console.log(`  ${i + 1}. ${h.name}`))

  // ── 3. Raw HTML of ONE artist entry ──────────────────────────────────────
  sep()
  const firstHit = best.hits[0]
  console.log('\nRaw HTML of first artist entry (for scraper design):')
  console.log(`  tag="${firstHit.tag}"  class="${firstHit.cls}"  href="${firstHit.href}"\n`)

  // Re-select the element to get its outerHTML.
  const selector = firstHit.href
    ? `a[href="${firstHit.href}"]`
    : `${firstHit.tag || '*'}[class="${firstHit.cls}"]`

  const rawEl = $(selector).first()
  console.log($.html(rawEl).slice(0, 600) || '(could not re-select element)')

  sep()
  console.log('\n── Done ──')
}

main().catch(err => {
  console.error('Fatal:', err.message)
  process.exit(1)
})
