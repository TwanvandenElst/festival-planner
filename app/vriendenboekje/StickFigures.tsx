'use client'

import { cn } from '@/lib/utils'

/** A single white stick figure. Base art faces RIGHT; the parent flips it. */
function Figure({ bump, dancing }: { bump: boolean; dancing: boolean }) {
  return (
    <svg
      viewBox="0 0 28 44"
      className={cn('h-11 w-7', dancing && 'vb-dancing')}
      fill="none"
      stroke="white"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="8" r="4.5" />
      <line x1="11" y1="12.5" x2="11" y2="28" />
      {/* back arm */}
      <line className="vb-arm-back" x1="11" y1="16" x2="5" y2="23" />
      {/* front arm — extends into a fist on bump */}
      {bump ? (
        <>
          <line x1="11" y1="17.5" x2="22" y2="17.5" />
          <circle cx="23.5" cy="17.5" r="2.4" fill="white" />
        </>
      ) : (
        <line className="vb-arm-front" x1="11" y1="16" x2="17.5" y2="23" />
      )}
      {/* legs */}
      <line className="vb-leg-l" x1="11" y1="28" x2="5" y2="42" />
      <line className="vb-leg-r" x1="11" y1="28" x2="17" y2="42" />
    </svg>
  )
}

/** One positioned figure. Spins once whenever `step` changes (keyed remount). */
function FigureSlot({
  left,
  flip,
  step,
  fused,
}: {
  left: string
  flip: boolean
  step: number
  fused: boolean
}) {
  return (
    <div
      className="absolute bottom-1.5 -translate-x-1/2 transition-[left] duration-500 ease-out"
      style={{ left }}
    >
      {/* Persistent facing: the right figure mirrors so both face the centre. */}
      <div className={flip ? '-scale-x-100' : ''}>
        {fused ? (
          <div className="animate-[vb-pop_550ms_ease-out]">
            <Figure bump dancing={false} />
          </div>
        ) : (
          // Keyed by step so the spin animation replays on every next question.
          <div key={step} className="vb-spin">
            <div className="vb-bob">
              <Figure bump={false} dancing />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Two stick figures dancing toward each other as `progress` (0..1) grows. They
 * spin around on every step change and meet for a fistbump when `fused`.
 */
export function StickFigures({
  progress,
  step,
  fused,
}: {
  progress: number
  step: number
  fused: boolean
}) {
  const p = Math.min(1, Math.max(0, progress))
  const leftLeft = fused ? '46.5%' : `${5 + p * 38}%`
  const rightLeft = fused ? '53.5%' : `${95 - p * 38}%`

  return (
    <div className="mx-auto w-full max-w-xs select-none">
      <div className="relative h-16">
        <div className="absolute inset-x-1 bottom-1.5 h-px bg-white/10" />
        <FigureSlot left={leftLeft} flip={false} step={step} fused={fused} />
        <FigureSlot left={rightLeft} flip step={step} fused={fused} />
      </div>
    </div>
  )
}
