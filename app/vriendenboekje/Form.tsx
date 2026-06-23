'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ArrowRight, ImagePlus, Loader2, X } from 'lucide-react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'

import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { submitVriendenboekje } from '@/lib/vriendenboekje'
import type { Dancefloor, NaarHuis, VriendenboekjeInput } from '@/lib/vriendenboekje-types'
import { DANCEFLOOR_LABEL, NAAR_HUIS_LABEL } from '@/lib/vriendenboekje-types'
import { TextField } from './fields'
import { StickFigures } from './StickFigures'

const TOTAL = 18 // number of steps (questions)
const LAST = TOTAL - 1

// Pink/magenta glow for a previously selected option (matches --gradient-friends).
// Inline because `.glass-panel` is unlayered and would override Tailwind's
// ring/shadow/bg utilities otherwise.
const SELECTED_STYLE: React.CSSProperties = {
  backgroundColor: 'rgba(236, 72, 153, 0.16)',
  boxShadow: '0 0 0 2px #f472b6, 0 0 22px -1px rgba(236, 72, 153, 0.85)',
}

// Steps that show a full reaction overlay card (with GIF) instead of the small
// inline reaction text. POC: only naam (0) and dj-naam (1) for now.
const OVERLAY_REACTIONS: Record<number, { gif: string; text: string }> = {
  0: { gif: '/gifs/naam.gif', text: 'Klinkt als iemand die tot 6 uur blijft' },
  1: { gif: '/gifs/dj.gif', text: 'Ik ben je eerste fan' },
}

const CONFETTI_COLORS = ['#ec4899', '#f43f5e', '#a78bfa', '#22d3ee', '#fb923c', '#ffffff']
const GENERIC_REACTIONS = [
  'Leuk!',
  'Mooi 🙌',
  'Haha top',
  'Oké, interessant…',
  'Genoteerd ✍️',
  'Echt waar?',
  'Daar hou ik van',
  'Nice',
]

type Piece = { id: number; dx: number; dy: number; dr: number; color: string }

// Local form state: text fields are always strings while editing (converted to
// null at submit), and the enum choices start unselected.
type FormState = {
  naam: string
  dj_naam: string
  ontmoet: string
  eerste_indruk: string
  beschamend: string
  seksstandje: string
  laatste_google: string
  ja_zeggen: string
  dancefloor: Dancefloor | null
  naar_huis: NaarHuis | null
  dans_zelf: number
  dans_denkt: number
  stelling_afterparty: boolean | null
  stelling_afterparty_toelichting: string
  stelling_gekust: boolean | null
  stelling_gekust_toelichting: string
  stelling_festivaldag: boolean | null
  stelling_festivaldag_toelichting: string
  stelling_beland: boolean | null
  stelling_beland_toelichting: string
  afsluiting: string
  telefoonnummer: string
}

const INITIAL: FormState = {
  naam: '',
  dj_naam: '',
  ontmoet: '',
  eerste_indruk: '',
  beschamend: '',
  seksstandje: '',
  laatste_google: '',
  ja_zeggen: '',
  dancefloor: null,
  naar_huis: null,
  dans_zelf: 5,
  dans_denkt: 5,
  stelling_afterparty: null,
  stelling_afterparty_toelichting: '',
  stelling_gekust: null,
  stelling_gekust_toelichting: '',
  stelling_festivaldag: null,
  stelling_festivaldag_toelichting: '',
  stelling_beland: null,
  stelling_beland_toelichting: '',
  afsluiting: '',
  telefoonnummer: '',
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

// A small, short-lived confetti burst (used for the per-tap bursts).
function smallBurst(): Piece[] {
  return Array.from({ length: 7 }, (_, i) => {
    const angle = (Math.PI * 2 * i) / 7 + Math.random() * 0.6
    const dist = 16 + Math.random() * 26
    return {
      id: i,
      dx: Math.cos(angle) * dist,
      dy: Math.sin(angle) * dist - 6,
      dr: Math.random() * 240 - 120,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    }
  })
}

// Pure multiple-choice steps advance on tap; sliders/photo use a standalone
// arrow; everything else has the arrow inside its text field.
function advanceMode(step: number): 'auto' | 'button' | 'input' {
  if (step === 3 || step === 4) return 'auto'
  if (step === 5 || step === 16) return 'button'
  return 'input'
}

async function uploadPhoto(file: File): Promise<string | null> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('vriendenboekje').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  })
  if (error) return null
  return supabase.storage.from('vriendenboekje').getPublicUrl(path).data.publicUrl
}

