import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CalendarX2 } from 'lucide-react'

import { supabase } from '@/lib/supabase'
import { SourceBadges } from '@/components/source-badges'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type Show = {
  id: string
  date: string
  venue: string
  city: string
  source_url: string
  source_site: string
  sources: string[]
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default async function ArtistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { data: artist } = await supabase
    .from('artists')
    .select('id, name, shows(*)')
    .eq('id', id)
    .single()

  if (!artist) notFound()

  const shows = ((artist.shows ?? []) as Show[]).sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  )

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        All artists
      </Link>

      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">{artist.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {shows.length === 0
            ? 'No shows found yet.'
            : `${shows.length} show${shows.length === 1 ? '' : 's'} found.`}
        </p>
      </header>

      {shows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center">
          <CalendarX2 className="mx-auto mb-3 size-8 text-muted-foreground/60" />
          <p className="text-sm font-medium">No shows yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Shows will appear here once the scrapers find a match.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>City</TableHead>
                <TableHead>Sources</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shows.map(show => (
                <TableRow key={show.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDate(show.date)}
                  </TableCell>
                  <TableCell className="font-medium">{show.venue}</TableCell>
                  <TableCell className="text-muted-foreground">{show.city}</TableCell>
                  <TableCell>
                    <SourceBadges
                      sources={show.sources}
                      sourceSite={show.source_site}
                      sourceUrl={show.source_url}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
