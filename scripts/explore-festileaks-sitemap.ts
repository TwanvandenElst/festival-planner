/**
 * Throwaway exploration script — NOT part of the app, not imported anywhere.
 * Phase A: sweep ALL 16 Festileaks post-sitemaps for festival URLs to see if
 * the sitemap is a viable source for client-side festival search.
 *
 * Sitemaps: post-sitemap.xml, post-sitemap2.xml … post-sitemap16.xml (16 total).
 * Polite: 500ms delay between requests.
 *
 * Run with:
 *   npx tsx scripts/explore-festileaks-sitemap.ts
 */

const BASE = 'https://festileaks.com'
const SITEMAP_COUNT = 16

// Festival detail URL shape with captured year, e.g. /festival/awakenings/2026/
const FESTIVAL_RE = /\/festival\/[^/]+\/(\d{4})\/?$/i

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

function sep(char = '─', len = 72) { console.log(char.repeat(len)) }
function sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)) }

// post-sitemap.xml, post-sitemap2.xml, …, post-sitemap16.xml
function sitemapUrl(i: number): string {
  return i === 1 ? `${BASE}/post-sitemap.xml` : `${BASE}/post-sitemap${i}.xml`
}

type FetchResult = { status: number; body: string; error?: string }

async function fetchText(url: string): Promise<FetchResult> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/xml,text/xml,*/*;q=0.8' },
    })
    const body = await res.text()
    return { status: res.status, body }
  } catch (err) {
    return { status: 0, body: '', error: String(err) }
  }
}

/** Pull every <loc>…</loc> value out of a sitemap. */
function extractLocs(xml: string): string[] {
  const locs: string[] = []
  const re = /<loc>\s*([\s\S]*?)\s*<\/loc>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    locs.push(m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim())
  }
  return locs
}

async function main() {
  console.log(`Festileaks post-sitemap sweep — ${SITEMAP_COUNT} sitemaps\n`)

  const allFestivalUrls: string[] = []
  const overallYears: Record<string, number> = {}

  sep('═')
  console.log('Per-sitemap results:\n')

  for (let i = 1; i <= SITEMAP_COUNT; i++) {
    if (i > 1) await sleep(500) // be polite between requests
    const url = sitemapUrl(i)
    const res = await fetchText(url)

    if (res.error || res.status !== 200) {
      console.log(`  [${String(i).padStart(2)}] ${url} → ${res.error ?? `HTTP ${res.status}`}`)
      continue
    }

    const locs = extractLocs(res.body)
    const years: Record<string, number> = {}
    let count = 0
    for (const loc of locs) {
      const m = loc.match(FESTIVAL_RE)
      if (!m) continue
      count++
      years[m[1]] = (years[m[1]] ?? 0) + 1
      overallYears[m[1]] = (overallYears[m[1]] ?? 0) + 1
      allFestivalUrls.push(loc)
    }

    const yearSummary = Object.keys(years).sort().join(', ') || '—'
    console.log(
      `  [${String(i).padStart(2)}] ${url.replace(BASE, '')}: ` +
      `${locs.length} URLs, ${count} festival URLs | years: ${yearSummary}`,
    )
  }

  // ── Report ──────────────────────────────────────────────────────────────────
  sep('═')
  console.log('\nREPORT\n')

  const distinct = new Set(allFestivalUrls).size
  console.log(`  Total festival URLs found: ${allFestivalUrls.length} (${distinct} distinct)`)

  console.log('\n  Festival URLs per year (all sitemaps):')
  Object.keys(overallYears).sort().forEach(y => {
    console.log(`    ${y}: ${overallYears[y]}`)
  })

  const from2026 = allFestivalUrls.filter(u => FESTIVAL_RE.test(u) && u.match(FESTIVAL_RE)?.[1] === '2026')
  console.log(`\n  From 2026 (upcoming): ${from2026.length}`)
  console.log('  First 10 festival URLs from 2026:')
  if (from2026.length === 0) {
    console.log('    (none found)')
  } else {
    from2026.slice(0, 10).forEach((u, n) => console.log(`    ${String(n + 1).padStart(2)}. ${u}`))
  }

  const awakenings = allFestivalUrls.filter(u => /awakenings/i.test(u))
  console.log(`\n  "awakenings" present: ${awakenings.length > 0 ? 'YES' : 'no'} (${awakenings.length} match)`)
  awakenings.slice(0, 10).forEach(u => console.log(`    ${u}`))

  sep()
  console.log('\n── Done ──')
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
