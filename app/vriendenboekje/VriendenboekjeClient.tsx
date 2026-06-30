'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import {
  ArrowLeft,
  BookHeart,
  Check,
  ChevronDown,
  ChevronUp,
  Headphones,
  PenLine,
  Share2,
} from 'lucide-react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { QRCodeSVG } from 'qrcode.react'

import { cn } from '@/lib/utils'
import { useGsapReveal } from '@/lib/use-gsap-reveal'
import {
  reactionKey,
  VRIENDENBOEKJE_FIELDS,
  type VbField,
  type Vriendenboekje,
} from '@/lib/vriendenboekje-types'
import { deleteReaction, insertReaction, subscribeToReactions } from '@/lib/vriendenboekje-reactions'
import { Form } from './Form'

// Warm gradients for photo-less placeholders.
const PLACEHOLDER_GRADIENTS = [
  'from-pink-400 to-rose-500',
  'from-fuchsia-400 to-pink-600',
  'from-rose-400 to-orange-400',
  'from-violet-400 to-fuchsia-500',
  'from-amber-400 to-rose-500',
]

// Loose, hand-placed scatter for the hero bubbles (percent of the hero box +
// a diameter in px). Not a grid — sizes and positions vary, overlapping a bit.
const BUBBLE_SLOTS: { left: number; top: number; size: number }[] = [
  { left: 50, top: 42, size: 90 },
  { left: 23, top: 24, size: 68 },
  { left: 77, top: 22, size: 74 },
  { left: 16, top: 58, size: 58 },
  { left: 84, top: 56, size: 62 },
  { left: 37, top: 66, size: 54 },
  { left: 64, top: 67, size: 56 },
  { left: 33, top: 14, size: 50 },
  { left: 68, top: 43, size: 60 },
  { left: 14, top: 38, size: 52 },
  { left: 86, top: 36, size: 50 },
  { left: 50, top: 76, size: 56 },
]

const HERO_MAX = BUBBLE_SLOTS.length

// Emoji confetti scattered between the bubbles — they float the same way.
const EMOJI_SLOTS: { e: string; left: number; top: number; size: number }[] = [
  { e: '✨', left: 50, top: 9, size: 26 },
  { e: '🫶', left: 60, top: 27, size: 24 },
  { e: '🕺', left: 27, top: 46, size: 28 },
  { e: '🎪', left: 13, top: 73, size: 30 },
  { e: '🎶', left: 87, top: 70, size: 26 },
]

// Stable pseudo-random per entry id so SSR and client agree (no hydration jump).
function hashStr(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

// Tiny seeded PRNG so each bubble floats on its own deterministic path.
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

const CAVEAT = { fontFamily: 'var(--font-caveat)' } as const

/** Circular photo, or a gradient + initials when there's no photo. */
function Avatar({ entry, textClass }: { entry: Vriendenboekje; textClass?: string }) {
  if (entry.foto_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={entry.foto_url}
        alt={entry.naam}
        draggable={false}
        className="size-full object-cover"
      />
    )
  }
  const gradient = PLACEHOLDER_GRADIENTS[hashStr(entry.id) % PLACEHOLDER_GRADIENTS.length]
  return (
    <div className={cn('grid size-full place-items-center bg-gradient-to-br', gradient)}>
      <span className={cn('font-bold text-white/90', textClass)}>{initialsOf(entry.naam)}</span>
    </div>
  )
}

