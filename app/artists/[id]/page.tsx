import { supabase } from '../../lib/supabase'
import { notFound } from 'next/navigation'

type Show = {
  id: string
  date: string
  venue: string
  city: string
  source_url: string
  source_site: string
  sources: string[]
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
    <main className="max-w-2xl mx-auto py-12 px-4">
      <nav className="flex gap-4 mb-10 text-sm">
        <a href="/" className="text-gray-400 hover:text-black transition-colors">Artists</a>
        <a href="/shows" className="text-gray-400 hover:text-black transition-colors">Found shows</a>
      </nav>
      <h1 className="text-2xl font-bold mb-8">{artist.name}</h1>

      {shows.length === 0 ? (
        <p className="text-sm text-gray-400">No shows found yet.</p>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-gray-400 border-b border-gray-200">
              <th className="pb-2 pr-4 font-medium">Date</th>
              <th className="pb-2 pr-4 font-medium">Event</th>
              <th className="pb-2 pr-4 font-medium">City</th>
              <th className="pb-2 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {shows.map(show => (
              <tr key={show.id} className="border-b border-gray-100">
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
                  <div className="flex flex-wrap gap-x-2 gap-y-1">
                    {(show.sources?.length ? show.sources : [show.source_site])
                      .filter(Boolean)
                      .map(src => (
                        <a
                          key={src}
                          href={show.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          {src}
                        </a>
                      ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
