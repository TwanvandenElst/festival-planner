'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  CalendarX2,
  Check,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'

import {
  searchFestivals,
  addFestival,
  removeFestival,
  updateFestivalStatus,
  updateFestivalRating,
  updateFestivalName,
} from '@/lib/festivals'
import { removeFestivalJoin } from '@/lib/festival-joins'
import type { Festival, FestivalSearchResult, FestivalStatus } from '@/lib/festivals-types'
import { normalize } from '@/lib/normalize'
import { cn } from '@/lib/utils'
import { ShareFestivals } from './ShareFestivals'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

// Tapping the status pill cycles in this order (per the card design).
const STATUS_CYCLE: Record<FestivalStatus, FestivalStatus> = {
  wishlist: 'in_optie',
  in_optie: 'tickets_gekocht',
  tickets_gekocht: 'wishlist',
}
// Display labels are English; the stored DB values stay as-is.
const STATUS_LABEL: Record<FestivalStatus, string> = {
  tickets_gekocht: 'Tickets Bought',
  in_optie: 'Optioned',
  wishlist: 'Wishlist',
}
const STATUS_PILL: Record<FestivalStatus, string> = {
  tickets_gekocht: 'bg-green-500/20 text-green-400',
  in_optie: 'bg-orange-500/20 text-orange-400',
  wishlist: 'bg-white/10 text-white/50',
}
const STATUS_DOT: Record<FestivalStatus, string> = {
  tickets_gekocht: 'bg-green-400',
  in_optie: 'bg-orange-400',
  wishlist: 'bg-white/40',
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

/** Long date with year — used in the search results list. */
function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/** Compact date for the card header, e.g. "3 Jul" or "3 Jul – 5 Jul". */
function formatCardDate(start: string, end: string | null) {
  const opts = { day: 'numeric', month: 'short', timeZone: 'UTC' } as const
  const s = new Date(start).toLocaleDateString('en-GB', opts)
  if (!end || end === start) return s
  return `${s} – ${new Date(end).toLocaleDateString('en-GB', opts)}`
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
 * Overlapping initials stack of joined users. Max 3 circles: when there are more
 * than 3, the last slot becomes a "+N" chip. Purely visual — the tappable
 * popover that wraps it (in the card) exposes names + removal.
 */
function AvatarStack({ names }: { names: string[] }) {
  const overflow = names.length > 3 ? names.length - 2 : 0
  const shown = overflow > 0 ? names.slice(0, 2) : names

  return (
    <span className="inline-flex shrink-0 items-center">
      {shown.map((name, i) => (
        <span
          key={i}
          style={{ zIndex: shown.length - i }}
          className={cn(
            'grid size-6 place-items-center rounded-full bg-gradient-to-br text-[11px] font-bold text-white ring-2 ring-background',
            gradientAt(i),
            i > 0 && '-ml-1.5',
          )}
        >
          {initialOf(name)}
        </span>
      ))}
      {overflow > 0 && (
        <span className="-ml-1.5 grid size-6 place-items-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground ring-2 ring-background">
          +{overflow}
        </span>
      )}
    </span>
  )
}

/** Large faded watermark rating (1–10) in the card's bottom-right corner.
 * Tapping it opens a popover of 1–10 pills; tapping a number saves immediately
 * and closes the picker. Shows "?" when no rating is set yet. */
function RatingWatermark({
  rating,
  onRate,
}: {
  rating: number | null
  onRate: (n: number | null) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="absolute right-3 top-1/2 z-0 -translate-y-1/2 select-none text-8xl font-bold leading-none text-white/10 outline-none transition-transform active:scale-95"
        aria-label={
          rating ? `Rating ${rating} of 10. Tap to change.` : 'No rating yet. Tap to set.'
        }
      >
        {rating ?? '?'}
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-auto p-2">
        <div className="grid grid-cols-5 gap-1.5" role="group" aria-label="Rating">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
            <button
              key={n}
              type="button"
              onClick={() => {
                onRate(n)
                setOpen(false)
              }}
              className={cn(
                'grid size-9 place-items-center rounded-full text-sm font-semibold transition-colors',
                rating === n
                  ? 'bg-fuchsia-500 text-white'
                  : 'bg-white/10 text-foreground hover:bg-white/20',
              )}
              aria-label={`Rate ${n}`}
            >
              {n}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

type Join = { id: string; name: string }

/** A single festival card — all interactions (status cycle, rating, rename,
 * delete, join removal) happen inline here, no modals. */
function FestivalCard({
  festival: f,
  isPast,
  artistNames,
  joins,
  onCycleStatus,
  onRate,
  onRename,
  onDelete,
  onRemoveJoin,
  removing,
  removingJoinId,
}: {
  festival: Festival
  isPast: boolean
  artistNames: string[]
  joins: Join[]
  onCycleStatus: () => void
  onRate: (n: number | null) => void
  onRename: (name: string) => Promise<boolean>
  onDelete: () => void
  onRemoveJoin: (joinId: string) => void
  removing: boolean
  removingJoinId: string | null
}) {
  const [pulse, setPulse] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(f.name)
  const [savingName, setSavingName] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  function handleCycle() {
    setPulse(true)
    onCycleStatus()
    window.setTimeout(() => setPulse(false), 320)
  }

  async function saveName() {
    if (editValue.trim().length < 2) return
    setSavingName(true)
    const ok = await onRename(editValue)
    setSavingName(false)
    if (ok) setEditing(false)
  }

  return (
    <div
      data-reveal-card
      className={cn(
        'glass-panel relative overflow-hidden rounded-2xl p-4 transition-opacity',
        isPast && 'opacity-50',
      )}
    >
      {/* Row 1 — name + date */}
      <div className="flex items-start justify-between gap-3">
        {editing ? (
          <div className="flex flex-1 items-center gap-2">
            <Input
              autoFocus
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') saveName()
                if (e.key === 'Escape') {
                  setEditing(false)
                  setEditValue(f.name)
                }
              }}
              className="h-8 flex-1"
            />
            <Button
              size="icon-sm"
              onClick={saveName}
              disabled={savingName || editValue.trim().length < 2}
              aria-label="Save name"
            >
              {savingName ? <Loader2 className="animate-spin" /> : <Check />}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                setEditing(false)
                setEditValue(f.name)
              }}
              aria-label="Cancel rename"
            >
              <X />
            </Button>
          </div>
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <span className="block text-sm text-muted-foreground">
                {formatCardDate(f.start_date, f.end_date)}
              </span>
              <h3 className="break-words text-lg font-bold leading-tight text-foreground">
                {f.name}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditValue(f.name)
                setEditing(true)
              }}
              className="relative z-10 grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
              aria-label="Edit name"
            >
              <Pencil className="size-4" />
            </button>
          </>
        )}
      </div>

      {/* Row 2 — status pill */}
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={handleCycle}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-transform active:scale-95',
            STATUS_PILL[f.status],
            pulse && 'animate-[badge-pop_0.32s_ease-out]',
          )}
          aria-label={`Status: ${STATUS_LABEL[f.status]}. Tap to change.`}
        >
          <span className={cn('size-1.5 rounded-full', STATUS_DOT[f.status])} />
          {STATUS_LABEL[f.status]}
        </button>
      </div>

      {/* Row 3 — joined avatars (+ artist-match chip) and the three-dot menu */}
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex min-h-[24px] items-center gap-2">
          {joins.length > 0 && (
            <Popover>
              <PopoverTrigger
                className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`${joins.length} joined`}
              >
                <AvatarStack names={joins.map(j => j.name)} />
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto min-w-[180px] p-3">
                <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Joined</p>
                <ul className="flex flex-col gap-1">
                  {joins.map(j => (
                    <li key={j.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">{j.name}</span>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => onRemoveJoin(j.id)}
                        disabled={removingJoinId === j.id}
                        aria-label={`Remove ${j.name}`}
                      >
                        {removingJoinId === j.id ? <Loader2 className="animate-spin" /> : <X />}
                      </Button>
                    </li>
                  ))}
                </ul>
              </PopoverContent>
            </Popover>
          )}

          {artistNames.length > 0 && (
            <Popover>
              <PopoverTrigger
                className="relative z-10 inline-flex h-6 items-center gap-1 rounded-full bg-white/10 px-2 text-[11px] font-medium text-muted-foreground outline-none transition-colors hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`${artistNames.length} of your artists playing`}
              >
                🎵 {artistNames.length}
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto min-w-[180px] p-3">
                <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Your artists</p>
                <ul className="flex flex-col gap-1">
                  {artistNames.map(name => (
                    <li key={name} className="truncate text-sm">
                      {name}
                    </li>
                  ))}
                </ul>
              </PopoverContent>
            </Popover>
          )}
        </div>

        <Popover
          open={menuOpen}
          onOpenChange={o => {
            setMenuOpen(o)
            if (!o) setConfirmDelete(false)
          }}
        >
          <PopoverTrigger
            className="relative z-10 grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
            aria-label="Festival options"
          >
            <MoreHorizontal className="size-5" />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto min-w-[190px] p-1.5">
            {confirmDelete ? (
              <div className="flex flex-col gap-2 p-1.5">
                <p className="text-sm font-medium">Delete this festival?</p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      onDelete()
                      setMenuOpen(false)
                      setConfirmDelete(false)
                    }}
                    disabled={removing}
                  >
                    {removing ? <Loader2 className="animate-spin" /> : <Trash2 />}
                    Delete
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="size-4" /> Delete festival
                </button>
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>

      <RatingWatermark rating={f.rating} onRate={onRate} />
    </div>
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

  async function handleRename(id: string, name: string): Promise<boolean> {
    const trimmed = name.trim()
    if (trimmed.length < 2) {
      setActionError('Festival name is too short.')
      return false
    }
    setActionError(null)
    const prev = myFestivals
    setMyFestivals(list => list.map(f => (f.id === id ? { ...f, name: trimmed } : f)))
    const res = await updateFestivalName(id, trimmed)
    if (!res.ok) {
      setMyFestivals(prev)
      setActionError(res.error ?? 'Could not rename festival.')
      return false
    }
    return true
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

  // Soonest first; past festivals (end/start before today) pushed to the bottom.
  const sortedFestivals = useMemo(() => {
    const upcoming: Festival[] = []
    const past: Festival[] = []
    for (const f of myFestivals) {
      if ((f.end_date ?? f.start_date) < today) past.push(f)
      else upcoming.push(f)
    }
    const byStart = (a: Festival, b: Festival) => a.start_date.localeCompare(b.start_date)
    upcoming.sort(byStart)
    past.sort(byStart)
    return [...upcoming, ...past]
  }, [myFestivals, today])

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

      {/* ── Saved festivals (cards) ───────────────────────────────────── */}
      {myFestivals.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-12 text-center">
          <CalendarX2 className="mx-auto mb-3 size-8 text-muted-foreground/60" />
          <p className="text-sm font-medium">No festivals yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Search above to add festivals you&apos;re attending.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedFestivals.map(f => (
            <FestivalCard
              key={f.id}
              festival={f}
              isPast={(f.end_date ?? f.start_date) < today}
              artistNames={matchesByFestival.get(f.id) ?? []}
              joins={joinsState[f.id] ?? []}
              onCycleStatus={() => handleStatusChange(f.id, STATUS_CYCLE[f.status])}
              onRate={rating => handleRatingChange(f.id, rating)}
              onRename={name => handleRename(f.id, name)}
              onDelete={() => handleRemove(f.id)}
              onRemoveJoin={joinId => handleRemoveJoin(f.id, joinId)}
              removing={removingId === f.id}
              removingJoinId={removingJoinId}
            />
          ))}
        </div>
      )}
    </div>
  )
}
