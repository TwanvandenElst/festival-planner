'use server'

import { revalidatePath } from 'next/cache'

import { supabase } from './supabase'
import { normalize } from './normalize'
import type { Festival, FestivalSearchResult, FestivalStatus } from './festivals-types'

// ── (a) Library: stored shows ─────────────────────────────────────────────────

async function searchShows(q: string): Promise<FestivalSearchResult[]> {
  // Escape LIKE wildcards so user input is treated literally.
  const pattern = `%${q.replace(/[\\%_]/g, c => `\\${c}`)}%`

  const { data, error } = await supabase
    .from('shows')
    .select('venue, date, city, source_url')
    .ilike('venue', pattern)
    .order('date', { ascending: true })
    .limit(100)

  if (error) {
    console.error('[festivals] shows search failed:', error.message)
    return []
  }

  const seen = new Set<string>()
  const out: FestivalSearchResult[] = []
  for (const row of data ?? []) {
    const name = (row.venue ?? '').trim()
    if (!name) continue

    const key = name.toLowerCase() // distinct venue (event name) values
    if (seen.has(key)) continue
    seen.add(key)

    out.push({
      name,
      date: row.date ?? '',
      city: row.city ?? '',
      url: row.source_url ?? '',
      source: 'library',
    })
    if (out.length >= 10) break
  }
  return out
}

// ── (b) ra.co live GraphQL search ─────────────────────────────────────────────

const RA_GRAPHQL_URL = 'https://ra.co/graphql'
const RA_NL_AREA_ID = 176

const RA_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Referer: 'https://ra.co/events/nl/all',
}

const RA_SEARCH_QUERY = /* graphql */ `
  query SEARCH_EVENTS($filters: FilterInputDtoInput, $pageSize: Int, $page: Int) {
    eventListings(filters: $filters, pageSize: $pageSize, page: $page) {
      totalResults
      data {
        event {
          id
          title
          date
          contentUrl
          venue { id name area { id name } }
        }
      }
    }
  }
`

type RaEvent = {
  id: string
  title: string
  date: string
  contentUrl: string
  venue: { area: { name: string } | null } | null
}
type RaResponse = {
  data?: { eventListings: { totalResults: number; data: { event: RaEvent }[] } }
  errors?: { message: string }[]
}

async function searchRaco(term: string, year: string | null): Promise<FestivalSearchResult[]> {
  // Date window: 2 years back to 2 years ahead — drops ancient noise.
  const now = new Date()
  const min = new Date(now); min.setFullYear(now.getFullYear() - 2)
  const max = new Date(now); max.setFullYear(now.getFullYear() + 2)

  try {
    const res = await fetch(RA_GRAPHQL_URL, {
      method: 'POST',
      headers: RA_HEADERS,
      body: JSON.stringify({
        query: RA_SEARCH_QUERY,
        variables: {
          filters: {
            title: { contains: term },
            areas: { eq: RA_NL_AREA_ID },
            date: { gte: min.toISOString(), lte: max.toISOString() },
          },
          pageSize: 10,
          page: 1,
        },
      }),
    })

    if (!res.ok) {
      console.error(`[festivals] ra.co search HTTP ${res.status}`)
      return []
    }

    const json = (await res.json()) as RaResponse
    if (json.errors?.length) {
      console.error('[festivals] ra.co search errors:', json.errors.map(e => e.message).join('; '))
      return []
    }

    let mapped = (json.data?.eventListings.data ?? []).map(({ event }) => {
      const area = event.venue?.area?.name ?? ''
      return {
        name: event.title,
        date: (event.date ?? '').slice(0, 10),
        city: area && area !== 'All' ? area : '',
        url: `https://ra.co${event.contentUrl}`,
        source: 'ra.co' as const,
      }
    })

    // If the query named a year, keep only that year's events.
    if (year) mapped = mapped.filter(r => r.date.slice(0, 4) === year)

    // Newest/upcoming first.
    mapped.sort((a, b) => b.date.localeCompare(a.date))
    return mapped
  } catch (err) {
    console.error('[festivals] ra.co search failed:', err)
    return []
  }
}

