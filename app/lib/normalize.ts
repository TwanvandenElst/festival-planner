// Fuzzy event key: the first significant word of a normalized title.
// Mirrors the orchestrator's normalize() (app/lib/scrapers/index.ts) and
// migration 0003 — used for show dedup and festival↔show matching.
// Pure and dependency-free so it is safe to import from client components.

const NOISE_WORDS = new Set([
  'the', 'a', 'an', 'festival', 'fest', 'event', 'events', 'presents',
])

export function normalize(raw: string): string {
  const words = raw.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter(Boolean)
  for (const w of words) {
    if (/^[0-9]+$/.test(w)) continue // pure numbers: years, editions
    if (NOISE_WORDS.has(w)) continue
    return w
  }
  return ''
}
