'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  CalendarX2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  Plus,
  Search,
  X,
} from 'lucide-react'

import {
  searchFestivals,
  addFestival,
  removeFestival,
  updateFestivalStatus,
  updateFestivalRating,
} from '@/lib/festivals'
import { removeFestivalJoin } from '@/lib/festival-joins'
import type { Festival, FestivalSearchResult, FestivalStatus } from '@/lib/festivals-types'
import { normalize } from '@/lib/normalize'
import { cn } from '@/lib/utils'
import { ShareFestivals } from './ShareFestivals'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const STATUS_ORDER: FestivalStatus[] = ['tickets_gekocht', 'in_optie', 'wishlist']
// Display labels are English; the stored DB values stay as-is.
const STATUS_LABEL: Record<FestivalStatus, string> = {
  tickets_gekocht: 'Tickets Bought',
  in_optie: 'Optioned',
  wishlist: 'Wishlist',
}
const STATUS_ITEMS: Record<string, string> = STATUS_LABEL
const STATUS_TRIGGER: Record<FestivalStatus, string> = {
  tickets_gekocht: 'border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  in_optie: 'border-transparent bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  wishlist: 'border-transparent bg-muted text-muted-foreground',
}

const RATING_ITEMS: Record<string, string> = {
  none: '—',
  ...Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i + 1), String(i + 1)])),
}

// A followed artist's show, used to match against saved festivals.
type ShowMatch = { artistName: string; venue: string; date: string }

const MATCH_BUFFER_MS = 24 * 60 * 60 * 1000 // ±1 day date-proximity window

/** Same fuzzy logic as the dedup orchestrator: normalized name + date proximity. */
function showMatchesFestival(
  s: ShowMatch,
  festivalKey: string,
  start: string,
  end: string | null,
): boolean {
  if (!s.artistName || normalize(s.venue) !== festivalKey) return false
  const d = Date.parse(s.date)
  if (Number.isNaN(d)) return false
  const lo = Date.parse(start) - MATCH_BUFFER_MS
  const hi = Date.parse(end ?? start) + MATCH_BUFFER_MS
  return d >= lo && d <= hi
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

// Initials-avatar palette, mirrored from the public share page (JoinFestival).
const AVATAR_GRADIENTS = [
  'from-violet-400 to-fuchsia-500',
  'from-fuchsia-400 to-pink-500',
  'from-sky-400 to-blue-500',
  'from-amber-400 to-orange-500',
  'from-emerald-400 to-teal-500',
  'from-rose-400 to-red-500',
]
const gradientAt = (i: number) => AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length]
const initialOf = (name: string) => name.trim().charAt(0).toUpperCase() || '?'

/**
 * Non-interactive overlapping initials stack shown on the (collapsed) festival
 * row. Names + removal live in the expandable detail row, so this is purely a
 * visual indicator — it must not be a button (it renders inside the row's
 * expand button).
 */
function JoinAvatarStack({ names }: { names: string[] }) {
  const MAX = 4 // total circles before collapsing into a "+N" chip
  const overflow = names.length > MAX ? names.length - (MAX - 1) : 0
  const shown = overflow > 0 ? names.slice(0, MAX - 1) : names

  return (
    <span
      className="inline-flex shrink-0 items-center"
      aria-label={`${names.length} joined`}
    >
      {shown.map((name, i) => (
        <span
          key={i}
          style={{ zIndex: shown.length - i }}
          className={cn(
            'grid size-5 place-items-center rounded-full bg-gradient-to-br text-[10px] font-bold text-white ring-2 ring-background',
            gradientAt(i),
            i > 0 && '-ml-1',
          )}
        >
          {initialOf(name)}
        </span>
      ))}
      {overflow > 0 && (
        <span className="-ml-1 grid size-5 place-items-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground ring-2 ring-background">
          +{overflow}
        </span>
      )}
    </span>
  )
}

// A festival queued for adding, with editable dates before confirming.
type Pending = {
  base: FestivalSearchResult
  startDate: string
  endDate: string
}

