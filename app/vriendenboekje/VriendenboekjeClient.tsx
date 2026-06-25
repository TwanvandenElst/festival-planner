'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import {
  ArrowLeft,
  BookHeart,
  Check,
  ChevronLeft,
  ChevronRight,
  Headphones,
  PenLine,
  Share2,
} from 'lucide-react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'

import { cn } from '@/lib/utils'
import {
  DANCEFLOOR_LABEL,
  NAAR_HUIS_LABEL,
  type Vriendenboekje,
} from '@/lib/vriendenboekje-types'
import { Form } from './Form'

// Warm gradients for photo-less placeholders.
const PLACEHOLDER_GRADIENTS = [
  'from-pink-400 to-rose-500',
  'from-fuchsia-400 to-pink-600',
  'from-rose-400 to-orange-400',
  'from-violet-400 to-fuchsia-500',
  'from-amber-400 to-rose-500',
]

// Stable pseudo-random per entry id so SSR and client agree (no hydration jump).
function hashStr(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

const CAVEAT = { fontFamily: 'var(--font-caveat)' } as const

// Resting transform for a card given its position relative to the front card
// (0 = front, 1/2 = peeking from the stack, negative = already swiped away).
// `x` is always reset to 0 so any leftover drag offset is cleared on settle.
function stackVars(rel: number): gsap.TweenVars {
  if (rel < 0) return { x: 0, xPercent: -120, y: 0, rotate: -14, scale: 1, autoAlpha: 0 }
  if (rel === 0) return { x: 0, xPercent: 0, y: 0, rotate: 0, scale: 1, autoAlpha: 1 }
  if (rel === 1) return { x: 0, xPercent: 0, y: 18, rotate: 0, scale: 0.93, autoAlpha: 1 }
  if (rel === 2) return { x: 0, xPercent: 0, y: 34, rotate: 0, scale: 0.86, autoAlpha: 1 }
  return { x: 0, xPercent: 0, y: 34, rotate: 0, scale: 0.86, autoAlpha: 0 }
}

function zIndexFor(rel: number) {
  if (rel === 0) return 40
  if (rel === 1) return 30
  if (rel === 2) return 20
  return 10
}

export function VriendenboekjeClient({ entries }: { entries: Vriendenboekje[] }) {
  const router = useRouter()
  const [writing, setWriting] = useState(false)
  const [selected, setSelected] = useState<Vriendenboekje | null>(null)
  const [index, setIndex] = useState(0)
  const [copied, setCopied] = useState(false)

  const stackRef = useRef<HTMLDivElement | null>(null)
  const cardEls = useRef<(HTMLDivElement | null)[]>([])
  const firstRun = useRef(true)
  const drag = useRef<{ startX: number; startY: number; dx: number; active: boolean } | null>(null)

  const total = entries.length

  // Lay out / animate every card to its resting position whenever the front
  // card changes. On first run the visible cards stagger in from below.
  useGSAP(
    () => {
      if (!stackRef.current) return
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

      entries.forEach((_, i) => {
        const el = cardEls.current[i]
        if (!el) return
        const rel = i - index
        const vars = stackVars(rel)
        gsap.set(el, { zIndex: zIndexFor(rel) })
        if (firstRun.current || reduce) {
          gsap.set(el, vars)
        } else {
          gsap.to(el, { ...vars, duration: 0.55, ease: 'back.out(1.2)' })
        }
      })

      if (firstRun.current) {
        firstRun.current = false
        if (!reduce) {
          const visible = [index, index + 1, index + 2]
            .map(i => cardEls.current[i])
            .filter((el): el is HTMLDivElement => Boolean(el))
          gsap.from(visible, {
            y: '+=70',
            autoAlpha: 0,
            duration: 0.6,
            ease: 'back.out(1.4)',
            stagger: 0.12,
          })
        }
      }
    },
    { dependencies: [index, total], scope: stackRef },
  )

  if (writing) {
    return (
      <Form
        onDone={() => {
          setWriting(false)
          router.refresh()
        }}
      />
    )
  }

  function go(dir: 1 | -1) {
    setIndex(i => Math.min(Math.max(i + dir, 0), total - 1))
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    drag.current = { startX: e.clientX, startY: e.clientY, dx: 0, active: false }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const s = drag.current
    if (!s) return
    const dx = e.clientX - s.startX
    const dy = e.clientY - s.startY
    if (!s.active) {
      // Only claim the gesture once it's clearly horizontal.
      if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) {
        s.active = true
        e.currentTarget.setPointerCapture(e.pointerId)
      } else {
        return
      }
    }
    s.dx = dx
    const front = cardEls.current[index]
    if (front) gsap.set(front, { x: dx, rotate: dx / 18 })
  }

  function onPointerUp() {
    const s = drag.current
    drag.current = null
    if (!s) return
    const front = cardEls.current[index]

    if (!s.active) {
      // A clean tap (no drag) on the card opens the full entry.
      setSelected(entries[index])
      return
    }

    const THRESHOLD = 90
    if (s.dx < -THRESHOLD && index < total - 1) {
      go(1) // throw left → next card
    } else if (s.dx > THRESHOLD && index > 0) {
      go(-1) // throw right → previous card
    } else if (front) {
      gsap.to(front, { x: 0, rotate: 0, duration: 0.45, ease: 'back.out(1.5)' })
    }
  }

  async function share() {
    const url = window.location.href
    const data = {
      title: 'Vriendenboekje',
      text: 'Vul mijn vriendenboekje in en word officieel vrienden.',
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

  return (
    <div className="space-y-6">
      <header className="text-center">
        <h1 data-reveal-title className="text-2xl font-semibold tracking-tight">
          Vriendenboekje
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Vul je vriendenboekje in en word officieel vrienden.
        </p>
      </header>

      {total === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 py-14 text-center">
          <BookHeart className="mx-auto mb-3 size-8 text-muted-foreground/60" />
          <p className="text-sm font-medium">Nog geen vriendenboekjes</p>
          <p className="mt-1 text-sm text-muted-foreground">Wees de eerste die er één invult.</p>
        </div>
      ) : (
        <>
          {/* Position indicator */}
          <div className="flex flex-col items-center gap-2">
            <span className="text-xs font-medium tabular-nums text-pink-100/80">
              {index + 1} / {total}
            </span>
            {total <= 12 && (
              <div className="flex items-center gap-1.5">
                {entries.map((e, i) => (
                  <span
                    key={e.id}
                    className={cn(
                      'h-1.5 rounded-full transition-all duration-300',
                      i === index ? 'w-5 bg-pink-300' : 'w-1.5 bg-white/25',
                    )}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Card stack */}
          <div
            ref={stackRef}
            className="relative mx-auto h-[72vh] max-h-[680px] w-full max-w-sm select-none"
          >
            {/* Subtle tap zones for non-swipe navigation */}
            {index > 0 && (
              <button
                type="button"
                aria-label="Vorige"
                onClick={() => go(-1)}
                className="absolute inset-y-0 left-0 z-50 flex w-12 items-center justify-start pl-1 text-white/40 active:text-white/80"
              >
                <ChevronLeft className="size-7" />
              </button>
            )}
            {index < total - 1 && (
              <button
                type="button"
                aria-label="Volgende"
                onClick={() => go(1)}
                className="absolute inset-y-0 right-0 z-50 flex w-12 items-center justify-end pr-1 text-white/40 active:text-white/80"
              >
                <ChevronRight className="size-7" />
              </button>
            )}

            {entries.map((entry, i) => {
              const h = hashStr(entry.id)
              const gradient = PLACEHOLDER_GRADIENTS[h % PLACEHOLDER_GRADIENTS.length]
              const isFront = i === index
              return (
                <div
                  key={entry.id}
                  ref={el => {
                    cardEls.current[i] = el
                  }}
                  onPointerDown={isFront ? onPointerDown : undefined}
                  onPointerMove={isFront ? onPointerMove : undefined}
                  onPointerUp={isFront ? onPointerUp : undefined}
                  onPointerCancel={isFront ? onPointerUp : undefined}
                  style={{ transformOrigin: 'top center', touchAction: 'pan-y' }}
                  className="absolute inset-0 will-change-transform"
                >
                  <div className="glass-panel flex h-full w-full flex-col overflow-hidden rounded-[2rem] shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)]">
                    {/* Photo — top 60% */}
                    <div className="relative h-[60%] w-full overflow-hidden">
                      {entry.foto_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={entry.foto_url}
                          alt={entry.naam}
                          draggable={false}
                          className="size-full object-cover"
                        />
                      ) : (
                        <div
                          className={cn(
                            'grid size-full place-items-center bg-gradient-to-br',
                            gradient,
                          )}
                        >
                          <span className="text-7xl font-bold tracking-tight text-white/90">
                            {initialsOf(entry.naam)}
                          </span>
                        </div>
                      )}
                      {/* soft fade into the text area */}
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/30 to-transparent" />
                    </div>

                    {/* Details — bottom 40% */}
                    <div className="flex h-[40%] flex-col justify-between p-5">
                      <div>
                        <p className="text-3xl font-bold leading-tight tracking-tight">
                          {entry.naam}
                        </p>
                        {entry.dj_naam && (
                          <p className="mt-1.5 flex items-center gap-1.5 text-base font-medium text-pink-200/90">
                            <Headphones className="size-4 shrink-0" />
                            {entry.dj_naam}
                          </p>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => setSelected(entry)}
                        className="inline-flex items-center gap-1 self-start text-sm font-medium text-white/70 active:text-white"
                      >
                        Lees meer
                        <ChevronRight className="size-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Actions — the stack is the hero, so these sit quietly below it */}
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => setWriting(true)}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-pink-900/30 transition-transform active:scale-[0.97]"
        >
          <PenLine className="size-4" />
          Schrijf jouw vriendenboekje
        </button>
        <button
          type="button"
          onClick={share}
          aria-label="Deel vriendenboekje"
          className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-3 text-sm font-medium backdrop-blur-md ring-1 ring-white/15 transition-transform active:scale-[0.97]"
        >
          {copied ? <Check className="size-4 text-pink-200" /> : <Share2 className="size-4" />}
          {copied ? 'Gekopieerd' : 'Deel'}
        </button>
      </div>

      {selected && <Detail entry={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function Detail({ entry, onClose }: { entry: Vriendenboekje; onClose: () => void }) {
  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-[120] overflow-y-auto bg-background/95 backdrop-blur-xl duration-300 animate-in fade-in-0 slide-in-from-bottom-6">
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
          className="mb-5 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-sm font-medium backdrop-blur-md transition-transform active:scale-95"
        >
          <ArrowLeft className="size-4" />
          Terug
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
          {entry.dj_naam && <p className="text-base text-pink-200">🎧 {entry.dj_naam}</p>}
          <p className="mt-1 text-xs text-muted-foreground">Ingevuld op {formatDate(entry.created_at)}</p>
        </div>

        <div className="mt-6 space-y-3.5 rounded-2xl bg-white/[0.04] p-4 text-sm backdrop-blur-md ring-1 ring-white/10">
          <Row label="Hoe we elkaar ontmoetten" value={entry.ontmoet} />
          <Row label="Front / back / bar" value={DANCEFLOOR_LABEL[entry.dancefloor]} />
          <Row label="Naar huis" value={NAAR_HUIS_LABEL[entry.naar_huis]} />
          <Row
            label="Dansen (zelf vs. denkt)"
            value={`${entry.dans_zelf}/10 · denkt ${entry.dans_denkt}/10`}
          />
          <Row label="Eerste indruk van mij" value={entry.eerste_indruk} />
          <Row label="Meest beschamende festivalmoment" value={entry.beschamend} />
          <Row label="Favoriete seksstandje" value={entry.seksstandje} />
          <Row label="Laatste Google" value={entry.laatste_google} />
          <Row label="'Ja' zeggen op iets stoms" value={entry.ja_zeggen} />

          <StellingRow
            label="De afterparty is altijd beter dan het festival zelf"
            value={entry.stelling_afterparty}
            toelichting={entry.stelling_afterparty_toelichting}
          />
          <StellingRow
            label="Weleens iemand gekust van wie de naam onbekend was"
            value={entry.stelling_gekust}
            toelichting={entry.stelling_gekust_toelichting}
          />
          <StellingRow
            label="Kent mensen beter na één festivaldag"
            value={entry.stelling_festivaldag}
            toelichting={entry.stelling_festivaldag_toelichting}
          />
          <StellingRow
            label="Weet niet meer hoe hier beland"
            value={entry.stelling_beland}
            toelichting={entry.stelling_beland_toelichting}
          />

          <Row label="Onthoud dit over mij" value={entry.afsluiting} />
        </div>
      </div>
    </div>,
    document.body,
  )
}

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 whitespace-pre-wrap">{value}</p>
    </div>
  )
}

function StellingRow({
  label,
  value,
  toelichting,
}: {
  label: string
  value: boolean | null
  toelichting: string | null
}) {
  if (value == null) return null
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5">
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-xs font-semibold',
            value ? 'bg-pink-500/20 text-pink-200' : 'bg-white/10 text-muted-foreground',
          )}
        >
          {value ? 'Eens' : 'Oneens'}
        </span>
        {toelichting && <span className="ml-2 text-foreground">{toelichting}</span>}
      </p>
    </div>
  )
}