export function Form({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState<'forward' | 'back'>('forward')
  const [form, setForm] = useState<FormState>(INITIAL)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)

  const [reaction, setReaction] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [fused, setFused] = useState(false)
  const [burst, setBurst] = useState<Piece[] | null>(null)
  const [overlay, setOverlay] = useState<{ gif: string; text: string } | null>(null)
  const [taps, setTaps] = useState<{ id: number; x: number; y: number; pieces: Piece[] }[]>([])
  const tapId = useRef(0)

  // Confetti on every tap anywhere, from the exact touch point. Capped + short
  // so rapid tapping is a playful storm without piling up DOM nodes.
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      const id = ++tapId.current
      setTaps(prev => {
        const next = [...prev, { id, x: e.clientX, y: e.clientY, pieces: smallBurst() }]
        return next.length > 14 ? next.slice(next.length - 14) : next
      })
      setTimeout(() => setTaps(prev => prev.filter(t => t.id !== id)), 560)
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [])

  const set = <K extends keyof FormState>(key: K, val: FormState[K]) =>
    setForm(f => ({ ...f, [key]: val }))

  const progress = useMemo(() => (fused ? 1 : step / TOTAL), [step, fused])

  function fireConfetti() {
    const pieces: Piece[] = Array.from({ length: 28 }, (_, i) => {
      const angle = (Math.PI * 2 * i) / 28 + Math.random() * 0.4
      const dist = 90 + Math.random() * 130
      return {
        id: i,
        dx: Math.cos(angle) * dist,
        dy: Math.sin(angle) * dist - 30,
        dr: Math.random() * 320 - 160,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      }
    })
    setBurst(pieces)
    setTimeout(() => setBurst(null), 1200)
  }

  function validate(s: number): string | null {
    if (s === 0 && !form.naam.trim()) return 'Vul je naam in.'
    if (s === 2 && !form.ontmoet.trim()) return 'Vertel hoe we elkaar ontmoet hebben.'
    if (s === 3 && !form.dancefloor) return 'Kies een plek.'
    if (s === 4 && !form.naar_huis) return 'Kies een optie.'
    if (s === 6 && !form.eerste_indruk.trim()) return 'Eén eerste indruk graag 🙂'
    return null
  }

  function reactionFor(s: number): string {
    switch (s) {
      case 1:
        return form.dj_naam.trim() ? 'Ik ben je eerste fan' : pick(GENERIC_REACTIONS)
      case 8:
        return pick(['Ooh echt?', 'Bold.'])
      case 11:
        return form.stelling_afterparty == null
          ? pick(GENERIC_REACTIONS)
          : form.stelling_afterparty
            ? 'Vertel meer!'
            : 'Sure….'
      case 12:
        return form.stelling_gekust == null
          ? pick(GENERIC_REACTIONS)
          : form.stelling_gekust
            ? 'Geen namen, wel herinneringen'
            : 'We kunnen nog vrienden zijn'
      case 13:
        return form.stelling_festivaldag == null
          ? pick(GENERIC_REACTIONS)
          : form.stelling_festivaldag
            ? 'Dit is waarom we hier zijn 🫶'
            : 'Dan moet je meer x nemen 🤪'
      case 14:
        return form.stelling_beland == null
          ? pick(GENERIC_REACTIONS)
          : form.stelling_beland
            ? 'Welkom bij de club'
            : 'Bewonderenswaardig'
      default:
        return pick(GENERIC_REACTIONS)
    }
  }

  function goNext() {
    setDir('forward')
    setStep(s => s + 1)
  }

  // Show the reaction, then slide to the next question (or submit). Steps with an
  // overlay reaction show a GIF card first; the rest show the small inline text.
  function advance() {
    if (step === LAST) {
      void submit()
      return
    }
    setBusy(true)
    if (OVERLAY_REACTIONS[step]) {
      setOverlay(OVERLAY_REACTIONS[step])
      return // ReactionOverlay calls dismissOverlay → goNext
    }
    setReaction(reactionFor(step))
    setTimeout(() => {
      setReaction(null)
      setBusy(false)
      goNext()
    }, 1100)
  }

  function dismissOverlay() {
    setOverlay(null)
    setBusy(false)
    goNext()
  }

  function next() {
    if (busy) return
    const err = validate(step)
    if (err) {
      setError(err)
      return
    }
    setError(null)
    advance()
  }

  // Multiple-choice: set the value and advance immediately.
  function choose<K extends keyof FormState>(key: K, val: FormState[K]) {
    if (busy) return
    set(key, val)
    setError(null)
    advance()
  }

  function back() {
    if (busy || step === 0) return
    setError(null)
    setDir('back')
    setStep(s => s - 1)
  }

  async function submit() {
    setBusy(true)
    setError(null)
    let foto_url: string | null = null
    if (photoFile) foto_url = await uploadPhoto(photoFile)

    const res = await submitVriendenboekje({
      ...form,
      dancefloor: form.dancefloor as Dancefloor,
      naar_huis: form.naar_huis as NaarHuis,
      foto_url,
    } as VriendenboekjeInput)

    if (!res.ok) {
      setError(res.error)
      setBusy(false)
      return
    }
    setFused(true)
    fireConfetti()
    setSubmitted(true)
    setBusy(false)
  }

  function onPhoto(file: File | null) {
    setPhotoFile(file)
    setPhotoPreview(prev => {
      if (prev) URL.revokeObjectURL(prev)
      return file ? URL.createObjectURL(file) : null
    })
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-6 py-10 text-center">
        <StickFigures progress={1} step={LAST} fused />
        <p className="text-2xl font-semibold tracking-tight">
          Jeeej we zijn nu officieel vriendjes! ❤️
        </p>
        <button
          type="button"
          onClick={onDone}
          className="glass-panel rounded-full bg-pink-500/20 px-6 py-3 text-sm font-semibold text-pink-100 transition-transform active:scale-95"
        >
          Terug naar overzicht
        </button>
        {burst && <Confetti pieces={burst} />}
        <TapConfetti taps={taps} />
      </div>
    )
  }

  const mode = advanceMode(step)

  return (
    <div className="flex flex-col gap-8">
      <StickFigures progress={progress} step={step} fused={fused} />

      {/* Sliding question area */}
      <div className="relative min-h-[18rem]">
        <div
          key={step}
          className={cn(
            'flex flex-col gap-5 duration-300 animate-in fade-in-0',
            dir === 'forward' ? 'slide-in-from-right-10' : 'slide-in-from-left-10',
          )}
        >
          {renderStep(step, form, set, { next, choose, busy }, { photoPreview, onPhoto })}
        </div>
      </div>

      {error && <p className="text-center text-sm text-destructive">{error}</p>}

      {/* Controls: back (left) · reaction (center) · standalone arrow only when needed */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={back}
          disabled={step === 0 || busy}
          aria-label="Vorige"
          className="grid size-11 place-items-center rounded-full bg-white/10 text-foreground transition-transform active:scale-90 disabled:opacity-30"
        >
          <ArrowLeft className="size-5" />
        </button>

        <div className="min-h-6 flex-1 text-center">
          {reaction && (
            <span className="inline-block text-base font-semibold text-pink-200 duration-200 animate-in fade-in-0 zoom-in-95">
              {reaction}
            </span>
          )}
        </div>

        {mode === 'button' ? (
          <button
            type="button"
            onClick={next}
            disabled={busy}
            aria-label="Volgende"
            className="grid size-11 place-items-center rounded-full bg-pink-500/25 text-pink-100 shadow-lg shadow-pink-900/20 transition-transform active:scale-90 disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-5 animate-spin" /> : <ArrowRight className="size-5" />}
          </button>
        ) : (
          <span className="size-11" />
        )}
      </div>

      {burst && <Confetti pieces={burst} />}
      <TapConfetti taps={taps} />

      {overlay && (
        <FullScreenReaction gif={overlay.gif} text={overlay.text} onDismiss={dismissOverlay} />
      )}
    </div>
  )
}

