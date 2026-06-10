/**
 * Throwaway exploration script — NOT part of the app, not imported anywhere.
 * Makes a single GET request to festivalinfo.nl/festivals/ and reports:
 *   1. HTTP status + content-type
 *   2. Whether the page is server-rendered (real listings in HTML) or blocked
 *   3. Up to 5 extracted festival listings as proof of concept
 *   4. A raw HTML snippet of one listing so we can see the exact structure
 *
 * robots.txt allows /festivals/ with Crawl-delay: 1 (fine for a single request).
 * Note: site sits behind Cloudflare (cf-ray header is normal, not a block).
 *
 * Run with:
 *   npx tsx scripts/explore-festivalinfo.ts
 */

import * as cheerio from 'cheerio'

const TARGET_URL = 'https://www.festivalinfo.nl/festivals/'

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

function sep(char = '─', len = 60) {
  console.log(char.repeat(len))
}

// ── Bot-challenge detection ───────────────────────────────────────────────────
// cf-ray alone just means Cloudflare CDN — don't flag that.
// Only flag if the body is also tiny AND contains actual challenge fingerprints.

function detectBotChallenge(html: string): string | null {
  const isSmall = html.length < 10_000
  const hasChallenge =
    /<title[^>]*>\s*just a moment/i.test(html) ||
    /turnstile|cf-challenge|__cf_chl_f_tk/i.test(html)

  if (isSmall && hasChallenge) return 'Cloudflare challenge page (small body + challenge script)'
  if (isSmall) return `Suspiciously small body (${html.length} chars) — possible bot gate or empty page`
  return null
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Festivalinfo exploration — single request')
  console.log(`Target: ${TARGET_URL}`)
  sep('═')

  let res: Response
  try {
    res = await fetch(TARGET_URL, {
      method: 'GET',
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8' },
    })
  } catch (err) {
    console.error('Network error — request never left the machine:', err)
    process.exit(1)
  }

  // ── 1. Status + headers ────────────────────────────────────────────────────

  console.log(`\nHTTP ${res.status} ${res.statusText}`)
  console.log('Headers of interest:')
  for (const h of ['content-type', 'cf-ray', 'server', 'x-powered-by', 'cache-control']) {
    const v = res.headers.get(h)
    if (v) console.log(`  ${h}: ${v.slice(0, 120)}`)
  }

  const html = await res.text()
  console.log(`Body length: ${html.length.toLocaleString()} chars`)

  if (!res.ok) {
    console.log('\nNon-OK status. Body (first 600 chars):')
    sep()
    console.log(html.slice(0, 600))
    process.exit(0)
  }

  // ── 2. Bot-challenge check ─────────────────────────────────────────────────

  sep()
  const challenge = detectBotChallenge(html)
  if (challenge) {
    console.log(`\n⚠  BLOCKED: ${challenge}`)
    console.log('\nRaw body (first 1 000 chars):')
    sep()
    console.log(html.slice(0, 1000))
    process.exit(0)
  }
  console.log('\n✓ Page appears server-rendered (large body, no challenge fingerprint).')

  // ── 3. Parse with Cheerio ─────────────────────────────────────────────────

  sep()
  const $ = cheerio.load(html)

  // Find all anchor tags whose href contains /festival/ — these are detail links.
  const festivalLinks = $('a[href*="/festival/"]')
  console.log(`\nAnchors with /festival/ in href: ${festivalLinks.length}`)

  const datetimeCount = $('[datetime]').length
  const timeTagCount  = $('time').length
  console.log(`<time> tags: ${timeTagCount}   datetime= attributes: ${datetimeCount}`)

  if (festivalLinks.length === 0) {
    console.log('\n✗ No /festival/ links found in raw HTML.')
    console.log('Listings may be loaded via AJAX (/ajx/* — disallowed in robots.txt).')
    console.log('\nHTML snippet (first 1 500 chars of <body>):')
    sep()
    console.log($('body').html()?.slice(0, 1500) ?? html.slice(0, 1500))
    process.exit(0)
  }

  console.log('\n✓ Festival links found in raw HTML — page is Cheerio-parseable.')

  // ── 4. Extract up to 5 festival listings ─────────────────────────────────

  sep()
  console.log('\nExtracting up to 5 festivals:')
  sep()

  type Listing = { name: string; dates: string; location: string; url: string; rawHtml: string }
  const seen = new Set<string>()
  const listings: Listing[] = []

  festivalLinks.each((_i, el) => {
    if (listings.length >= 5) return false // stop early

    const href = $(el).attr('href') ?? ''
    // Skip anchors that are clearly navigation/social/etc (very short text)
    const rawHtml = $.html(el)

    // Resolve relative URLs
    const url = href.startsWith('http') ? href : `https://www.festivalinfo.nl${href}`
    if (seen.has(url)) return
    seen.add(url)

    // Name: prefer an element with a "name" or "title" class inside, else the link text
    const nameEl = $(el).find('[class*="name"],[class*="title"],[class*="naam"]').first()
    const name = (nameEl.length ? nameEl.text() : $(el).text()).replace(/\s+/g, ' ').trim()
    if (name.length < 2) return

    // Date: look for <time> or [datetime] inside this link, or nearby text
    const timeEl = $(el).find('time,[datetime]').first()
    const dates = timeEl.attr('datetime') ?? timeEl.text().replace(/\s+/g, ' ').trim()

    // Location/city: look for an element hinting at location
    const locEl = $(el).find('[class*="city"],[class*="location"],[class*="place"],[class*="stad"]').first()
    const location = locEl.text().replace(/\s+/g, ' ').trim()

    listings.push({ name, dates, location, url, rawHtml })
  })

  if (listings.length === 0) {
    console.log('Could not extract structured data from festival links (text too short / navigation links).')
    console.log('Print the raw snippet below to inspect the structure manually.')
  } else {
    for (const l of listings) {
      console.log(`Name     : ${l.name}`)
      console.log(`Dates    : ${l.dates || '(not found in this element)'}`)
      console.log(`Location : ${l.location || '(not found in this element)'}`)
      console.log(`URL      : ${l.url}`)
      sep('·')
    }
    console.log('\nNote: lineup is on the individual festival detail pages (second request per show).')
  }

  // ── 5. Raw HTML snippet of first listing ─────────────────────────────────

  sep()
  console.log('\nRaw HTML of first /festival/ anchor (for scraper design):')
  sep()

  const firstRaw = listings[0]?.rawHtml
    ?? $.html(festivalLinks.first())
    ?? '(none)'
  console.log(firstRaw.slice(0, 1500))

  sep()
  console.log('\n── Done ──')
}

main()
