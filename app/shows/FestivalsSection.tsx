'use client'

import { useEffect, useState } from 'react'
import { CalendarX2, ExternalLink, Loader2, Plus, Search, X } from 'lucide-react'

import {
  searchFestivals,
  addFestival,
  removeFestival,
  updateFestivalStatus,
  updateFestivalRating,
} from '@/lib/festivals'
import type { Festival, FestivalSearchResult, FestivalStatus } from '@/lib/festivals-types'
import { cn } from '@/lib/utils'
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

const TODAY = new Date().toISOString().slice(0, 10)

const STATUS_ORDER: FestivalStatus[] = ['tickets_gekocht', 'in_optie', 'wishlist']
const STATUS_LABEL: Record<FestivalStatus, string> = {
  tickets_gekocht: 'Tickets gekocht',
  in_optie: 'In optie',
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

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

// A festival queued for adding, with editable dates before confirming.
type Pending = {
  base: FestivalSearchResult
  startDate: string
  endDate: string
}

export default function FestivalsSection({ initialFestivals }: { initialFestivals: Festival[] }) {
  const [myFestivals, setMyFestivals] = useState<Festival[]>(initialFestivals)
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<FestivalSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [pending, setPending] = useState<Pending | null>(null)
  const [weekendOpen, setWeekendOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

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

  const query = search.trim()

  return (
    <div className="space-y-6">
      {/* ── Add festival (search first) ───────────────────────────────── */}
      <div>
        <h3 className="mb-3 text-sm font-semibold tracking-tight">Add festival</h3>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search festivals…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {pending ? (
          /* Confirm step: edit the date(s) before saving. */
          <div className="mt-3 space-y-3 rounded-xl border border-border p-4">
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
            <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border">
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
        <div className="overflow-hidden rounded-xl border border-border">
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
                const isPast = (f.end_date ?? f.start_date) < TODAY
                return (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.name}</TableCell>
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
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
