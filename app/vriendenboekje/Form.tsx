'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ArrowRight, ImagePlus, Loader2, X } from 'lucide-react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'

import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { submitVriendenboekje } from '@/lib/vriendenboekje'
import type { VriendenboekjeInput } from '@/lib/vriendenboekje-types'
import { TextField } from './fields'
import { StickFigures } from './StickFigures'

const TOTAL = 16 // number of steps (questions)
const LAST = TOTAL - 1

// Pink/magenta glow for a previously selected option (matches --gradient-friends).
// Inline because `.glass-panel` is unlayered and would override Tailwind's
// ring/shadow/bg utilities otherwise.
const SELECTED_STYLE: React.CSSProperties = {
  backgroundColor: 'rgba(236, 72, 153, 0.16)',
  boxShadow: '0 0 0 2px #f472b6, 0 0 22px -1px rgba(236, 72, 153, 0.85)',
}

// Per-step reaction: a full-screen card with a looping .webm (when the file
// exists) plus a line of text. `video` is optional — steps without one (and any
// missing .webm at runtime) fall back to a text-only card. Stelling reactions
// depend on the answer, so they're resolved per-render in `reactionFor`.
type Reaction = { video?: string; text?: string }

const CONFETTI_COLORS = ['#ec4899', '#f43f5e', '#a78bfa', '#22d3ee', '#fb923c', '#ffffff']
const GENERIC_REACTIONS = [
  'Nice!',
  'Beautiful 🙌',
  'Haha great',
  'Okay, interesting…',
  'Noted ✍️',
  'Really?',
  'I love that',
  'Nice',
]

type Piece = { id: number; dx: number; dy: number; dr: number; color: string }

// Local form state: text fields are always strings while editing (converted to
// null at submit), and the enum choices start unselected.
type FormState = {
  naam: string
  dj_naam: string
  snack: string
  eerste_indruk: string
  guilty_pleasure: string
  bijnaam: string
  jeugdheld: string
  dilemma: string
  dilemma_toelichting: string
  stopwoordje: string
  meezingen: string
  seksstandje: string
  onthoud_mij: string
  stelling_afterparty: boolean | null
  stelling_afterparty_toelichting: string
  stelling_festivaldag: boolean | null
  stelling_festivaldag_toelichting: string
  telefoonnummer: string
}

