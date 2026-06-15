'use server'

import { revalidatePath } from 'next/cache'
import { runScrapers, type OrchestratorResult } from '../lib/scrapers'

/**
 * Server action that runs the scrapers and stores matched shows.
 * Pass an artist name to scrape just that one (used after adding an artist);
 * omit it to scrape everyone (the "Refresh shows" button and scrape-test page).
 */
export async function triggerScrape(artistName?: string): Promise<OrchestratorResult> {
  const result = await runScrapers(artistName ? { artistName } : undefined)
  revalidatePath('/shows')
  return result
}
