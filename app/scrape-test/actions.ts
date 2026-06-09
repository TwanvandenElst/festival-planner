'use server'

import { runScrapers, type OrchestratorResult } from '../lib/scrapers'

export async function triggerScrape(): Promise<OrchestratorResult> {
  return runScrapers()
}
