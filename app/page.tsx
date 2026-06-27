'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Loader2, Music2, X } from 'lucide-react'

import { followArtist, getFollowedArtists, unfollowArtist, type Artist } from '@/lib/artists'
import { useGsapReveal } from '@/lib/use-gsap-reveal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function HomePage() {
  const [artists, setArtists] = useState<Artist[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [addedMsg, setAddedMsg] = useState<string | null>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // The list is fetched client-side, so reveal its cards once they arrive.
  useGsapReveal(listRef, [artists, loading])

  useEffect(() => {
    getFollowedArtists().then(data => {
      setArtists(data)
      setLoading(false)
    })
  }, [])

  // Unfollow: removes only this user's link (the shared artist row stays).
  async function handleRemove(id: string) {
    setRemovingId(id)
    const { ok } = await unfollowArtist(id)
    if (ok) {
      setArtists(prev => prev.filter(a => a.id !== id))
    }
    setRemovingId(null)
  }

  async function handleAdd() {
    const name = input.trim()
    if (!name) return
    setAdding(true)
    const result = await followArtist(name)
    setAdding(false)
    if (result.ok) {
      // Avoid a duplicate row if this artist is somehow already in the list.
      setArtists(prev =>
        prev.some(a => a.id === result.artist.id) ? prev : [result.artist, ...prev],
      )
      setInput('')
      // Scraping is decoupled from adding: it runs once for everyone on the
      // schedule (cron), not per add. A full multi-site scrape can't fit in an
      // interactive request and wouldn't scale to many users adding artists.
      setAddedMsg(`Added ${result.artist.name}. New shows are fetched automatically — check back soon.`)
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <header className="mb-8">
        <h1 data-reveal-title className="text-2xl font-semibold tracking-tight">
          Followed artists
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add artists to track when they perform in the Netherlands.
        </p>
      </header>

      <div className="mb-8 flex gap-2">
        <Input
          data-tour="add-artist"
          placeholder="Add an artist…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          disabled={adding}
        />
        <Button onClick={handleAdd} disabled={adding || !input.trim()}>
          {adding ? <Loader2 className="animate-spin" /> : null}
          {adding ? 'Adding…' : 'Add'}
        </Button>
      </div>

      {addedMsg ? (
        <div className="mb-6 text-sm text-muted-foreground">{addedMsg}</div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading artists…
        </div>
      ) : artists.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center">
          <Music2 className="mx-auto mb-3 size-8 text-muted-foreground/60" />
          <p className="text-sm font-medium">No artists yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add your first artist above to start tracking shows.
          </p>
        </div>
      ) : (
        <ul ref={listRef} className="space-y-2">
          {artists.map(artist => (
            <li key={artist.id} data-reveal-card>
              <div className="group glass-panel flex items-center justify-between rounded-lg px-4 py-3 transition-colors hover:bg-muted/50">
                <Link
                  href={`/artists/${artist.id}`}
                  className="flex flex-1 items-center justify-between text-sm font-medium"
                >
                  <span>{artist.name}</span>
                  <ChevronRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="ml-2 text-muted-foreground hover:text-destructive"
                  onClick={() => handleRemove(artist.id)}
                  disabled={removingId === artist.id}
                  aria-label={`Remove ${artist.name}`}
                >
                  {removingId === artist.id ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <X />
                  )}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
