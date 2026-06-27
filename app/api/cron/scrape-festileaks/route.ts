import { NextResponse } from 'next/server'
import { runScrapers } from '@/lib/scrapers'

// festileaks is deliberately slow (a polite delay between every request), so it
// gets its own cron to stay within Vercel's 60s execution cap.
export const maxDuration = 60

// Never cache: run the scraper fresh on every invocation.
export const dynamic = 'force-dynamic'

/**
 * Daily cron entrypoint for the festileaks scraper only (configured in
 * vercel.json). Same CRON_SECRET auth as /api/cron/scrape.
 */
export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET

  if (!expected) {
    console.error('[cron/scrape-festileaks] CRON_SECRET is not set on the server.')
    return NextResponse.json({ ok: false, error: 'Server misconfigured' }, { status: 500 })
  }

  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()
  try {
    const result = await runScrapers({ only: ['festileaks'] })
    return NextResponse.json({
      ok: true,
      ranAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      summary: {
        totalScraped: result.totalScraped,
        matched: result.matched,
        inserted: result.inserted,
        merged: result.merged,
        skipped: result.skipped,
      },
    })
  } catch (err) {
    console.error('[cron/scrape-festileaks] Scrape run failed:', err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