// ── Step renderer ─────────────────────────────────────────────────────────────

type SetFn = <K extends keyof FormState>(key: K, val: FormState[K]) => void
type Api = {
  next: () => void
  choose: <K extends keyof FormState>(key: K, val: FormState[K]) => void
  busy: boolean
}
type PhotoCtx = { photoPreview: string | null; onPhoto: (f: File | null) => void }

function renderStep(step: number, form: FormState, set: SetFn, api: Api, photo: PhotoCtx) {
  const submitIcon = step === LAST ? 'check' : 'next'

  switch (step) {
    case 0:
      return (
        <>
          <Question title="Wat is je naam?" />
          <TextField
            value={form.naam}
            onChange={v => set('naam', v)}
            placeholder="Je naam"
            autoFocus
            onSubmit={api.next}
            submitIcon={submitIcon}
            disabled={api.busy}
          />
        </>
      )
    case 1:
      return (
        <>
          <Question title="Geef jezelf een dj-naam" optional />
          <TextField
            value={form.dj_naam}
            onChange={v => set('dj_naam', v)}
            placeholder="DJ …"
            autoFocus
            onSubmit={api.next}
            submitIcon={submitIcon}
            disabled={api.busy}
          />
        </>
      )
    case 2:
      return (
        <>
          <Question title="Hoe hebben we elkaar ontmoet?" />
          <TextField
            value={form.ontmoet}
            onChange={v => set('ontmoet', v)}
            placeholder="Vertel…"
            multiline
            autoFocus
            onSubmit={api.next}
            submitIcon={submitIcon}
            disabled={api.busy}
          />
        </>
      )
    case 3:
      return (
        <>
          <Question title="Front of back of dancefloor?" />
          <Choices
            value={form.dancefloor}
            disabled={api.busy}
            onChange={v => api.choose('dancefloor', v)}
            options={(Object.keys(DANCEFLOOR_LABEL) as Dancefloor[]).map(k => ({
              value: k,
              label: DANCEFLOOR_LABEL[k],
            }))}
          />
        </>
      )
    case 4:
      return (
        <>
          <Question title="Hoe laat ga jij naar huis?" />
          <Choices
            value={form.naar_huis}
            disabled={api.busy}
            onChange={v => api.choose('naar_huis', v)}
            options={(Object.keys(NAAR_HUIS_LABEL) as NaarHuis[]).map(k => ({
              value: k,
              label: NAAR_HUIS_LABEL[k],
            }))}
          />
        </>
      )
    case 5:
      return (
        <>
          <Question title="Op een schaal van 1-10, hoe goed kan jij dansen?" />
          <Slider label="Hoe goed ben je" value={form.dans_zelf} onChange={v => set('dans_zelf', v)} />
          <Slider
            label="Hoe goed denk je dat je bent"
            value={form.dans_denkt}
            onChange={v => set('dans_denkt', v)}
          />
        </>
      )
    case 6:
      return (
        <>
          <Question title="Wat was je eerste indruk van mij?" />
          <TextField
            value={form.eerste_indruk}
            onChange={v => set('eerste_indruk', v)}
            placeholder="Eerlijk mag…"
            multiline
            autoFocus
            onSubmit={api.next}
            submitIcon={submitIcon}
            disabled={api.busy}
          />
        </>
      )
    case 7:
      return (
        <>
          <Question
            title="Wat is het meest beschamende dat je ooit op een festival hebt gedaan?"
            optional
          />
          <TextField
            value={form.beschamend}
            onChange={v => set('beschamend', v)}
            placeholder="Je geheim is veilig… ofniet"
            multiline
            autoFocus
            onSubmit={api.next}
            submitIcon={submitIcon}
            disabled={api.busy}
          />
        </>
      )
    case 8:
      return (
        <>
          <Question title="Wat is je favoriete seksstandje?" optional />
          <TextField
            value={form.seksstandje}
            onChange={v => set('seksstandje', v)}
            placeholder="…"
            autoFocus
            onSubmit={api.next}
            submitIcon={submitIcon}
            disabled={api.busy}
          />
        </>
      )
    case 9:
      return (
        <>
          <Question title="Wat is het laatste dat je googelde?" subtitle="(wees eerlijk)" optional />
          <TextField
            value={form.laatste_google}
            onChange={v => set('laatste_google', v)}
            placeholder="Je laatste zoekopdracht"
            autoFocus
            onSubmit={api.next}
            submitIcon={submitIcon}
            disabled={api.busy}
          />
        </>
      )
    case 10:
      return (
        <>
          <Question title="Hoe lang duurt het voordat jij 'ja' zegt op iets stoms?" optional />
          <TextField
            value={form.ja_zeggen}
            onChange={v => set('ja_zeggen', v)}
            placeholder="3 seconden? een biertje?"
            autoFocus
            onSubmit={api.next}
            submitIcon={submitIcon}
            disabled={api.busy}
          />
        </>
      )
    case 11:
      return (
        <Stelling
          title="De afterparty is altijd beter dan het festival zelf"
          value={form.stelling_afterparty}
          onChange={v => set('stelling_afterparty', v)}
          toelichting={form.stelling_afterparty_toelichting}
          onToelichting={v => set('stelling_afterparty_toelichting', v)}
          api={api}
        />
      )
    case 12:
      return (
        <Stelling
          title="Ik heb weleens iemand gekust van wie ik de naam niet wist"
          value={form.stelling_gekust}
          onChange={v => set('stelling_gekust', v)}
          toelichting={form.stelling_gekust_toelichting}
          onToelichting={v => set('stelling_gekust_toelichting', v)}
          api={api}
        />
      )
    case 13:
      return (
        <Stelling
          title="Ik ken mensen beter na één festivaldag dan na een jaar normaal contact"
          value={form.stelling_festivaldag}
          onChange={v => set('stelling_festivaldag', v)}
          toelichting={form.stelling_festivaldag_toelichting}
          onToelichting={v => set('stelling_festivaldag_toelichting', v)}
          api={api}
        />
      )
    case 14:
      return (
        <Stelling
          title="Ik herinner me niet meer precies hoe ik hier beland ben"
          value={form.stelling_beland}
          onChange={v => set('stelling_beland', v)}
          toelichting={form.stelling_beland_toelichting}
          onToelichting={v => set('stelling_beland_toelichting', v)}
          api={api}
        />
      )
    case 15:
      return (
        <>
          <Question title="Als je één ding wilt dat ik over jou onthoud, wat is het?" optional />
          <TextField
            value={form.afsluiting}
            onChange={v => set('afsluiting', v)}
            placeholder="…"
            multiline
            autoFocus
            onSubmit={api.next}
            submitIcon={submitIcon}
            disabled={api.busy}
          />
        </>
      )
    case 16:
      return (
        <>
          <Question title="Foto uploaden" optional />
          <PhotoStep preview={photo.photoPreview} onPhoto={photo.onPhoto} />
        </>
      )
    case 17:
      return (
        <>
          <Question title="Telefoonnummer" optional />
          <TextField
            value={form.telefoonnummer}
            onChange={v => set('telefoonnummer', v)}
            placeholder="+31 …"
            type="tel"
            inputMode="tel"
            autoFocus
            onSubmit={api.next}
            submitIcon={submitIcon}
            disabled={api.busy}
          />
          <p className="text-sm text-muted-foreground">
            If you leave your number, I&apos;ll fill in this book about you too and share it with
            you via app
          </p>
        </>
      )
    default:
      return null
  }
}

