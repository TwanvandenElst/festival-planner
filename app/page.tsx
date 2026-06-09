'use client'

import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

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
    <main className="max-w-lg mx-auto py-12 px-4">
      <h1 className="text-2xl font-bold mb-8">Followed artists</h1>

      <div className="flex gap-2 mb-8">
        <input
          className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
          placeholder="Artist name"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          disabled={adding}
        />
        <button
          className="bg-black text-white px-4 py-2 rounded text-sm hover:bg-gray-800 disabled:opacity-40 transition-colors"
          onClick={handleAdd}
          disabled={adding || !input.trim()}
        >
          {adding ? 'Adding…' : 'Add artist'}
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : artists.length === 0 ? (
        <p className="text-sm text-gray-400">No artists yet.</p>
      ) : (
        <ul>
          {artists.map(artist => (
            <li key={artist.id} className="flex items-center justify-between py-3 border-b border-gray-100 text-sm">
              <span>{artist.name}</span>
              <button
                className="text-gray-400 hover:text-red-500 disabled:opacity-40 transition-colors text-xs ml-4"
                onClick={() => handleRemove(artist.id)}
                disabled={removingId === artist.id}
              >
                {removingId === artist.id ? 'Removing…' : 'Remove'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
