import type { Scraper, ScrapedShow } from './types'

const shows: ScrapedShow[] = [
  {
    artistName: 'Marlon Hoffstadt',
    date: '2026-07-12',
    venue: 'Shelter',
    city: 'Amsterdam',
    sourceUrl: 'https://example.com/events/shelter-july-12',
    sourceSite: 'fake',
  },
  {
    // duplicate of the show above — should be skipped on second run
    artistName: 'Marlon Hoffstadt',
    date: '2026-07-12',
    venue: 'Shelter',
    city: 'Amsterdam',
    sourceUrl: 'https://example.com/events/shelter-july-12',
    sourceSite: 'fake',
  },
  {
    artistName: 'Amelie Lens',
    date: '2026-08-03',
    venue: 'Awakenings',
    city: 'Spaarnwoude',
    sourceUrl: 'https://example.com/events/awakenings-aug',
    sourceSite: 'fake',
  },
  {
    artistName: 'Charlotte de Witte',
    date: '2026-09-20',
    venue: 'Warehouse Elementenstraat',
    city: 'Amsterdam',
    sourceUrl: 'https://example.com/events/warehouse-sept',
    sourceSite: 'fake',
  },
]

export const fakeScraper: Scraper = {
  name: 'fake',
  async scrape() {
    return shows
  },
}
