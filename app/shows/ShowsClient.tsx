'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarX2, Loader2, RefreshCw } from 'lucide-react'

import { triggerScrape } from '@/scrape-test/actions'
import { Button } from '@/components/ui/button'
import { SourceBadges } from '@/components/source-badges'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type Artist = {
  id: string
  name: string
}

type Show = {
  id: string
  artist_id: string
  date: string
  venue: string
  city: string
  source_url: string
  source_site: string
  sources: string[]
  found_at: string
  artists: { name: string } | null
}

type Props = {
  shows: Show[]
  artists: Artist[]
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC', // keep SSR and client formatting identical
  })
}

export default function ShowsClient({ shows, artists }: Props) {
  const router = useRouter()
  const [selectedArtistId, setSelectedArtistId] = useState<string>('all')
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null)

  // Triggers a full scrape via the server action, then re-fetches the table.
  async function handleRefresh() {
    setRefreshMsg(null)
    setRefreshing(true)
    try {
      const result = await triggerScrape()
      setRefreshMsg(`Refreshed — ${result.inserted} new, ${result.merged} merged.`)
      router.refresh()
    } catch {
      setRefreshMsg('Refresh failed.')
    } finally {
      setRefreshing(false)
    }
  }

  const sortedArtists = [...artists].sort((a, b) => a.name.localeCompare(b.name))

  const filtered =
    selectedArtistId === 'all'
      ? shows
      : shows.filter(s => s.artist_id === selectedArtistId)

  // Maps each value to its label so <SelectValue /> shows the artist name.
  const selectItems: Record<string, string> = {
    all: 'All artists',
    ...Object.fromEntries(sortedArtists.map(a => [a.id, a.name])),
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {artists.length > 0 ? (
          <Select
            items={selectItems}
            value={selectedArtistId}
            onValueChange={value => setSelectedArtistId(value as string)}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All artists</SelectItem>
              {sortedArtists.map(a => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span />
        )}

        <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
          {refreshing ? (
            <Loader2 className="animate-spin" />
          ) : (
            <RefreshCw />
          )}
          {refreshing ? 'Refreshing…' : 'Refresh shows'}
        </Button>
      </div>

      {refreshMsg && (
        <p className="text-sm text-muted-foreground">{refreshMsg}</p>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center">
          <CalendarX2 className="mx-auto mb-3 size-8 text-muted-foreground/60" />
          <p className="text-sm font-medium">No shows found</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {selectedArtistId === 'all'
              ? 'Shows will appear here once the scrapers find a match.'
              : 'No shows yet for this artist.'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Artist</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>City</TableHead>
                <TableHead>Sources</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(show => (
                <TableRow key={show.id}>
                  <TableCell className="font-medium">
                    {show.artists?.name ?? '—'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDate(show.date)}
                  </TableCell>
                  <TableCell>{show.venue}</TableCell>
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
