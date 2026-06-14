'use client'

import { useState } from 'react'
import { triggerScrape } from './actions'
import type { OrchestratorResult } from '../lib/scrapers'

export default function ScrapeTestPage() {
  const [result, setResult] = useState<OrchestratorResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  async function handleRun() {
    setRunning(true)
    setError(null)
    setResult(null)
    try {
      const summary = await triggerScrape()
      setResult(summary)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setRunning(false)
    }
  }

  return (
    <main className="max-w-lg mx-auto py-12 px-4">
      <h1 className="text-2xl font-bold mb-2">Scraper test</h1>
      <p className="text-sm text-gray-500 mb-8">
        Runs all registered scrapers, matches against followed artists, and inserts new shows.
      </p>

      <button
        className="bg-black text-white px-4 py-2 rounded text-sm hover:bg-gray-800 disabled:opacity-40 transition-colors mb-8"
        onClick={handleRun}
        disabled={running}
      >
        {running ? 'Running…' : 'Run scraper'}
      </button>

      {error && (
        <p className="text-sm text-red-500 mb-4">{error}</p>
      )}

      {result && (
        <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-gray-500">Total scraped</dt>
            <dd className="font-medium">{result.totalScraped}</dd>
            <dt className="text-gray-500">Matched followed artists</dt>
            <dd className="font-medium">{result.matched}</dd>
            <dt className="text-gray-500">Inserted</dt>
            <dd className="font-medium">{result.inserted}</dd>
            <dt className="text-gray-500">Merged (new source)</dt>
            <dd className="font-medium">{result.merged}</dd>
            <dt className="text-gray-500">Skipped (duplicates)</dt>
            <dd className="font-medium">{result.skipped}</dd>
          </dl>

          {result.shows.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">Inserted shows:</p>
              <ul className="space-y-1">
                {result.shows.map((s, i) => (
                  <li key={i} className="text-sm border-b border-gray-100 py-2">
                    <span className="font-medium">{s.artistName}</span>
                    {' — '}{s.venue}, {s.city} ({s.date})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </main>
  )
}