export function VriendenboekjeClient({
  entries,
  initialCounts,
  mode,
  hostId,
}: {
  entries: Vriendenboekje[]
  initialCounts: Record<string, number>
  mode: 'host' | 'visitor'
  hostId: string
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<Vriendenboekje | null>(null)
  const [copied, setCopied] = useState(false)
  // Visitor fill-in flow: a welcome screen, then the form (which shows its own
  // thank-you). `null` = welcome, true = form open.
  const [filling, setFilling] = useState(false)

  // The host's shareable link: visitors open it to fill in this book.
  const [shareUrl, setShareUrl] = useState('')
  useEffect(() => {
    setShareUrl(`${window.location.origin}/vriendenboekje?host=${hostId}`)
  }, [hostId])

  // 😂 counts keyed by reactionKey(entryId, field). Seeded from the server, then
  // kept live: optimistic on tap + Supabase realtime for everyone else's taps.
  const [counts, setCounts] = useState<Record<string, number>>(initialCounts)
  const ownIds = useRef<Set<string>>(new Set())

  const rootRef = useRef<HTMLDivElement | null>(null)
  const idsKey = entries.map(e => e.id).join(',')

  // Scroll-triggered stagger for the feed cards + headings (newest first).
  // Keyed on entries only — new reaction-posts appear without re-flashing the list.
  useGsapReveal(rootRef, [idsKey])

  function bump(key: string, delta: number) {
    setCounts(c => ({ ...c, [key]: Math.max(0, (c[key] ?? 0) + delta) }))
  }

  // Live updates from other visitors. We tag our own inserts by id and skip
  // their realtime echo so a tap isn't counted twice. Host overview only.
  useEffect(() => {
    if (mode !== 'host') return
    return subscribeToReactions(row => {
      if (ownIds.current.has(row.id)) {
        ownIds.current.delete(row.id)
        return
      }
      bump(reactionKey(row.entry_id, row.field_name), 1)
    })
  }, [mode])

  // Add a reaction. Returns the new row id (the button stores it so it can later
  // toggle the reaction off by deleting that exact row).
  async function react(entryId: string, field: string): Promise<string | null> {
    const key = reactionKey(entryId, field)
    bump(key, 1) // optimistic
    const id = await insertReaction(entryId, field)
    if (id) {
      ownIds.current.add(id)
      return id
    }
    bump(key, -1) // insert failed — roll back
    return null
  }

  // Toggle a reaction off by deleting its row. Returns whether it succeeded.
  async function unreact(entryId: string, field: string, id: string): Promise<boolean> {
    const key = reactionKey(entryId, field)
    bump(key, -1) // optimistic
    const ok = await deleteReaction(id)
    if (!ok) bump(key, 1) // delete failed (e.g. migration 0013 not applied) — roll back
    return ok
  }

  // Share the host's fill-in link (not the current page URL).
  async function share() {
    const url = shareUrl || `${window.location.origin}/vriendenboekje?host=${hostId}`
    const data = {
      title: 'My festival friends',
      text: 'Seal our friendship with this Friend Journal.',
      url,
    }
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share(data)
      } catch {
        // user dismissed the share sheet — nothing to do
      }
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard blocked — silently ignore
    }
  }

  // ── Visitor mode: welcome → fill-in form (the form shows its own thank-you).
  if (mode === 'visitor') {
    if (filling) {
      return <Form hostId={hostId} doneLabel="Done" onDone={() => setFilling(false)} />
    }
    return <VisitorWelcome onBegin={() => setFilling(true)} />
  }

  // ── Host mode: the owner's own book.
  // "Become friends" lets the host fill in the book on their own phone — it
  // submits with hostId (= the logged-in user's own id) as host_user_id.
  if (filling) {
    return (
      <Form
        hostId={hostId}
        onDone={() => {
          setFilling(false)
          router.refresh()
        }}
      />
    )
  }

  if (entries.length === 0) {
    return (
      <HostEmptyState
        shareUrl={shareUrl}
        copied={copied}
        onShare={share}
        onWrite={() => setFilling(true)}
      />
    )
  }

  return (
    <div ref={rootRef}>
      <Hero
        entries={entries}
        copied={copied}
        onShare={share}
        onWrite={() => setFilling(true)}
        onSelect={setSelected}
      />

      <Feed entries={entries} counts={counts} onSelect={setSelected} />

      {selected && (
        <Detail
          entry={selected}
          counts={counts}
          onReact={field => react(selected.id, field)}
          onUnreact={(field, id) => unreact(selected.id, field, id)}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

/* ----------------------------- Visitor welcome ---------------------------- */

function VisitorWelcome({ onBegin }: { onBegin: () => void }) {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6 text-center">
      <div className="glass-panel grid size-16 place-items-center rounded-3xl">
        <BookHeart className="size-8 text-pink-300" />
      </div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Fill in this Friend Journal</h1>
        <p className="mx-auto mt-2 max-w-xs text-sm text-pink-700/80 dark:text-pink-100/80">
          Answer a few playful questions and become an official festival friend.
        </p>
      </div>
      <button
        type="button"
        onClick={onBegin}
        className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-pink-900/30 transition-transform active:scale-[0.97]"
      >
        <PenLine className="size-4" />
        Start
      </button>
    </div>
  )
}

/* ----------------------------- Host empty state --------------------------- */

function HostEmptyState({
  shareUrl,
  copied,
  onShare,
  onWrite,
}: {
  shareUrl: string
  copied: boolean
  onShare: () => void
  onWrite: () => void
}) {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6 text-center">
      <div className="glass-panel grid size-16 place-items-center rounded-3xl">
        <BookHeart className="size-8 text-pink-300" />
      </div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Your Friend Journal is still empty</h1>
        <p className="mx-auto mt-2 max-w-xs text-sm text-pink-700/80 dark:text-pink-100/80">
          Share your link so people can fill in your Friend Journal.
        </p>
      </div>

      <button
        type="button"
        onClick={onWrite}
        className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-pink-900/30 transition-transform active:scale-[0.97]"
      >
        <PenLine className="size-4" />
        Become friends
      </button>

      {shareUrl && (
        <div className="rounded-2xl bg-white p-3">
          <QRCodeSVG value={shareUrl} size={150} bgColor="#ffffff" fgColor="#000000" level="M" />
        </div>
      )}

      <button
        type="button"
        onClick={onShare}
        data-tour="share-vriendenboekje"
        className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-pink-900/30 transition-transform active:scale-[0.97]"
      >
        {copied ? <Check className="size-4" /> : <Share2 className="size-4" />}
        {copied ? 'Copied!' : 'Share your Friend Journal'}
      </button>

      {shareUrl && (
        <p className="max-w-xs break-all text-xs text-muted-foreground">{shareUrl}</p>
      )}
    </div>
  )
}

/* --------------------------------- Hero --------------------------------- */

function Hero({
  entries,
  copied,
  onShare,
  onWrite,
  onSelect,
}: {
  entries: Vriendenboekje[]
  copied: boolean
  onShare: () => void
  onWrite: () => void
  onSelect: (e: Vriendenboekje) => void
}) {
  const heroRef = useRef<HTMLDivElement | null>(null)
  const bubbleEls = useRef<(HTMLButtonElement | null)[]>([])
  const emojiEls = useRef<(HTMLDivElement | null)[]>([])
  const seen = useRef<Set<string>>(new Set())
  const firstRun = useRef(true)

  const heroEntries = entries.slice(0, HERO_MAX)
  const heroKey = heroEntries.map(e => e.id).join(',')

  useGSAP(
    () => {
      if (!heroRef.current) return
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

      const outers = heroEntries
        .map((_, i) => bubbleEls.current[i])
        .filter((el): el is HTMLButtonElement => Boolean(el))
      const emos = emojiEls.current.filter((el): el is HTMLDivElement => Boolean(el))
      const all = [...outers, ...emos]

      // Center every element on its slot point so floating reads symmetrically.
      gsap.set(all, { xPercent: -50, yPercent: -50, transformOrigin: 'center center' })

      if (reduce) {
        gsap.set(all, { scale: 1, autoAlpha: 1, x: 0, y: 0 })
        return
      }

      // A slow, organic drift — each axis on its own period so the path curves.
      const startFloat = (el: HTMLElement, seed: number) => {
        const rand = rng(seed)
        const ampX = 6 + rand() * 14
        const ampY = 6 + rand() * 14
        gsap.fromTo(
          el,
          { x: -ampX },
          { x: ampX, duration: 3 + rand() * 3, repeat: -1, yoyo: true, ease: 'sine.inOut' },
        )
        gsap.fromTo(
          el,
          { y: -ampY },
          {
            y: ampY,
            duration: 3 + rand() * 3,
            repeat: -1,
            yoyo: true,
            ease: 'sine.inOut',
            delay: rand() * 1.2,
          },
        )
      }

      // A freshly added bubble launches from the hero's center with extra bounce.
      const popFromCenter = (el: HTMLElement, slot: (typeof BUBBLE_SLOTS)[number], seed: number) => {
        const rect = heroRef.current!.getBoundingClientRect()
        const dx = rect.width * (0.5 - slot.left / 100)
        const dy = rect.height * (0.5 - slot.top / 100)
        gsap.fromTo(
          el,
          { scale: 0, autoAlpha: 0, x: dx, y: dy },
          {
            scale: 1,
            autoAlpha: 1,
            x: 0,
            y: 0,
            duration: 0.95,
            ease: 'back.out(2.4)',
            onComplete: () => startFloat(el, seed),
          },
        )
      }

      // Bubbles present since the last render vs. brand-new (added via the form).
      const newIdx = new Set<number>()
      if (!firstRun.current) {
        heroEntries.forEach((e, i) => {
          if (!seen.current.has(e.id)) newIdx.add(i)
        })
      }

      // Start the float on everything that isn't mid pop-in.
      outers.forEach((el, i) => {
        if (newIdx.has(i)) return
        startFloat(el, hashStr(heroEntries[i].id))
      })
      emos.forEach((el, i) => startFloat(el, (i + 1) * 9973))

      if (firstRun.current) {
        // Pop in one by one with a spring on first paint.
        gsap.from(all, {
          scale: 0,
          autoAlpha: 0,
          duration: 0.6,
          ease: 'back.out(1.7)',
          stagger: 0.15,
        })
      } else {
        gsap.set(all, { scale: 1, autoAlpha: 1 })
        newIdx.forEach(i => {
          const el = bubbleEls.current[i]
          if (el) popFromCenter(el, BUBBLE_SLOTS[i], hashStr(heroEntries[i].id))
        })
      }

      heroEntries.forEach(e => seen.current.add(e.id))
      firstRun.current = false
    },
    { dependencies: [heroKey], scope: heroRef },
  )

  return (
    <header className="-mt-2">
      {/* Floating bubbles + emoji */}
      <div ref={heroRef} className="relative h-[52vh] max-h-[480px] w-full overflow-hidden">
        {heroEntries.map((entry, i) => {
          const slot = BUBBLE_SLOTS[i]
          return (
            <button
              key={entry.id}
              type="button"
              aria-label={entry.naam}
              ref={el => {
                bubbleEls.current[i] = el
              }}
              onClick={() => onSelect(entry)}
              style={{ left: `${slot.left}%`, top: `${slot.top}%`, width: slot.size, height: slot.size }}
              className="absolute block overflow-hidden rounded-full shadow-[0_10px_30px_-8px_rgba(0,0,0,0.6)] ring-2 ring-black/15 dark:ring-white/20 will-change-transform active:scale-95"
            >
              <Avatar entry={entry} textClass={slot.size >= 80 ? 'text-2xl' : 'text-base'} />
            </button>
          )
        })}

        {EMOJI_SLOTS.map((slot, i) => (
          <div
            key={slot.e}
            aria-hidden
            ref={el => {
              emojiEls.current[i] = el
            }}
            style={{ left: `${slot.left}%`, top: `${slot.top}%`, fontSize: slot.size }}
            className="absolute select-none leading-none will-change-transform"
          >
            {slot.e}
          </div>
        ))}
      </div>

      {/* Title + CTA */}
      <div className="relative z-10 px-1 text-center">
        <h1 data-reveal-title className="text-3xl font-bold tracking-tight">
          My festival friends 🎉
        </h1>
        <p className="mx-auto mt-2 max-w-xs text-sm text-pink-700/80 dark:text-pink-100/80">
          Seal our friendship with this Friend Journal
        </p>

        <div className="mt-5 space-y-2.5">
          <button
            type="button"
            onClick={onWrite}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-pink-900/30 transition-transform active:scale-[0.97]"
          >
            <PenLine className="size-4" />
            Become friends
          </button>
          <button
            type="button"
            onClick={onShare}
            data-tour="share-vriendenboekje"
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-black/[0.06] dark:bg-white/10 px-5 py-3 text-sm font-semibold text-pink-700 dark:text-pink-100 ring-1 ring-black/10 dark:ring-white/15 backdrop-blur-md transition-transform active:scale-[0.97]"
          >
            {copied ? <Check className="size-4" /> : <Share2 className="size-4" />}
            {copied ? 'Copied!' : 'Share your Friend Journal'}
          </button>
        </div>
      </div>
    </header>
  )
}

/* --------------------------------- Feed --------------------------------- */

// The answer body for a field, as a single line of feed text. Stellingen read
// as "Agree — explanation"; everything else is the raw answer.
function answerText(field: VbField, entry: Vriendenboekje): string {
  if (field.stelling) {
    const v = field.stelling(entry)
    if (v == null) return ''
    const toelichting = field.text(entry)
    return `${v ? 'Agree' : 'Disagree'}${toelichting ? ` — ${toelichting}` : ''}`
  }
  return field.text(entry) ?? ''
}

function Feed({
  entries,
  counts,
  onSelect,
}: {
  entries: Vriendenboekje[]
  counts: Record<string, number>
  onSelect: (e: Vriendenboekje) => void
}) {
  const [laughsOpen, setLaughsOpen] = useState(true)

  if (entries.length === 0) {
    return (
      <div className="mt-10 rounded-2xl border border-dashed border-black/10 dark:border-white/15 py-14 text-center">
        <BookHeart className="mx-auto mb-3 size-8 text-muted-foreground/60" />
        <p className="text-sm font-medium">No festival friends yet</p>
        <p className="mt-1 text-sm text-muted-foreground">Be the first to fill one in.</p>
      </div>
    )
  }

  // Every answer that has at least one 😂, most-reacted first (ties: newest).
  const posts = entries
    .flatMap(entry =>
      VRIENDENBOEKJE_FIELDS.map(field => ({
        entry,
        field,
        count: counts[reactionKey(entry.id, field.key)] ?? 0,
      })),
    )
    .filter(p => p.count > 0)
    .sort(
      (a, b) =>
        b.count - a.count ||
        new Date(b.entry.created_at).getTime() - new Date(a.entry.created_at).getTime(),
    )

  return (
    <>
      {posts.length > 0 && (
        <section className="mt-10 space-y-3">
          <button
            type="button"
            onClick={() => setLaughsOpen(o => !o)}
            aria-expanded={laughsOpen}
            className="flex w-full items-center justify-between px-1 transition-transform active:scale-[0.99]"
          >
            <h2
              data-reveal-title
              className="text-sm font-semibold uppercase tracking-wide text-pink-700/80 dark:text-pink-100/80"
            >
              Funniest reactions
            </h2>
            {laughsOpen ? (
              <ChevronUp className="size-4 text-pink-700/80 dark:text-pink-100/80" />
            ) : (
              <ChevronDown className="size-4 text-pink-700/80 dark:text-pink-100/80" />
            )}
          </button>

          {/* 0fr → 1fr grid trick: smooth height transition without measuring. */}
          <div
            className="grid transition-[grid-template-rows] duration-300 ease-out"
            style={{ gridTemplateRows: laughsOpen ? '1fr' : '0fr' }}
            // Collapsing shifts the cards below up into view; ScrollTrigger must
            // recompute positions or their reveal (opacity 0 → 1) never fires.
            onTransitionEnd={e => {
              if (e.propertyName === 'grid-template-rows') ScrollTrigger.refresh()
            }}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="space-y-3">
                {posts.map(({ entry, field }) => (
                  <button
                    key={`${entry.id}:${field.key}`}
                    type="button"
                    data-reveal-card
                    onClick={() => onSelect(entry)}
                    className="glass-panel block w-full rounded-2xl p-4 text-left shadow-[0_0_22px_-6px_rgba(244,114,182,0.55)] ring-1 ring-pink-400/40 transition-transform active:scale-[0.99]"
                  >
                    <div className="flex items-center gap-3">
                      <div className="size-9 shrink-0 overflow-hidden rounded-full ring-2 ring-black/10 dark:ring-white/15">
                        <Avatar entry={entry} textClass="text-xs" />
                      </div>
                      <p className="min-w-0 flex-1 truncate text-sm font-semibold">{entry.naam}</p>
                    </div>

                    <p className="mt-2 px-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {field.label}
                    </p>
                    <p className="mt-0.5 line-clamp-3 px-0.5 text-[15px] italic text-foreground/90">
                      “{answerText(field, entry)}”
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="mt-10 space-y-3">
        <h2 data-reveal-title className="px-1 text-sm font-semibold uppercase tracking-wide text-pink-700/80 dark:text-pink-100/80">
          All festival friends
        </h2>

      {entries.map(entry => (
        <button
          key={entry.id}
          type="button"
          data-reveal-card
          onClick={() => onSelect(entry)}
          className="glass-panel block w-full rounded-2xl p-4 text-left transition-transform active:scale-[0.99]"
        >
          <div className="flex items-start gap-3.5">
            <div className="size-14 shrink-0 overflow-hidden rounded-full ring-2 ring-black/10 dark:ring-white/15">
              <Avatar entry={entry} textClass="text-lg" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-base font-semibold leading-tight">{entry.naam}</p>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {formatDate(entry.created_at)}
                </span>
              </div>

              {entry.dj_naam && (
                <p className="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-pink-200/90">
                  <Headphones className="size-3.5 shrink-0" />
                  <span className="truncate">{entry.dj_naam}</span>
                </p>
              )}

              {entry.eerste_indruk && (
                <p className="mt-2 line-clamp-2 text-sm italic text-foreground/80">
                  “{entry.eerste_indruk}”
                </p>
              )}
            </div>
          </div>
        </button>
      ))}
      </section>
    </>
  )
}

/* -------------------------------- Detail -------------------------------- */

function Detail({
  entry,
  counts,
  onReact,
  onUnreact,
  onClose,
}: {
  entry: Vriendenboekje
  counts: Record<string, number>
  onReact: (field: string) => Promise<string | null>
  onUnreact: (field: string, id: string) => Promise<boolean>
  onClose: () => void
}) {
  const scrollerRef = useRef<HTMLDivElement>(null)

  // Stagger each chat bubble in as it scrolls into the modal's own viewport.
  useGSAP(
    () => {
      const scroller = scrollerRef.current
      if (!scroller) return
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

      gsap.registerPlugin(ScrollTrigger)
      const items = gsap.utils.toArray<HTMLElement>(scroller.querySelectorAll('[data-bubble]'))
      items.forEach(el => {
        gsap.fromTo(
          el,
          { autoAlpha: 0, y: 22 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.5,
            ease: 'power2.out',
            scrollTrigger: { trigger: el, scroller, start: 'top 94%' },
          },
        )
      })
      ScrollTrigger.refresh()
    },
    { scope: scrollerRef },
  )

  if (typeof document === 'undefined') return null

  // Only the answered questions become bubbles, in the canonical order.
  const bubbles = VRIENDENBOEKJE_FIELDS.map(field => {
    const stellingVal = field.stelling ? field.stelling(entry) : undefined
    const body = field.text(entry)
    if (field.stelling) {
      if (stellingVal == null) return null
    } else if (!body) {
      return null
    }
    return { field, stellingVal, body }
  }).filter((b): b is { field: VbField; stellingVal: boolean | null | undefined; body: string | null } => b !== null)

  return createPortal(
    <div
      ref={scrollerRef}
      className="fixed inset-0 z-[120] overflow-y-auto bg-background/95 backdrop-blur-xl duration-300 animate-in fade-in-0 slide-in-from-bottom-6"
    >
      {/* Pink/magenta accent glow at the top, matching the page theme */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[60vh]"
        style={{
          backgroundImage: 'var(--gradient-friends)',
          maskImage: 'linear-gradient(to bottom, black 0%, black 30%, transparent 90%)',
          WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 30%, transparent 90%)',
        }}
      />

      <div className="mx-auto w-full max-w-xl px-4 pb-16 pt-5">
        <button
          type="button"
          onClick={onClose}
          className="mb-5 inline-flex items-center gap-1.5 rounded-full bg-black/[0.06] dark:bg-white/10 px-4 py-2 text-sm font-medium backdrop-blur-md transition-transform active:scale-95"
        >
          <ArrowLeft className="size-4" />
          Back
        </button>

        {/* Polaroid-style header */}
        <div className="mx-auto max-w-xs -rotate-2 rounded-md bg-[#fbfaf4] p-3 pb-8 shadow-[0_18px_44px_-12px_rgba(0,0,0,0.7)]">
          <div className="aspect-square overflow-hidden rounded-sm bg-neutral-200">
            {entry.foto_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={entry.foto_url} alt={entry.naam} className="size-full object-cover" />
            ) : (
              <div className="grid size-full place-items-center bg-gradient-to-br from-pink-400 to-rose-500">
                <span className="text-7xl font-bold text-white/90">{initialsOf(entry.naam)}</span>
              </div>
            )}
          </div>
          <p style={CAVEAT} className="mt-2 text-center text-4xl leading-none text-neutral-800">
            {entry.naam}
          </p>
        </div>

        <div className="mt-6 text-center">
          {entry.dj_naam && <p className="text-base text-pink-700 dark:text-pink-200">🎧 {entry.dj_naam}</p>}
          <p className="mt-1 text-xs text-muted-foreground">Filled in on {formatDate(entry.created_at)}</p>
        </div>

        {/* Chat-style bubbles, one per answered question. */}
        <div className="mt-7 space-y-5">
          {bubbles.map(({ field, stellingVal, body }) => (
            <Bubble
              key={field.key}
              entryId={entry.id}
              field={field}
              count={counts[reactionKey(entry.id, field.key)] ?? 0}
              onReact={() => onReact(field.key)}
              onUnreact={id => onUnreact(field.key, id)}
            >
              {field.stelling ? (
                <div>
                  <p
                    className={cn(
                      'text-base font-semibold',
                      stellingVal ? 'text-pink-700 dark:text-pink-100' : 'text-foreground/70',
                    )}
                  >
                    {stellingVal ? 'Agree' : 'Disagree'}
                  </p>
                  {body && (
                    <p className="mt-1.5 whitespace-pre-wrap text-sm leading-snug text-foreground/80">
                      {body}
                    </p>
                  )}
                </div>
              ) : (
                <p className="whitespace-pre-wrap text-[15px] leading-snug">{body}</p>
              )}
            </Bubble>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** A chat bubble: muted question label, pink-tinted glass body with a tail, and a
 *  😂 reaction chip that overlaps the bottom-right corner. Extra bottom padding
 *  reserves an empty band there so the chip never covers the answer text.
 *  Width fits the content (up to ~85% of screen). */
function Bubble({
  entryId,
  field,
  count,
  onReact,
  onUnreact,
  children,
}: {
  entryId: string
  field: VbField
  count: number
  onReact: () => Promise<string | null>
  onUnreact: (id: string) => Promise<boolean>
  children: React.ReactNode
}) {
  return (
    <div data-bubble>
      <p className="mb-1 px-2 text-sm font-medium text-muted-foreground">{field.label}</p>
      {/* The bubble keeps a neutral style even when reacted (no active glow). The
          chip overlaps the bottom-right corner; pb-6 keeps it clear of the text. */}
      <div className="vb-bubble relative w-fit min-w-[7rem] max-w-[85%] rounded-2xl rounded-tl-none px-4 pb-6 pt-3">
        {children}
        <ReactionButton
          entryId={entryId}
          fieldName={field.key}
          count={count}
          onReact={onReact}
          onUnreact={onUnreact}
        />
      </div>
    </div>
  )
}

/**
 * 😂 toggle. First tap inserts a reaction (animates + increments) and stores the
 * row id in localStorage; tapping again deletes that exact row (decrements). The
 * value stored is the row id so we know what to delete. Toggling off requires
 * migration 0013 (anon delete) — without it the delete is rejected and the
 * on-state is restored.
 */
function ReactionButton({
  entryId,
  fieldName,
  count,
  onReact,
  onUnreact,
}: {
  entryId: string
  fieldName: string
  count: number
  onReact: () => Promise<string | null>
  onUnreact: (id: string) => Promise<boolean>
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const busy = useRef(false)
  const storageKey = `reacted_${entryId}_${fieldName}`

  // Detail only ever renders client-side (a portal opened on tap), so reading
  // localStorage in the initializer is safe — no SSR pass, no hydration mismatch.
  const [reacted, setReacted] = useState(() => {
    if (typeof window === 'undefined') return false
    try {
      return localStorage.getItem(storageKey) != null
    } catch {
      return false // localStorage unavailable (private mode) — treat as not reacted
    }
  })

  function readKey(): string | null {
    try {
      return localStorage.getItem(storageKey)
    } catch {
      return null
    }
  }
  function writeKey(v: string | null) {
    try {
      if (v == null) localStorage.removeItem(storageKey)
      else localStorage.setItem(storageKey, v)
    } catch {
      /* ignore storage failures */
    }
  }

  // The 😂 bounce + a copy flying up and fading out. Only on turn-on.
  function playFly() {
    const btn = ref.current
    if (!btn) return
    // clearProps drops the inline transform when done, so the inset-based
    // position is never left offset by a leftover scale matrix.
    gsap.fromTo(
      btn,
      { scale: 0.7 },
      { scale: 1, duration: 0.55, ease: 'back.out(3)', clearProps: 'transform' },
    )
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const fly = document.createElement('span')
    fly.textContent = '😂'
    fly.setAttribute('aria-hidden', 'true')
    fly.style.cssText =
      'position:absolute;right:12px;bottom:30px;font-size:22px;pointer-events:none;z-index:20;'
    btn.parentElement?.appendChild(fly)
    gsap.to(fly, {
      y: -66,
      opacity: 0,
      scale: 1.7,
      rotate: gsap.utils.random(-25, 25),
      duration: 0.9,
      ease: 'power2.out',
      onComplete: () => fly.remove(),
    })
  }

  async function handle() {
    if (busy.current) return // ignore taps while an insert/delete is in flight
    busy.current = true
    try {
      if (!reacted) {
        setReacted(true) // optimistic on
        playFly()
        const id = await onReact()
        if (id) writeKey(id)
        else setReacted(false) // insert failed — revert
      } else {
        const id = readKey()
        setReacted(false) // optimistic off
        if (id) {
          const ok = await onUnreact(id)
          if (ok) writeKey(null)
          else setReacted(true) // delete rejected (migration 0013?) — restore
        } else {
          writeKey(null) // no stored id (legacy/blocked) — just clear the flag
        }
      }
    } finally {
      busy.current = false
    }
  }

  return (
    <button
      ref={ref}
      type="button"
      onClick={handle}
      aria-label={reacted ? 'Remove your laugh' : 'Send a laugh'}
      aria-pressed={reacted}
      // Positioned with inset offsets (not translate) so the GSAP scale bounce
      // can't clobber the transform and slide the chip diagonally.
      className={cn(
        'absolute -bottom-3 -right-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-white shadow-[0_4px_12px_-4px_rgba(0,0,0,0.7)] ring-1',
        reacted ? 'bg-pink-500 ring-pink-400' : 'bg-zinc-700 ring-black/10 dark:ring-white/15',
      )}
    >
      <span className="text-sm leading-none">😂</span>
      {count > 0 && <span className="tabular-nums">{count}</span>}
    </button>
  )
}
