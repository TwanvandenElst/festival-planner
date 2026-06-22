'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BookHeart, ChevronDown, ChevronRight, PenLine } from 'lucide-react'

import { cn } from '@/lib/utils'
import {
  DANCEFLOOR_LABEL,
  NAAR_HUIS_LABEL,
  type Vriendenboekje,
} from '@/lib/vriendenboekje-types'
import { Form } from './Form'

export function VriendenboekjeClient({ entries }: { entries: Vriendenboekje[] }) {
  const router = useRouter()
  const [writing, setWriting] = useState(false)

  if (writing) {
    return (
      <Form
        onDone={() => {
          setWriting(false)
          router.refresh() // pull in the freshly inserted entry
        }}
      />
    )
  }

  return (
    <div className="space-y-6">
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
        <ul className="space-y-3">
          {entries.map(e => (
            <EntryCard key={e.id} entry={e} />
          ))}
        </ul>
      )}
    </div>
  )
}

function EntryCard({ entry }: { entry: Vriendenboekje }) {
  const [open, setOpen] = useState(false)

  return (
    <li className="glass-panel overflow-hidden rounded-2xl">
      <div className="flex items-center gap-4 p-4">
        {entry.foto_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={entry.foto_url}
            alt={entry.naam}
            className="size-14 shrink-0 rounded-full object-cover ring-2 ring-pink-400/40"
          />
        ) : (
          <span className="grid size-14 shrink-0 place-items-center rounded-full bg-gradient-to-br from-pink-400 to-rose-500 text-xl font-bold text-white">
            {entry.naam.trim().charAt(0).toUpperCase() || '?'}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold">{entry.naam}</p>
          {entry.dj_naam && (
            <p className="truncate text-sm text-pink-200/90">🎧 {entry.dj_naam}</p>
          )}
        </div>

        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          className="flex shrink-0 items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-sm font-medium transition-transform active:scale-95"
        >
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          Lees meer
        </button>
      </div>

      {open && (
        <div className="space-y-3 border-t border-white/10 px-4 pb-4 pt-3 text-sm duration-200 animate-in fade-in-0">
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
      )}
    </li>
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
