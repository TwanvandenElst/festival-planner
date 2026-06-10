/**
 * Throwaway structure-dump script — NOT part of the app, not imported anywhere.
 * Fetches the Festivalinfo agenda page once and prints every
 * <script type="application/ld+json"> block whose @type is "Festival".
 * No extraction or parsing beyond JSON.parse — just raw structured data.
 *
 * Run with:
 *   npx tsx scripts/explore-festivalinfo-agenda.ts
 */

const AGENDA_URL = 'https://www.festivalinfo.nl/festivals/'
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

function sep(char = '─', len = 70) { console.log(char.repeat(len)) }

async function main() {
  console.log(`GET ${AGENDA_URL}`)

  const res = await fetch(AGENDA_URL, {
    method: 'GET',
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8' },
  })

  const html = await res.text()
  console.log(`HTTP ${res.status}  body: ${html.length.toLocaleString()} chars\n`)
  if (!res.ok) { console.error('Non-OK response'); process.exit(1) }

  // Extract every <script type="application/ld+json"> block.
  const scriptRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  const allBlocks: unknown[] = []

  let m: RegExpExecArray | null
  while ((m = scriptRe.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim())
      allBlocks.push(parsed)
    } catch {
      // malformed JSON-LD block — skip
    }
  }

  console.log(`Total JSON-LD blocks on page: ${allBlocks.length}`)

  // Keep only those with @type === "Festival".
  type JsonLd = { '@type'?: string; [key: string]: unknown }
  const festivals = allBlocks.filter(
    (b): b is JsonLd => typeof b === 'object' && b !== null && (b as JsonLd)['@type'] === 'Festival'
  )

  console.log(`JSON-LD blocks with @type "Festival": ${festivals.length}\n`)

  if (festivals.length === 0) {
    console.log('No Festival JSON-LD blocks found. Printing first 3 raw blocks for inspection:')
    sep()
    for (const b of allBlocks.slice(0, 3)) {
      console.log(JSON.stringify(b, null, 2))
      sep()
    }
    process.exit(0)
  }

  // Print the first 3 in full — no truncation.
  sep('═')
  console.log('FIRST 3 FESTIVAL JSON-LD BLOCKS (full, untruncated)\n')

  for (let i = 0; i < Math.min(3, festivals.length); i++) {
    sep()
    console.log(`Festival ${i + 1} of ${festivals.length}:`)
    sep()
    console.log(JSON.stringify(festivals[i], null, 2))
  }

  sep('═')
  console.log('\n── Done ──')
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1) })