export default function FestivalsSection({
  initialFestivals,
  today,
  shows,
  joins,
}: {
  initialFestivals: Festival[]
  today: string // computed on the server so SSR and hydration agree
  shows: ShowMatch[]
  joins: Record<string, { id: string; name: string }[]> // festival id → joins
}) {
  const [myFestivals, setMyFestivals] = useState<Festival[]>(initialFestivals)
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<FestivalSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [pending, setPending] = useState<Pending | null>(null)
  const [weekendOpen, setWeekendOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [joinsState, setJoinsState] = useState(joins)
  const [removingJoinId, setRemovingJoinId] = useState<string | null>(null)

  // Debounced search on each keystroke (~300ms, min 2 chars) via the action.
  useEffect(() => {
    const q = search.trim()
    if (q.length < 2) {
      setResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    let active = true
    const t = setTimeout(() => {
      searchFestivals(q)
        .then(r => { if (active) setResults(r) })
        .catch(() => { if (active) setResults([]) })
        .finally(() => { if (active) setSearching(false) })
    }, 300)
    return () => {
      active = false
      clearTimeout(t)
    }
  }, [search])

  function sortByDate(list: Festival[]) {
    return [...list].sort((a, b) => a.start_date.localeCompare(b.start_date))
  }

  // Queue an add (search result → date pre-filled; manual → date empty).
  function startAddResult(r: FestivalSearchResult) {
    setActionError(null)
    setWeekendOpen(false)
    setPending({ base: r, startDate: r.date ?? '', endDate: '' })
  }
  function startAddManual() {
    const name = search.trim()
    if (name.length < 2) return
    setActionError(null)
    setWeekendOpen(false)
    setPending({ base: { name, date: '', source: 'manual' }, startDate: '', endDate: '' })
  }
  function cancelAdd() {
    setPending(null)
    setWeekendOpen(false)
  }

  async function confirmAdd() {
    if (!pending) return
    if (!pending.startDate) {
      setActionError('Please pick a festival date.')
      return
    }
    setActionError(null)
    setAdding(true)
    try {
      const b = pending.base
      const endDate = weekendOpen && pending.endDate ? pending.endDate : null
      const res = await addFestival(
        { name: b.name, date: pending.startDate, city: b.city, url: b.url, source: b.source },
        endDate,
      )
      if (res.ok) {
        setMyFestivals(prev => sortByDate([...prev, res.festival]))
        setSearch('')
        setResults([])
        setPending(null)
        setWeekendOpen(false)
      } else {
        setActionError(res.error)
      }
    } catch {
      setActionError('Could not add festival.')
    } finally {
      setAdding(false)
    }
  }

  async function handleRemove(id: string) {
    setActionError(null)
    setRemovingId(id)
    try {
      const res = await removeFestival(id)
      if (res.ok) setMyFestivals(prev => prev.filter(f => f.id !== id))
      else setActionError(res.error ?? 'Could not remove festival.')
    } catch {
      setActionError('Could not remove festival.')
    } finally {
      setRemovingId(null)
    }
  }

  async function handleStatusChange(id: string, status: FestivalStatus) {
    setActionError(null)
    const prev = myFestivals
    setMyFestivals(list => list.map(f => (f.id === id ? { ...f, status } : f)))
    const res = await updateFestivalStatus(id, status)
    if (!res.ok) {
      setMyFestivals(prev)
      setActionError(res.error ?? 'Could not update status.')
    }
  }

  async function handleRatingChange(id: string, rating: number | null) {
    setActionError(null)
    const prev = myFestivals
    setMyFestivals(list => list.map(f => (f.id === id ? { ...f, rating } : f)))
    const res = await updateFestivalRating(id, rating)
    if (!res.ok) {
      setMyFestivals(prev)
      setActionError(res.error ?? 'Could not update rating.')
    }
  }

  // Followed-artist names whose shows match each saved festival.
  const matchesByFestival = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const f of myFestivals) {
      const key = normalize(f.name)
      if (!key) {
        map.set(f.id, [])
        continue
      }
      const names = new Set<string>()
      for (const s of shows) {
        if (showMatchesFestival(s, key, f.start_date, f.end_date)) names.add(s.artistName)
      }
      map.set(f.id, [...names].sort((a, b) => a.localeCompare(b)))
    }
    return map
  }, [myFestivals, shows])

  function toggleExpanded(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleRemoveJoin(festivalId: string, joinId: string) {
    setActionError(null)
    const prev = joinsState
    setRemovingJoinId(joinId)
    setJoinsState(s => ({ ...s, [festivalId]: (s[festivalId] ?? []).filter(j => j.id !== joinId) }))
    const res = await removeFestivalJoin(joinId)
    if (!res.ok) {
      setJoinsState(prev)
      setActionError(res.error ?? 'Could not remove join.')
    }
    setRemovingJoinId(null)
  }

  const query = search.trim()

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <ShareFestivals />
      </div>

      {/* ── Add festival (search first) ───────────────────────────────── */}
      <div>
        <h3 className="mb-3 text-sm font-semibold tracking-tight">Add festival</h3>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="glass-panel pl-9"
            placeholder="Search festivals…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {pending ? (
          /* Confirm step: edit the date(s) before saving. */
          <div className="glass-panel mt-3 space-y-3 rounded-xl p-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{pending.base.name}</span>
              {pending.base.source !== 'manual' && (
                <Badge variant={pending.base.source === 'ra.co' ? 'outline' : 'secondary'}>
                  {pending.base.source}
                </Badge>
              )}
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Festival date
                <Input
                  type="date"
                  value={pending.startDate}
                  onChange={e => setPending(p => (p ? { ...p, startDate: e.target.value } : p))}
                  className="w-auto"
                />
              </label>

              {weekendOpen && (
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  End date
                  <Input
                    type="date"
                    min={pending.startDate || undefined}
                    value={pending.endDate}
                    onChange={e => setPending(p => (p ? { ...p, endDate: e.target.value } : p))}
                    className="w-auto"
                  />
                </label>
              )}

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setWeekendOpen(o => !o)}
                aria-pressed={weekendOpen}
              >
                + weekend festival
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Button size="sm" onClick={confirmAdd} disabled={adding || !pending.startDate}>
                {adding ? <Loader2 className="animate-spin" /> : <Plus />}
                Add festival
              </Button>
              <Button variant="ghost" size="sm" onClick={cancelAdd} disabled={adding}>
                Cancel
              </Button>
            </div>
          </div>
        ) : query.length >= 2 ? (
          <>
            <ul className="glass-panel mt-3 divide-y divide-border overflow-hidden rounded-xl">
              {searching && (
                <li className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Searching…
                </li>
              )}

              {!searching && results.length === 0 && (
                <li className="px-4 py-3 text-sm text-muted-foreground">No matching events found.</li>
              )}

              {results.map((r, i) => {
                const sub = [formatDate(r.date), r.city].filter(Boolean).join(' · ')
                return (
                  <li key={`result-${i}`}>
                    <button
                      type="button"
                      onClick={() => startAddResult(r)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{r.name}</span>
                          <Badge
                            variant={r.source === 'ra.co' ? 'outline' : 'secondary'}
                            className="shrink-0"
                          >
                            {r.source}
                          </Badge>
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">{sub}</span>
                      </span>
                      <Plus className="size-4 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                )
              })}
            </ul>

            <div className="mt-2">
              <Button variant="outline" size="sm" onClick={startAddManual}>
                <Plus />
                Add “{query}” manually
              </Button>
            </div>
          </>
        ) : null}

        {actionError && <p className="mt-3 text-sm text-destructive">{actionError}</p>}
      </div>

      {/* ── Saved festivals (below) ───────────────────────────────────── */}
      {myFestivals.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-12 text-center">
          <CalendarX2 className="mx-auto mb-3 size-8 text-muted-foreground/60" />
          <p className="text-sm font-medium">No festivals yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Search above to add festivals you&apos;re attending.
          </p>
        </div>
      ) : (
        <div className="glass-panel overflow-hidden rounded-xl">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Festival</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead>Link</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {myFestivals.map(f => {
                const isPast = (f.end_date ?? f.start_date) < today
                const artists = matchesByFestival.get(f.id) ?? []
                const festivalJoins = joinsState[f.id] ?? []
                const hasMatches = artists.length > 0
                const hasJoins = festivalJoins.length > 0
                const hasExpandable = hasMatches || hasJoins
                const isExpanded = expanded.has(f.id)
                return (
                  <Fragment key={f.id}>
                  <TableRow data-reveal-card>
                    <TableCell className="font-medium">
                      {hasExpandable ? (
                        <button
                          type="button"
                          onClick={() => toggleExpanded(f.id)}
                          className="inline-flex items-center gap-2 text-left hover:underline"
                          aria-expanded={isExpanded}
                        >
                          {isExpanded ? (
                            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                          )}
                          <span>{f.name}</span>
                          {hasMatches && (
                            <Badge variant="secondary" className="shrink-0 font-normal">
                              🎵 {artists.length} {artists.length === 1 ? 'artist' : 'artists'}
                            </Badge>
                          )}
                          {hasJoins && (
                            <JoinAvatarStack names={festivalJoins.map(j => j.name)} />
                          )}
                        </button>
                      ) : (
                        f.name
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      <span className="inline-flex items-center gap-2">
                        {formatDate(f.start_date)}
                        {f.end_date ? ` – ${formatDate(f.end_date)}` : ''}
                        {isPast && <Badge variant="secondary" className="shrink-0">Past</Badge>}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Select
                        items={STATUS_ITEMS}
                        value={f.status}
                        onValueChange={value => handleStatusChange(f.id, value as FestivalStatus)}
                      >
                        <SelectTrigger size="sm" className={cn('w-[140px]', STATUS_TRIGGER[f.status])}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_ORDER.map(s => (
                            <SelectItem key={s} value={s}>
                              {STATUS_LABEL[s]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select
                        items={RATING_ITEMS}
                        value={f.rating ? String(f.rating) : 'none'}
                        onValueChange={value =>
                          handleRatingChange(f.id, value === 'none' ? null : Number(value))
                        }
                      >
                        <SelectTrigger size="sm" className="w-[72px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">—</SelectItem>
                          {Array.from({ length: 10 }, (_, i) => String(i + 1)).map(n => (
                            <SelectItem key={n} value={n}>
                              {n}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {f.url ? (
                        <a
                          href={f.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                        >
                          View <ExternalLink className="size-3.5" />
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => handleRemove(f.id)}
                        disabled={removingId === f.id}
                        aria-label={`Remove ${f.name}`}
                      >
                        {removingId === f.id ? <Loader2 className="animate-spin" /> : <X />}
                      </Button>
                    </TableCell>
                  </TableRow>
                  {hasExpandable && isExpanded && (
                    <TableRow>
                      <TableCell colSpan={6} className="space-y-1 bg-muted/30 text-sm text-muted-foreground">
                        {hasMatches && (
                          <p>
                            <span className="font-medium text-foreground">Followed artists playing: </span>
                            {artists.join(', ')}
                          </p>
                        )}
                        {hasJoins && (
                          <p className="flex flex-wrap items-center gap-1.5">
                            <span className="font-medium text-foreground">Joined:</span>
                            {festivalJoins.map(j => (
                              <span
                                key={j.id}
                                className="inline-flex items-center gap-0.5 rounded bg-background py-0.5 pr-0.5 pl-2"
                              >
                                {j.name}
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  className="text-muted-foreground hover:text-destructive"
                                  onClick={() => handleRemoveJoin(f.id, j.id)}
                                  disabled={removingJoinId === j.id}
                                  aria-label={`Remove ${j.name}`}
                                >
                                  {removingJoinId === j.id ? (
                                    <Loader2 className="animate-spin" />
                                  ) : (
                                    <X />
                                  )}
                                </Button>
                              </span>
                            ))}
                          </p>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                  </Fragment>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
