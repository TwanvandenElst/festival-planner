'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRight, Check, Loader2 } from 'lucide-react'

import { joinFestival } from '@/lib/festival-joins'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

type Piece = { id: number; dx: number; dy: number; dr: number; color: string }
type Mode = 'idle' | 'editing' | 'joined'

const CONFETTI_COLORS = ['#a78bfa', '#e879f9', '#22d3ee', '#fb923c', '#34d399', '#ffffff']

// Gradient palette for initials avatars — kept in the card's violet/cyan family.
const AVATAR_GRADIENTS = [
  'from-violet-400 to-fuchsia-500',
  'from-fuchsia-400 to-pink-500',
  'from-sky-400 to-blue-500',
  'from-amber-400 to-orange-500',
  'from-emerald-400 to-teal-500',
  'from-rose-400 to-red-500',
]

// Color by position so every avatar in a stack gets its own distinct color.
function gradientAt(index: number) {
  return AVATAR_GRADIENTS[index % AVATAR_GRADIENTS.length]
}

function initialOf(name: string) {
  return name.trim().charAt(0).toUpperCase() || '?'
}

/**
 * Overlapping initials-avatar stack. Names stay hidden until the stack is
 * tapped, which opens a popover listing everyone who joined.
 */
function JoinedAvatars({ names }: { names: string[] }) {
  const MAX = 4 // total circles shown in the stack
  const overflow = names.length > MAX ? names.length - (MAX - 1) : 0
  const shown = overflow > 0 ? names.slice(0, MAX - 1) : names

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={`${names.length} joined, show names`}
            className="flex items-center transition-transform active:scale-95"
          >
            {shown.map((name, i) => (
              <span
                key={i}
                style={{ zIndex: shown.length - i }}
                className={cn(
                  'grid size-5 place-items-center rounded-full bg-gradient-to-br text-[10px] font-bold text-white ring-2 ring-background',
                  gradientAt(i),
                  i > 0 && '-ml-0.5',
                )}
              >
                {initialOf(name)}
              </span>
            ))}
            {overflow > 0 && (
              <span className="-ml-0.5 grid size-5 place-items-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground ring-2 ring-background">
                +{overflow}
              </span>
            )}
          </button>
        }
      />
      <PopoverContent align="end" className="glass-panel w-auto max-w-[15rem] gap-1.5">
        <p className="px-0.5 text-xs font-medium text-muted-foreground">{names.length} joined</p>
        <ul className="flex flex-col gap-1.5">
          {names.map((name, i) => (
            <li key={i} className="flex items-center gap-2">
              <span
                className={cn(
                  'grid size-5 shrink-0 place-items-center rounded-full bg-gradient-to-br text-[10px] font-bold text-white',
                  gradientAt(i),
                )}
              >
                {initialOf(name)}
              </span>
              <span className="truncate text-sm">{name}</span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

// Shared pill shape so the button, the input, and the confirmation all sit in
// the same spot and morph in-place between states.
const PILL =
  'inline-flex -rotate-2 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold shadow-lg shadow-black/20 backdrop-blur-md transition-all duration-200 [-webkit-backdrop-filter:blur(12px)]'

export function JoinFestival({
  festivalId,
  initialNames,
}: {
  festivalId: string
  initialNames: string[]
}) {
  const [names, setNames] = useState<string[]>(initialNames)
  const [mode, setMode] = useState<Mode>('idle')
  const [value, setValue] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [burst, setBurst] = useState<{ x: number; y: number; pieces: Piece[] } | null>(null)
  const [celebrate, setCelebrate] = useState(false)

  const btnRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-dismiss the celebration popup after ~3s (tap also dismisses).
  useEffect(() => {
    if (!celebrate) return
    const t = setTimeout(() => setCelebrate(false), 3000)
    return () => clearTimeout(t)
  }, [celebrate])

  function fireConfetti() {
    const el = btnRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const pieces: Piece[] = Array.from({ length: 16 }, (_, i) => {
      const angle = (Math.PI * 2 * i) / 16 + Math.random() * 0.5
      const dist = 38 + Math.random() * 34
      return {
        id: Date.now() + i,
        dx: Math.cos(angle) * dist,
        dy: Math.sin(angle) * dist - 10, // bias slightly upward
        dr: Math.random() * 240 - 120,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      }
    })
    setBurst({ x: r.left + r.width / 2, y: r.top + r.height / 2, pieces })
    setTimeout(() => setBurst(null), 800)
  }

  // Initial tap: fire confetti and morph the pill into a text input.
  function startEditing() {
    fireConfetti()
    setError(null)
    setMode('editing')
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  async function submit() {
    const name = value.trim()
    if (!name) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await joinFestival(festivalId, name)
      if (res.ok) {
        setNames(prev => [...prev, res.name])
        setMode('joined')
        setValue('')
        setCelebrate(true)
      } else {
        setError(res.error)
      }
    } catch {
      setError('Could not join. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative text-right">
      <div className="flex items-center justify-end gap-2">
        {mode === 'joined' ? (
          <span className={cn(PILL, 'bg-emerald-400/20 text-emerald-200')}>
            <Check className="size-4" />
            You&apos;re in!
          </span>
        ) : mode === 'editing' ? (
          <form
            onSubmit={e => {
              e.preventDefault()
              void submit()
            }}
            className={cn(PILL, 'bg-violet-400/15 text-foreground')}
          >
            <input
              ref={inputRef}
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') {
                  setValue('')
                  setError(null)
                  setMode('idle')
                }
              }}
              onBlur={() => {
                // Tapping away with nothing typed reverts to the button.
                if (!submitting && !value.trim()) setMode('idle')
              }}
              placeholder="Your name"
              disabled={submitting}
              aria-label="Your name"
              className="w-24 bg-transparent text-left outline-none placeholder:text-foreground/50"
            />
            <button
              type="submit"
              disabled={submitting}
              aria-label="Join"
              className="-mr-1 grid size-5 shrink-0 place-items-center rounded-full text-foreground/80 transition-transform active:scale-90 disabled:opacity-70"
            >
              {submitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ArrowRight className="size-4" />
              )}
            </button>
          </form>
        ) : (
          <button
            ref={btnRef}
            type="button"
            onClick={startEditing}
            className={cn(
              PILL,
              'bg-violet-400/15 text-foreground',
              'active:-rotate-1 active:scale-[0.92]',
            )}
          >
            <span>I&apos;m in</span>
            <span className="leading-none">🙋</span>
          </button>
        )}
      </div>

      {/* Avatars float directly under the button without affecting its position. */}
      {names.length > 0 && (
        <div className="absolute right-0 top-full mt-1.5 flex justify-end">
          <JoinedAvatars names={names} />
        </div>
      )}

      {error && <p className="mt-1 text-sm text-destructive">{error}</p>}

      {/* Confetti burst, portaled to <body> so the card's overflow doesn't clip it */}
      {burst &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            aria-hidden
            className="pointer-events-none fixed z-[100]"
            style={{ left: burst.x, top: burst.y }}
          >
            {burst.pieces.map(p => (
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
        )}

      {/* Celebratory popup on a successful join — dimmed, blurred, glassmorphic */}
      {celebrate &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="dialog"
            aria-label="You joined"
            onClick={() => setCelebrate(false)}
            className="fixed inset-0 z-[110] grid cursor-pointer place-items-center bg-black/60 p-6 backdrop-blur-sm duration-200 animate-in fade-in"
          >
            <div className="glass-panel flex max-w-xs flex-col items-center gap-4 rounded-3xl p-6 text-center duration-300 animate-in zoom-in-95">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/gifs/booty-shake.gif"
                alt="Celebration"
                className="h-44 w-auto rounded-2xl object-cover shadow-lg shadow-black/30"
              />
              <p className="text-lg font-semibold tracking-tight">
                Let&apos;s shake that booty together
              </p>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
