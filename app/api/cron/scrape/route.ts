import { NextResponse } from 'next/server'
import { runScrapers } from '@/lib/scrapers'

// Vercel Hobby caps serverless execution at 60s; the weekly scrape can be slow.
export const maxDuration = 60

// Never cache: this must run the scrapers fresh on every invocation.
export const dynamic = 'force-dynamic'

/**
 * Weekly cron entrypoint (configured in vercel.json). Vercel invokes this with
 * a GET and an `Authorization: Bearer <CRON_SECRET>` header when CRON_SECRET is
 * set in the project env. We verify that token before running anything.
 */
export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET

  // Fail closed: without a configured secret we cannot safely authorize.
  if (!expected) {
    console.error('[cron/scrape] CRON_SECRET is not set on the server.')
    return NextResponse.json({ ok: false, error: 'Server misconfigured' }, { status: 500 })
  }

  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()
  try {
    const result = await runScrapers()
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
    console.error('[cron/scrape] Scrape run failed:', err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
