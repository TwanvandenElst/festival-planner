/**
 * Throwaway exploration script — NOT part of the app, not imported anywhere.
 * Phase A diagnostic: why does the /zoek/ search return no artist links?
 *
 * Run with:
 *   npx tsx scripts/explore-festivalinfo-artist.ts
 */

import * as cheerio from 'cheerio'

const ARTIST_NAME = 'Adam Beyer'

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

function sep(char = '─', len = 64) { console.log(char.repeat(len)) }

function isBotChallenge(html: string): boolean {
  return html.length < 10_000 && (
    /<title[^>]*>\s*just a moment/i.test(html) ||
    /turnstile|__cf_chl_f_tk/i.test(html)
  )
}

async function main() {
  const query = encodeURIComponent(ARTIST_NAME).replace(/%20/g, '+')
  const url = `https://www.festivalinfo.nl/zoek/?zoeken=${query}`

  console.log('Festivalinfo /zoek/ diagnostic — one request')
  console.log(`URL: ${url}\n`)

  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8',
    },
  })
  const html = await res.text()

  console.log(`HTTP ${res.status}  body: ${html.length.toLocaleString()} chars`)
  console.log(`Content-Type: ${res.headers.get('content-type') ?? '(none)'}`)
  if (isBotChallenge(html)) {
    console.log('\n⚠  Bot challenge page detected. Nothing useful below.')
    console.log(html.slice(0, 800))
    return
  }

  // ── 1. Presence checks ───────────────────────────────────────────────────────
  sep('═')
  console.log('\n1. RAW TEXT PRESENCE CHECKS\n')

  const checks: [string, string | RegExp][] = [
    ['GEVONDEN IN ARTIESTEN (exact)',  'GEVONDEN IN ARTIESTEN'],
    ['gevonden in artiesten (lower)',  'gevonden in artiesten'],
    ['"artiesten" anywhere',           'artiesten'],
    ['"Adam Beyer" (spaced)',          'Adam Beyer'],
    ['"Adam-Beyer" (slug)',            'Adam-Beyer'],
    ['"/artist/" anywhere',           '/artist/'],
    ['"/artiest/" anywhere',          '/artiest/'],
  ]

  for (const [label, needle] of checks) {
    if (typeof needle === 'string') {
      const count = html.split(needle).length - 1
      const found = count > 0
      console.log(`  ${found ? '✓' : '✗'}  ${label}: ${found ? count + ' occurrence(s)' : 'NOT FOUND'}`)
    }
  }

  // Count /artist/<id>/ pattern specifically
  const artistIdMatches = [...html.matchAll(/\/artist\/\d+\//g)]
  console.log(`  ${artistIdMatches.length > 0 ? '✓' : '✗'}  /artist/<numeric-id>/ pattern: ${artistIdMatches.length} occurrence(s)`)

  // ── 2. JS / ajx loading hints ────────────────────────────────────────────────
  sep('═')
  console.log('\n2. JS / AJX LOADING HINTS\n')

  const $ = cheerio.load(html)

  // data-* attributes that look like result-loading config
  const dataAttrs: string[] = []
  $('[data-url],[data-src],[data-endpoint],[data-ajax],[data-load],[data-search],[data-query]').each((_, el) => {
    const attrs = (el as unknown as { attribs: Record<string, string> }).attribs
    const relevant = Object.entries(attrs)
      .filter(([k]) => /url|src|endpoint|ajax|load|search|query/i.test(k))
      .map(([k, v]) => `${k}="${v}"`)
      .join(' ')
    if (relevant) dataAttrs.push(`<${$(el).prop('tagName')?.toLowerCase()}> ${relevant}`)
  })

  if (dataAttrs.length > 0) {
    console.log(`  data-* loading attributes (${dataAttrs.length}):`)
    dataAttrs.slice(0, 10).forEach(a => console.log(`    ${a}`))
  } else {
    console.log('  No data-url/data-src/data-endpoint/data-ajax attributes found.')
  }

  // Inline <script> blocks: look for ajx/xhr/fetch/search URL patterns
  const scriptHints: string[] = []
  $('script:not([src])').each((_, el) => {
    const src = $(el).html() ?? ''
    // Capture lines/fragments mentioning ajx, XHR, fetch, or search endpoints
    const lines = src.split('\n')
    for (const line of lines) {
      if (/ajx|XMLHttpRequest|fetch\(|\.ajax|\/zoek|\/search|\/artiesten/i.test(line)) {
        const trimmed = line.trim().slice(0, 160)
        if (trimmed) scriptHints.push(trimmed)
      }
    }
  })

  if (scriptHints.length > 0) {
    console.log(`\n  Inline <script> lines mentioning ajx/XHR/fetch/search (${scriptHints.length}):`)
    scriptHints.slice(0, 12).forEach(h => console.log(`    ${h}`))
  } else {
    console.log('\n  No inline script lines mentioning ajx/XHR/fetch/search.')
  }

  // External <script src> pointing at anything search/results related
  const extScripts: string[] = []
  $('script[src]').each((_, el) => {
    const src = $(el).attr('src') ?? ''
    if (/search|zoek|artiest|ajax|result/i.test(src)) extScripts.push(src)
  })
  if (extScripts.length > 0) {
    console.log('\n  External scripts with search/results in path:')
    extScripts.forEach(s => console.log(`    ${s}`))
  }

  // ── 3. HTML around expected results area ─────────────────────────────────────
  sep('═')
  console.log('\n3. HTML AROUND THE SEARCH-RESULTS AREA\n')

  // Strategy A: find any element whose text contains "gevonden" or "zoekresultat"
  let resultsEl = $()
  $('div,section,main,article').each((_, el) => {
    if (resultsEl.length) return false
    const text = $(el).text()
    if (/gevonden|zoekresultat|search.result/i.test(text) && text.length < 5000) {
      resultsEl = $(el)
    }
  })

  if (resultsEl.length) {
    console.log(`Container with "gevonden/zoekresultat": <${resultsEl.prop('tagName')?.toLowerCase()}> class="${resultsEl.attr('class') ?? ''}"`)
    console.log('\nIts HTML (first 2 000 chars):')
    sep()
    console.log($.html(resultsEl).slice(0, 2000))
    sep()
  } else {
    console.log('No container with "gevonden/zoekresultat" text found.')

    // Strategy B: look for a main/article/content area as a proxy
    const mainEl = $('main, [id*="content"], [class*="content"], [class*="result"], [class*="zoek"]').first()
    if (mainEl.length) {
      console.log(`\nFallback: first main/content element (<${mainEl.prop('tagName')?.toLowerCase()}> class="${mainEl.attr('class') ?? ''}"):`)
      console.log('HTML (first 2 000 chars):')
      sep()
      console.log($.html(mainEl).slice(0, 2000))
      sep()
    } else {
      console.log('\nFallback: <body> from position 2 000 to 5 000 chars:')
      sep()
      console.log(html.slice(2000, 5000))
      sep()
    }
  }

  // ── 4. Summary / verdict ──────────────────────────────────────────────────────
  sep('═')
  console.log('\n4. VERDICT\n')

  const hasArtistText  = html.includes('Adam Beyer') || html.includes('Adam-Beyer')
  const hasArtistLinks = artistIdMatches.length > 0
  const hasGevonden    = /gevonden in artiesten/i.test(html)
  const hasAjxHints    = scriptHints.some(h => /ajx/i.test(h)) || dataAttrs.length > 0

  if (hasGevonden && hasArtistLinks) {
    console.log('  Results ARE in the raw HTML — parsing issue only (wrong selector).')
  } else if (hasAjxHints || (!hasArtistText && !hasArtistLinks)) {
    console.log('  Results appear NOT in the raw HTML — likely JS/ajx-loaded.')
    console.log('  Options: (a) find the ajx endpoint, (b) use Playwright, (c) alternative approach.')
  } else if (hasArtistText && !hasArtistLinks) {
    console.log('  Artist name IS in HTML but no /artist/<id>/ links — may be partial render or different URL shape.')
  } else {
    console.log('  Inconclusive — see sections above.')
  }

  sep()
  console.log('\n── Done ──')
}

main().catch(err => {
  console.error('Fatal:', err.message)
  process.exit(1)
})