// ── Small building blocks ─────────────────────────────────────────────────────

function Question({
  title,
  subtitle,
  optional,
}: {
  title: string
  subtitle?: string
  optional?: boolean
}) {
  return (
    <div>
      <h2 className="text-xl font-semibold tracking-tight">
        {title}
        {subtitle && (
          <span className="ml-1 text-base font-normal text-muted-foreground">{subtitle}</span>
        )}
      </h2>
      {optional && (
        <p className="mt-1 text-xs text-muted-foreground">Optioneel — je mag dit overslaan</p>
      )}
    </div>
  )
}

function Choices<T extends string>({
  value,
  onChange,
  options,
  disabled,
}: {
  value: T | null
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  disabled?: boolean
}) {
  return (
    <div className="flex flex-col gap-3">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(o.value)}
          style={value === o.value ? SELECTED_STYLE : undefined}
          className="glass-panel rounded-2xl px-5 py-4 text-left text-base font-medium transition-transform active:scale-95 disabled:opacity-60"
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Slider({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="glass-panel rounded-2xl p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-lg font-bold text-pink-200">{value}</span>
      </div>
      <input
        type="range"
        min={1}
        max={10}
        step={1}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-pink-500"
      />
    </div>
  )
}

function Stelling({
  title,
  value,
  onChange,
  toelichting,
  onToelichting,
  api,
}: {
  title: string
  value: boolean | null
  onChange: (v: boolean) => void
  toelichting: string
  onToelichting: (v: string) => void
  api: Api
}) {
  return (
    <>
      <Question title={title} />
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => onChange(true)}
          style={value === true ? SELECTED_STYLE : undefined}
          className="glass-panel flex-1 rounded-2xl py-3 text-base font-semibold transition-transform active:scale-95"
        >
          Eens
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          style={value === false ? SELECTED_STYLE : undefined}
          className="glass-panel flex-1 rounded-2xl py-3 text-base font-semibold transition-transform active:scale-95"
        >
          Oneens
        </button>
      </div>
      <TextField
        value={toelichting}
        onChange={onToelichting}
        placeholder="Toelichting (optioneel)"
        onSubmit={api.next}
        submitIcon="next"
        disabled={api.busy}
      />
    </>
  )
}

