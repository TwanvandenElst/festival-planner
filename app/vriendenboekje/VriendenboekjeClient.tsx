'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import { ArrowLeft, BookHeart, PenLine } from 'lucide-react'

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

function initialOf(name: string) {
  return name.trim().charAt(0).toUpperCase() || '?'
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

const CAVEAT = { fontFamily: 'var(--font-caveat)' } as const

export function VriendenboekjeClient({ entries }: { entries: Vriendenboekje[] }) {
  const router = useRouter()
  const [writing, setWriting] = useState(false)
  const [selected, setSelected] = useState<Vriendenboekje | null>(null)

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

  return (
    <div className="space-y-7">
      <button
        type="button"
        onClick={() => setWriting(true)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-pink-500 to-rose-500 px-6 py-4 text-base font-semibold text-white shadow-lg shadow-pink-900/30 transition-transform active:scale-[0.98]"
      >
        <PenLine className="size-5" />
        Schrijf jouw vriendenboekje
      </button>

      {entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 py-14 text-center">
          <BookHeart className="mx-auto mb-3 size-8 text-muted-foreground/60" />
          <p className="text-sm font-medium">Nog geen vriendenboekjes</p>
          <p className="mt-1 text-sm text-muted-foreground">Wees de eerste die er één invult.</p>
        </div>
      ) : (
        /* Loose scattered pile — two masonry columns of rotated Polaroids. */
        <div className="columns-2 gap-2 [&>*]:mb-1">
          {entries.map(e => (
            <Polaroid key={e.id} entry={e} onOpen={() => setSelected(e)} />
          ))}
        </div>
      )}

      {selected && <Detail entry={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function Polaroid({ entry, onOpen }: { entry: Vriendenboekje; onOpen: () => void }) {
  const h = hashStr(entry.id)
  const rot = (h % 17) - 8 // -8..8 deg
  const tx = ((h >> 4) % 13) - 6 // -6..6 px
  const overlap = -((h >> 8) % 12) - 2 // -2..-13 px (cards stack into each other)
  const aspects = ['aspect-[4/5]', 'aspect-square', 'aspect-[5/4]']
  const aspect = aspects[(h >> 6) % aspects.length]
  const gradient = PLACEHOLDER_GRADIENTS[h % PLACEHOLDER_GRADIENTS.length]

  return (
    <div data-reveal-card className="break-inside-avoid" style={{ marginBottom: overlap }}>
      <button
        type="button"
        onClick={onOpen}
        style={{ rotate: `${rot}deg`, translate: `${tx}px` }}
        className="relative z-0 block w-full rounded-md bg-[#fbfaf4] p-2 pb-7 shadow-[0_8px_22px_-8px_rgba(0,0,0,0.65)] transition-all duration-150 active:z-30 active:scale-[1.06] active:shadow-[0_18px_40px_-10px_rgba(0,0,0,0.75)]"
      >
        <div className={cn('overflow-hidden rounded-sm bg-neutral-200', aspect)}>
          {entry.foto_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={entry.foto_url} alt={entry.naam} className="size-full object-cover" />
          ) : (
            <div className={cn('grid size-full place-items-center bg-gradient-to-br', gradient)}>
              <span className="text-5xl font-bold text-white/90">{initialOf(entry.naam)}</span>
            </div>
          )}
        </div>
        <p
          style={CAVEAT}
          className="mt-1.5 truncate px-1 text-center text-2xl leading-tight text-neutral-800"
        >
          {entry.naam}
        </p>
      </button>
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
                <span className="text-7xl font-bold text-white/90">{initialOf(entry.naam)}</span>
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