// ── (c) Combined search ───────────────────────────────────────────────────────

/** Splits an embedded 4-digit year out of the query, if present. */
function parseQuery(q: string): { term: string; year: string | null } {
  const m = q.match(/\b(?:19|20)\d{2}\b/)
  const year = m ? m[0] : null
  const term = year ? (q.replace(year, '').replace(/\s+/g, ' ').trim() || q) : q
  return { term, year }
}

export async function searchFestivals(query: string): Promise<FestivalSearchResult[]> {
  const q = query.trim()
  if (q.length < 2) return []

  const { term, year } = parseQuery(q)
  const [library, raco] = await Promise.all([searchShows(q), searchRaco(term, year)])

  // Dedup by normalized name, preferring the library copy on collisions.
  const seen = new Set<string>()
  const deduped: FestivalSearchResult[] = []
  for (const r of [...library, ...raco]) {
    const key = normalize(r.name)
    if (key && seen.has(key)) continue
    if (key) seen.add(key)
    deduped.push(r)
  }

  // Relevance order: prefix matches first, then partial; within each group,
  // upcoming before past (upcoming ascending, past most-recent-first).
  const today = new Date().toISOString().slice(0, 10)
  const termLower = term.toLowerCase()
  const startsWithTerm = (r: FestivalSearchResult) => r.name.toLowerCase().startsWith(termLower)
  const isPast = (r: FestivalSearchResult) => !!r.date && r.date < today

  deduped.sort((a, b) => {
    const ra = startsWithTerm(a) ? 0 : 1
    const rb = startsWithTerm(b) ? 0 : 1
    if (ra !== rb) return ra - rb
    const ap = isPast(a)
    const bp = isPast(b)
    if (ap !== bp) return ap ? 1 : -1
    return ap ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)
  })

  return deduped.slice(0, 15)
}

// ── Persistence ───────────────────────────────────────────────────────────────

function revalidateFestivals() {
  revalidatePath('/shows') // festivals UI now lives on the shows page
  revalidatePath('/festivals/share')
}

/**
 * Inserts a festival (status defaults to 'wishlist'); returns the saved row so
 * the client can append it. `endDate` is optional (manual weekend festivals).
 */
export async function addFestival(
  data: FestivalSearchResult,
  endDate?: string | null,
): Promise<{ ok: true; festival: Festival } | { ok: false; error: string }> {
  if (!data.name || !data.date) {
    return { ok: false, error: 'Festival is missing a name or date.' }
  }

  const { data: row, error } = await supabase
    .from('festivals')
    .insert({
      name: data.name,
      start_date: data.date,
      end_date: endDate || null,
      status: 'wishlist',
      rating: null,
      location: data.city || null,
      url: data.url || null,
      source: data.source,
      external_id: data.url || null,
    })
    .select('*')
    .single()

  if (error || !row) {
    return { ok: false, error: error?.message ?? 'Insert failed' }
  }

  revalidateFestivals()
  return { ok: true, festival: row as Festival }
}

/** Updates a festival's attendance status. */
export async function updateFestivalStatus(
  id: string,
  status: FestivalStatus,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('festivals').update({ status }).eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidateFestivals()
  return { ok: true }
}

/** Updates a festival's 1–10 rating (null clears it). */
export async function updateFestivalRating(
  id: string,
  rating: number | null,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('festivals').update({ rating }).eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidateFestivals()
  return { ok: true }
}

/** Deletes a festival by id. */
export async function removeFestival(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('festivals').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidateFestivals()
  return { ok: true }
}

/** All saved festivals, soonest first. */
export async function getMyFestivals(): Promise<Festival[]> {
  const { data, error } = await supabase
    .from('festivals')
    .select('*')
    .order('start_date', { ascending: true })

  if (error) {
    console.error('[festivals] getMyFestivals failed:', error.message)
    return []
  }
  return (data ?? []) as Festival[]
}
