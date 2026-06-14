'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Loader2, Music2, X } from 'lucide-react'

import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Artist = {
  id: string
  name: string
  created_at: string
}

export default function HomePage() {
  const [artists, setArtists] = useState<Artist[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('artists')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setArtists(data ?? [])
        setLoading(false)
      })
  }, [])

  async function handleRemove(id: string) {
    setRemovingId(id)
    const { error } = await supabase.from('artists').delete().eq('id', id)
    if (!error) {
      setArtists(prev => prev.filter(a => a.id !== id))
    }
    setRemovingId(null)
  }

  async function handleAdd() {
    const name = input.trim()
    if (!name) return
    setAdding(true)
    const { data, error } = await supabase
      .from('artists')
      .insert({ name })
      .select()
      .single()
    if (!error && data) {
      setArtists(prev => [data, ...prev])
      setInput('')
    }
    setAdding(false)
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Followed artists</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add artists to track when they perform in the Netherlands.
        </p>
      </header>

      <div className="mb-8 flex gap-2">
        <Input
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
        <ul className="space-y-2">
          {artists.map(artist => (
            <li key={artist.id}>
              <div className="group flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:bg-muted/50">
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