const INITIAL: FormState = {
  naam: '',
  dj_naam: '',
  snack: '',
  eerste_indruk: '',
  guilty_pleasure: '',
  bijnaam: '',
  jeugdheld: '',
  dilemma: '',
  dilemma_toelichting: '',
  stopwoordje: '',
  meezingen: '',
  seksstandje: '',
  onthoud_mij: '',
  stelling_afterparty: null,
  stelling_afterparty_toelichting: '',
  stelling_festivaldag: null,
  stelling_festivaldag_toelichting: '',
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

// The photo step uses a standalone arrow; every other step has its arrow inside
// the text field (the stelling toelichting field carries the arrow too).
function advanceMode(step: number): 'button' | 'input' {
  if (step === 14) return 'button' // photo
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

export function Form({
  onDone,
  hostId,
  doneLabel = 'Back to overview',
}: {
  onDone: () => void
  hostId: string
  doneLabel?: string
}) {
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState<'forward' | 'back'>('forward')
  const [form, setForm] = useState<FormState>(INITIAL)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [fused, setFused] = useState(false)
  const [burst, setBurst] = useState<Piece[] | null>(null)
  const [overlay, setOverlay] = useState<Reaction | null>(null)
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

  // Open text questions are required; foto (14) and telefoonnummer (15) stay
  // optional, and the stellingen (4, 7) are gated by their eens/oneens toggle.
  const REQUIRED_FIELDS: Partial<Record<number, keyof FormState>> = {
    0: 'naam',
    1: 'dj_naam',
    2: 'snack',
    3: 'eerste_indruk',
    5: 'guilty_pleasure',
    6: 'bijnaam',
    8: 'jeugdheld',
    9: 'dilemma',
    10: 'stopwoordje',
    11: 'meezingen',
    12: 'seksstandje',
    13: 'onthoud_mij',
  }

  function validate(s: number): string | null {
    if (s === 0 && !form.naam.trim()) return 'Please enter your name.'
    if (s === 4 && form.stelling_afterparty == null) return 'Choose agree or disagree.'
    if (s === 7 && form.stelling_festivaldag == null) return 'Choose agree or disagree.'
    if (s === 14 && !photoFile) return 'Upload a photo to continue.'
    const field = REQUIRED_FIELDS[s]
    if (field && !(form[field] as string).trim()) return 'Fill this in to continue.'
    return null
  }

  // The per-step reaction card. Video steps point at a .webm in /public/gifs;
  // stellingen and any step without a video resolve to a text-only card.
  function reactionFor(s: number): Reaction | null {
    switch (s) {
      case 0:
        return { video: '/gifs/naam.webm' } // naam — gif only, no text
      case 1:
        return { video: '/gifs/dj.webm', text: 'I\'m your first fan!' }
      case 2:
        return { video: '/gifs/snack.webm', text: 'I\'d snack on you 😏' }
      case 3:
        return { video: '/gifs/eerste-indruk.webm', text: 'I thought exactly the same' }
      case 4:
        return {
          text:
            form.stelling_afterparty == null
              ? pick(GENERIC_REACTIONS)
              : form.stelling_afterparty
                ? 'Nice of you to invite me!'
                : 'Then you haven\'t seen mine yet 😈',
        }
      case 5:
        return { video: '/gifs/guilty.webm', text: 'We\'re going to be friends' }
      case 6:
        return { video: '/gifs/bijnaam.webm', text: 'I\'m going to call you that too' }
      case 7:
        return {
          text:
            form.stelling_festivaldag == null
              ? pick(GENERIC_REACTIONS)
              : form.stelling_festivaldag
                ? 'This is why we\'re here'
                : 'Then you need to take more x 🤪',
        }
      case 8:
        return { video: '/gifs/jeugdheld.webm', text: 'Good taste' }
      case 9:
        return { video: '/gifs/dilemma.webm', text: 'Yeah?' }
      case 10:
        return { video: '/gifs/stopwoordje.webm', text: 'Now this is all I\'m going to hear' }
      case 11:
        return { video: '/gifs/meezingen.webm', text: 'The mic is yours 🎤' }
      case 12:
        return { video: '/gifs/seksstandje.webm', text: 'Ooh really?' }
      case 13:
        return { video: '/gifs/onthoud.webm', text: 'I\'ll never forget this' }
      default:
        return null // photo (14) advances straight through; 15 (last) submits
    }
  }

  function goNext() {
    setDir('forward')
    setStep(s => s + 1)
  }

  // Show the full-screen reaction card, then slide on. Steps without a reaction
  // advance immediately; the last step submits.
  function advance() {
    if (step === LAST) {
      void submit()
      return
    }
    const r = reactionFor(step)
    if (r) {
      setBusy(true)
      setOverlay(r) // FullScreenReaction calls dismissOverlay → goNext
      return
    }
    goNext()
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

    const res = await submitVriendenboekje({ ...form, foto_url } as VriendenboekjeInput, hostId)

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
          Yaaay we&apos;re officially friends now! ❤️
        </p>
        <button
          type="button"
          onClick={onDone}
          className="glass-panel rounded-full bg-pink-500/20 px-6 py-3 text-sm font-semibold text-pink-700 dark:text-pink-100 transition-transform active:scale-95"
        >
          {doneLabel}
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
          {renderStep(step, form, set, { next, busy }, { photoPreview, onPhoto })}
        </div>
      </div>

      {error && <p className="text-center text-sm text-destructive">{error}</p>}

      {/* Controls: back (left) · spacer (center) · standalone arrow only when needed */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={back}
          disabled={step === 0 || busy}
          aria-label="Previous"
          className="grid size-11 place-items-center rounded-full bg-black/[0.06] dark:bg-white/10 text-foreground transition-transform active:scale-90 disabled:opacity-30"
        >
          <ArrowLeft className="size-5" />
        </button>

        <div className="min-h-6 flex-1" />

        {mode === 'button' ? (
          <button
            type="button"
            onClick={next}
            disabled={busy || !photoFile}
            aria-label="Next"
            className="grid size-11 place-items-center rounded-full bg-pink-500/25 text-pink-700 dark:text-pink-100 shadow-lg shadow-pink-900/20 transition-transform active:scale-90 disabled:opacity-60"
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
        <FullScreenReaction video={overlay.video} text={overlay.text} onDismiss={dismissOverlay} />
      )}
    </div>
  )
}

// ── Step renderer ─────────────────────────────────────────────────────────────

type SetFn = <K extends keyof FormState>(key: K, val: FormState[K]) => void
type Api = {
  next: () => void
  busy: boolean
}
type PhotoCtx = { photoPreview: string | null; onPhoto: (f: File | null) => void }

function renderStep(step: number, form: FormState, set: SetFn, api: Api, photo: PhotoCtx) {
  const submitIcon = step === LAST ? 'check' : 'next'

  switch (step) {
    case 0:
      return (
        <>
          <Question title="What's your name?" />
          <TextField
            value={form.naam}
            onChange={v => set('naam', v)}
            placeholder="Your name"
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
          <Question title="Give yourself a DJ name" />
          <TextField
            value={form.dj_naam}
            onChange={v => set('dj_naam', v)}
            placeholder="DJ …"
            autoFocus
            onSubmit={api.next}
            submitIcon={submitIcon}
            disabled={api.busy || !form.dj_naam.trim()}
          />
        </>
      )
    case 2:
      return (
        <>
          <Question title="Describe yourself as a snack" />
          <TextField
            value={form.snack}
            onChange={v => set('snack', v)}
            placeholder="Frikandel, Eierbal or Krakeling..."
            autoFocus
            onSubmit={api.next}
            submitIcon={submitIcon}
            disabled={api.busy || !form.snack.trim()}
          />
        </>
      )
    case 3:
      return (
        <>
          <Question title="What was/is your first impression of me?" />
          <TextField
            value={form.eerste_indruk}
            onChange={v => set('eerste_indruk', v)}
            placeholder="You can be honest..."
            multiline
            autoFocus
            onSubmit={api.next}
            submitIcon={submitIcon}
            disabled={api.busy || !form.eerste_indruk.trim()}
          />
        </>
      )
    case 4:
      return (
        <Stelling
          title="The afterparty is always better than the festival itself"
          value={form.stelling_afterparty}
          onChange={v => set('stelling_afterparty', v)}
          toelichting={form.stelling_afterparty_toelichting}
          onToelichting={v => set('stelling_afterparty_toelichting', v)}
          api={api}
        />
      )
    case 5:
      return (
        <>
          <Question title="What's your guilty pleasure?" />
          <TextField
            value={form.guilty_pleasure}
            onChange={v => set('guilty_pleasure', v)}
            placeholder="No one's judging…"
            autoFocus
            onSubmit={api.next}
            submitIcon={submitIcon}
            disabled={api.busy || !form.guilty_pleasure.trim()}
          />
        </>
      )
    case 6:
      return (
        <>
          <Question title="Funniest nickname you've gotten or given?" />
          <TextField
            value={form.bijnaam}
            onChange={v => set('bijnaam', v)}
            placeholder="…"
            autoFocus
            onSubmit={api.next}
            submitIcon={submitIcon}
            disabled={api.busy || !form.bijnaam.trim()}
          />
        </>
      )
    case 7:
      return (
        <Stelling
          title="I know people better after one festival day than after a year of normal contact"
          value={form.stelling_festivaldag}
          onChange={v => set('stelling_festivaldag', v)}
          toelichting={form.stelling_festivaldag_toelichting}
          onToelichting={v => set('stelling_festivaldag_toelichting', v)}
          api={api}
        />
      )
    case 8:
      return (
        <>
          <Question title="Your childhood hero?" />
          <TextField
            value={form.jeugdheld}
            onChange={v => set('jeugdheld', v)}
            placeholder="Your hero from back then…"
            autoFocus
            onSubmit={api.next}
            submitIcon={submitIcon}
            disabled={api.busy || !form.jeugdheld.trim()}
          />
        </>
      )
    case 9:
      return (
        <>
          <ChoiceQuestion
            title="Know when you'll die or know how you'll die?"
            options={[
              { label: 'When', value: 'When' },
              { label: 'How', value: 'How' },
            ]}
            value={form.dilemma || null}
            onChange={v => set('dilemma', v)}
            toelichting={form.dilemma_toelichting}
            onToelichting={v => set('dilemma_toelichting', v)}
            api={api}
          />
        </>
      )
    case 10:
      return (
        <>
          <Question title="Your catchphrase?" />
          <TextField
            value={form.stopwoordje}
            onChange={v => set('stopwoordje', v)}
            placeholder="Really, totally, …"
            autoFocus
            onSubmit={api.next}
            submitIcon={submitIcon}
            disabled={api.busy || !form.stopwoordje.trim()}
          />
        </>
      )
    case 11:
      return (
        <>
          <Question title="Which song do you belt out at the top of your lungs?" />
          <TextField
            value={form.meezingen}
            onChange={v => set('meezingen', v)}
            placeholder="Title + artist…"
            autoFocus
            onSubmit={api.next}
            submitIcon={submitIcon}
            disabled={api.busy || !form.meezingen.trim()}
          />
        </>
      )
    case 12:
      return (
        <>
          <Question title="What's your favorite sex position?" />
          <TextField
            value={form.seksstandje}
            onChange={v => set('seksstandje', v)}
            placeholder="…"
            autoFocus
            onSubmit={api.next}
            submitIcon={submitIcon}
            disabled={api.busy || !form.seksstandje.trim()}
          />
        </>
      )
    case 13:
      return (
        <>
          <Question title="If there's one thing you want me to remember about you, what is it?" />
          <TextField
            value={form.onthoud_mij}
            onChange={v => set('onthoud_mij', v)}
            placeholder="…"
            multiline
            autoFocus
            onSubmit={api.next}
            submitIcon={submitIcon}
            disabled={api.busy || !form.onthoud_mij.trim()}
          />
        </>
      )
    case 14:
      return (
        <>
          <Question title="Upload a photo" />
          <PhotoStep preview={photo.photoPreview} onPhoto={photo.onPhoto} />
        </>
      )
    case 15:
      return (
        <>
          <Question title="Phone number" optional />
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
        <p className="mt-1 text-xs text-muted-foreground">Optional, you can skip this</p>
      )}
    </div>
  )
}

// Two side-by-side choice pills. Works for boolean stellingen (Eens/Oneens) and
// string choices (Wanneer/Hoe) alike.
function ChoiceButtons<T extends string | boolean>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[]
  value: T | null
  onChange: (v: T) => void
}) {
  return (
    <div className="flex gap-3">
      {options.map(o => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          style={value === o.value ? SELECTED_STYLE : undefined}
          className="glass-panel flex-1 rounded-2xl py-3 text-base font-semibold transition-transform active:scale-95"
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// A required two-choice question (eens/oneens, wanneer/hoe, …) with an optional
// toelichting. The arrow stays disabled until a choice is picked.
function ChoiceQuestion<T extends string | boolean>({
  title,
  options,
  value,
  onChange,
  toelichting,
  onToelichting,
  api,
}: {
  title: string
  options: { label: string; value: T }[]
  value: T | null
  onChange: (v: T) => void
  toelichting: string
  onToelichting: (v: string) => void
  api: Api
}) {
  return (
    <>
      <Question title={title} />
      <ChoiceButtons options={options} value={value} onChange={onChange} />
      <TextField
        value={toelichting}
        onChange={onToelichting}
        placeholder="Explanation (optional)"
        onSubmit={api.next}
        submitIcon="next"
        disabled={api.busy || value == null}
      />
    </>
  )
}

const STELLING_OPTIONS = [
  { label: 'Agree', value: true },
  { label: 'Disagree', value: false },
]

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
    <ChoiceQuestion
      title={title}
      options={STELLING_OPTIONS}
      value={value}
      onChange={onChange}
      toelichting={toelichting}
      onToelichting={onToelichting}
      api={api}
    />
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
    <div className="flex flex-col gap-3">
      {preview ? (
        <div className="relative w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Preview" className="h-56 w-full rounded-2xl object-cover shadow-lg" />
          <button
            type="button"
            onClick={() => onPhoto(null)}
            aria-label="Remove photo"
            className="absolute -right-2 -top-2 grid size-7 place-items-center rounded-full bg-black/70 text-white"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="glass-panel grid h-56 w-full place-items-center rounded-2xl text-muted-foreground transition-transform active:scale-95"
        >
          <span className="flex flex-col items-center gap-2">
            <ImagePlus className="size-8" />
            <span className="text-sm">Choose a photo</span>
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

/** Full-screen reaction step: a looping .webm (when present) + text take over
 *  the whole screen (no navbar, no card). If the video is missing or fails to
 *  load, it falls back to a text-only card. Tap anywhere or wait ~2.5s to
 *  advance. */
function FullScreenReaction({
  video,
  text,
  onDismiss,
}: {
  video?: string
  text?: string
  onDismiss: () => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const doneRef = useRef(false)
  // Drop the <video> if the .webm 404s / can't decode — show the text-only card.
  const [videoFailed, setVideoFailed] = useState(false)
  const showVideo = Boolean(video) && !videoFailed

  useGSAP(
    () => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        gsap.set(rootRef.current, { opacity: 1 })
        return
      }
      const tl = gsap.timeline()
      tl.fromTo(rootRef.current, { opacity: 0 }, { opacity: 1, duration: 0.22, ease: 'power2.out' })
      tl.fromTo(
        rootRef.current?.querySelector('[data-react-card]') ?? null,
        { scale: 0.92, y: 16 },
        { scale: 1, y: 0, duration: 0.4, ease: 'back.out(1.5)' },
        0,
      )
    },
    { scope: rootRef },
  )

  // Fade out, then hand back to the form (which advances to the next step). The
  // ref guard keeps a tap + the auto-timeout from both firing onDismiss.
  const dismiss = useCallback(() => {
    if (doneRef.current) return
    doneRef.current = true
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    gsap.to(rootRef.current, {
      opacity: 0,
      duration: reduce ? 0 : 0.2,
      ease: 'power2.in',
      onComplete: onDismiss,
    })
  }, [onDismiss])

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
      <div
        data-react-card
        className="relative z-10 flex flex-col items-center gap-7"
      >
        {showVideo && (
          <video
            src={video}
            autoPlay
            loop
            muted
            playsInline
            onError={() => setVideoFailed(true)}
            className="max-h-[60vh] w-auto max-w-full rounded-2xl object-contain"
          />
        )}
        {text && (
          <p className="max-w-md text-center text-3xl font-bold leading-tight text-foreground">{text}</p>
        )}
      </div>
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
