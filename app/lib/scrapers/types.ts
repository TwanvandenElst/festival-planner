export type ScrapedShow = {
  artistName: string
  date: string       // ISO date string: YYYY-MM-DD
  venue: string
  city: string
  sourceUrl: string
  sourceSite: string
}

export interface Scraper {
  name: string
  scrape(): Promise<ScrapedShow[]>
}
