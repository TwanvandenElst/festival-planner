'use client'

import { useState } from 'react'

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
  found_at: string
  artists: { name: string } | null
}

type Props = {
  shows: Show[]
  artists: Artist[]
}

export default function ShowsClient({ shows, artists }: Props) {
  const [selectedArtistId, setSelectedArtistId] = useState<string>('all')

  const filtered =
    selectedArtistId === 'all'
      ? shows
      : shows.filter(s => s.artist_id === selectedArtistId)

  const sortedArtists = [...artists].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <>
      {artists.length > 0 && (
        <div className="mb-6">
          <select
            className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            value={selectedArtistId}
            onChange={e => setSelectedArtistId(e.target.value)}
          >
            <option value="all">All artists</option>
            {sortedArtists.map(a => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400">No shows found yet.</p>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-gray-400 border-b border-gray-200">
              <th className="pb-2 pr-4 font-medium">Artist</th>
              <th className="pb-2 pr-4 font-medium">Date</th>
              <th className="pb-2 pr-4 font-medium">Venue</th>
              <th className="pb-2 pr-4 font-medium">City</th>
              <th className="pb-2 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(show => (
              <tr key={show.id} className="border-b border-gray-100">
                <td className="py-3 pr-4">{show.artists?.name ?? '—'}</td>
                <td className="py-3 pr-4 whitespace-nowrap">
                  {new Date(show.date).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </td>
                <td className="py-3 pr-4">{show.venue}</td>
                <td className="py-3 pr-4">{show.city}</td>
                <td className="py-3">
                  <a
                    href={show.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    {show.source_site}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
