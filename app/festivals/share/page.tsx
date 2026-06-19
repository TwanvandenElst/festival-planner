import type { Metadata } from 'next'
import { getMyFestivals } from '@/lib/festivals'
import { getJoinsByFestival } from '@/lib/festival-joins'
import type { Festival, FestivalStatus } from '@/lib/festivals-types'
import { JoinFestival } from './JoinFestival'

// Public, read-only, no auth needed (RLS allows anon read).
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: "Twan's festivals",
  description: "Festivals I'm attending this year.",
}

const TODAY = new Date().toISOString().slice(0, 10)

const STATUS_LABEL: Record<FestivalStatus, string> = {
  tickets_gekocht: 'Tickets Bought',
  in_optie: 'Optioned',
  wishlist: 'Wishlist',
}
const STATUS_CLASS: Record<FestivalStatus, string> = {
  tickets_gekocht: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  in_optie: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  wishlist: 'bg-muted text-muted-foreground',
}

// Dutch month abbreviations, e.g. "10-12 jul 2026".
const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

/** Formats a single date or a start–end range from "YYYY-MM-DD" strings. */
function formatRange(start: string, end: string | null): string {
  const [sy, sm, sd] = start.split('-').map(Number)
  if (!end || end === start) return `${sd} ${MONTHS[sm - 1]} ${sy}`

  const [ey, em, ed] = end.split('-').map(Number)
  if (sy === ey && sm === em) return `${sd}-${ed} ${MONTHS[sm - 1]} ${sy}`
  if (sy === ey) return `${sd} ${MONTHS[sm - 1]} – ${ed} ${MONTHS[em - 1]} ${sy}`
  return `${sd} ${MONTHS[sm - 1]} ${sy} – ${ed} ${MONTHS[em - 1]} ${ey}`
}

function FestivalRow({ f, joinNames }: { f: Festival; joinNames: string[] }) {
  return (
    <li className="py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium">
            {f.url ? (
              <a href={f.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                {f.name}
              </a>
            ) : (
              f.name
            )}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[f.status]}`}
            >
              {STATUS_LABEL[f.status]}
            </span>
            {f.location && <span className="truncate">{f.location}</span>}
            {f.rating != null && <span>{f.rating}/10</span>}
          </div>
        </div>
        <p className="shrink-0 whitespace-nowrap text-right text-sm text-muted-foreground">
          {formatRange(f.start_date, f.end_date)}
        </p>
      </div>
      <JoinFestival festivalId={f.id} initialNames={joinNames} />
    </li>
  )
}

export default async function FestivalsSharePage() {
  const [festivals, joins] = await Promise.all([getMyFestivals(), getJoinsByFestival()])
  // festivals already sorted by start_date asc

  const upcoming = festivals.filter(f => (f.end_date ?? f.start_date) >= TODAY)
  const past = festivals.filter(f => (f.end_date ?? f.start_date) < TODAY).reverse() // most recent first

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-12 sm:py-16">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Twan&apos;s festivals</h1>
        <p className="mt-1 text-sm text-muted-foreground">Festivals I&apos;m attending this year.</p>
      </header>

      {festivals.length === 0 ? (
        <p className="mt-10 text-sm text-muted-foreground">No festivals yet.</p>
      ) : (
        <>
          {upcoming.length > 0 && (
            <ul className="mt-8 divide-y divide-border">
              {upcoming.map(f => (
                <FestivalRow key={f.id} f={f} joinNames={(joins[f.id] ?? []).map(j => j.name)} />
              ))}
            </ul>
          )}

          {past.length > 0 && (
            <section className="mt-10">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Geweest
              </h2>
              <ul className="mt-2 divide-y divide-border opacity-70">
                {past.map(f => (
                  <FestivalRow key={f.id} f={f} joinNames={(joins[f.id] ?? []).map(j => j.name)} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  )
}
