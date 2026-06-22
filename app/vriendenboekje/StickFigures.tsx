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

/**
 * Two stick figures walking toward each other as `progress` (0..1) grows. At
 * `halfway` they turn to face each other and a speech bubble appears; at `fused`
 * they meet for a fistbump.
 */
export function StickFigures({
  progress,
  fused,
  halfway,
}: {
  progress: number
  fused: boolean
  halfway: boolean
}) {
  const p = Math.min(1, Math.max(0, progress))
  // Walk from the outer edges toward the middle; on fuse they close the gap.
  const leftLeft = fused ? '46.5%' : `${5 + p * 38}%`
  const rightLeft = fused ? '53.5%' : `${95 - p * 38}%`
  const faceIn = halfway || fused

  return (
    <div className="mx-auto w-full max-w-xs select-none">
      <div className="relative h-16">
        <div className="absolute inset-x-1 bottom-1.5 h-px bg-white/10" />

        {(halfway || fused) && !fused && (
          <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 duration-300 animate-in fade-in-0 zoom-in-95">
            <div className="glass-panel rounded-2xl px-3 py-1.5 text-center text-xs font-medium text-foreground">
              Hee focus! We zijn bijna officieel vrienden
            </div>
            <div className="glass-panel mx-auto -mt-1 size-2.5 rotate-45 rounded-[2px]" />
          </div>
        )}

        {/* Left figure: faces right (center) when faceIn, flips out otherwise. */}
        <div
          className="absolute bottom-1.5 -translate-x-1/2 transition-[left] duration-500 ease-out"
          style={{ left: leftLeft }}
        >
          <div className={cn('transition-transform duration-500', faceIn ? '' : '-scale-x-100')}>
            <div className={fused ? 'animate-[vb-pop_550ms_ease-out]' : 'vb-bob'}>
              <Figure bump={fused} dancing={!fused} />
            </div>
          </div>
        </div>

        {/* Right figure: faces left (center) when faceIn. Slightly offset dance. */}
        <div
          className="absolute bottom-1.5 -translate-x-1/2 transition-[left] duration-500 ease-out"
          style={{ left: rightLeft }}
        >
          <div className={cn('transition-transform duration-500', faceIn ? '-scale-x-100' : '')}>
            <div
              className={fused ? 'animate-[vb-pop_550ms_ease-out]' : 'vb-bob'}
              style={fused ? undefined : { animationDelay: '-280ms' }}
            >
              <Figure bump={fused} dancing={!fused} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