function PhotoStep({
  preview,
  onPhoto,
}: {
  preview: string | null
  onPhoto: (f: File | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="flex flex-col items-center gap-3">
      {preview ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Voorbeeld" className="size-44 rounded-2xl object-cover shadow-lg" />
          <button
            type="button"
            onClick={() => onPhoto(null)}
            aria-label="Verwijder foto"
            className="absolute -right-2 -top-2 grid size-7 place-items-center rounded-full bg-black/70 text-white"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="glass-panel grid size-44 place-items-center rounded-2xl text-muted-foreground transition-transform active:scale-95"
        >
          <span className="flex flex-col items-center gap-2">
            <ImagePlus className="size-8" />
            <span className="text-sm">Kies een foto</span>
          </span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => onPhoto(e.target.files?.[0] ?? null)}
      />
    </div>
  )
}

const REACTION_FADE = 'linear-gradient(to bottom, black 0%, black 55%, transparent 92%)'

/** Full-screen reaction step: the GIF + text take over the whole screen (no
 *  navbar, no card). Tap anywhere or wait ~2.5s to advance. */
function FullScreenReaction({
  gif,
  text,
  onDismiss,
}: {
  gif: string
  text: string
  onDismiss: () => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const doneRef = useRef(false)

  const { contextSafe } = useGSAP(
    () => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        gsap.set(rootRef.current, { opacity: 1 })
        return
      }
      const tl = gsap.timeline()
      tl.fromTo(rootRef.current, { opacity: 0 }, { opacity: 1, duration: 0.22, ease: 'power2.out' })
      tl.fromTo(
        rootRef.current?.querySelector('[data-react-gif]') ?? null,
        { scale: 0.92, y: 16 },
        { scale: 1, y: 0, duration: 0.4, ease: 'back.out(1.5)' },
        0,
      )
    },
    { scope: rootRef },
  )

  const dismiss = contextSafe(() => {
    if (doneRef.current) return
    doneRef.current = true
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    gsap.to(rootRef.current, {
      opacity: 0,
      duration: reduce ? 0 : 0.2,
      ease: 'power2.in',
      onComplete: onDismiss,
    })
  })

  useEffect(() => {
    const t = setTimeout(dismiss, 2500)
    return () => clearTimeout(t)
  }, [dismiss])

  if (typeof document === 'undefined') return null
  return createPortal(
    <div
      ref={rootRef}
      onClick={dismiss}
      className="fixed inset-0 z-[130] flex flex-col items-center justify-center gap-7 overflow-hidden bg-background p-6"
    >
      {/* Pink mesh accent on the dark background (no card / border). */}
      <div
        aria-hidden
        className="vb-breathe pointer-events-none absolute inset-x-0 top-0 h-[75vh]"
        style={{
          backgroundImage: 'var(--gradient-friends)',
          maskImage: REACTION_FADE,
          WebkitMaskImage: REACTION_FADE,
        }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        data-react-gif
        src={gif}
        alt=""
        className="relative z-10 max-h-[60vh] w-auto max-w-full object-contain"
      />
      <p className="relative z-10 max-w-md text-center text-3xl font-bold leading-tight text-white">
        {text}
      </p>
    </div>,
    document.body,
  )
}

function TapConfetti({ taps }: { taps: { id: number; x: number; y: number; pieces: Piece[] }[] }) {
  if (typeof document === 'undefined' || taps.length === 0) return null
  return createPortal(
    <>
      {taps.map(t => (
        <div
          key={t.id}
          aria-hidden
          className="pointer-events-none fixed z-[140]"
          style={{ left: t.x, top: t.y }}
        >
          {t.pieces.map(p => (
            <span
              key={p.id}
              className="confetti-piece-sm"
              style={
                {
                  backgroundColor: p.color,
                  '--dx': `${p.dx}px`,
                  '--dy': `${p.dy}px`,
                  '--dr': `${p.dr}deg`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      ))}
    </>,
    document.body,
  )
}

function Confetti({ pieces }: { pieces: Piece[] }) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <div
      aria-hidden
      className="pointer-events-none fixed z-[120]"
      style={{ left: '50%', top: '38%' }}
    >
      {pieces.map(p => (
        <span
          key={p.id}
          className="confetti-piece"
          style={
            {
              backgroundColor: p.color,
              '--dx': `${p.dx}px`,
              '--dy': `${p.dy}px`,
              '--dr': `${p.dr}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>,
    document.body,
  )
}
