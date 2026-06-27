'use client'

import { useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'

// Each route's mesh-gradient identity (CSS vars defined in globals.css).
function gradientFor(pathname: string): string {
  if (pathname.startsWith('/festivals/share')) return 'var(--gradient-share)'
  if (pathname.startsWith('/share')) return 'var(--gradient-shows)'
  if (pathname.startsWith('/login')) return 'var(--gradient-shows)'
  if (pathname.startsWith('/invite')) return 'var(--gradient-shows)'
  if (pathname.startsWith('/shows')) return 'var(--gradient-shows)'
  if (pathname.startsWith('/vriendenboekje')) return 'var(--gradient-friends)'
  if (pathname === '/' || pathname.startsWith('/artists')) return 'var(--gradient-artists)'
  return 'none'
}

const FADE = 'linear-gradient(to bottom, black 0%, black 32%, transparent 88%)'

/**
 * Route-aware mesh-gradient glow that crossfades when the route changes, so the
 * accent colour "bleeds" into the next page's colour instead of snapping.
 * Two stacked layers: the incoming gradient fades in on top of the previous one.
 */
export function AnimatedGradient() {
  const pathname = usePathname()
  const current = gradientFor(pathname)

  const layerA = useRef<HTMLDivElement>(null)
  const layerB = useRef<HTMLDivElement>(null)
  const active = useRef(0) // which layer is currently on top/visible

  useGSAP(
    () => {
      const layers = [layerA.current, layerB.current]
      const incoming = layers[1 - active.current]
      const outgoing = layers[active.current]
      if (!incoming || !outgoing) return

      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      gsap.set(incoming, { backgroundImage: current, zIndex: 1, opacity: 0 })
      gsap.set(outgoing, { zIndex: 0 })
      gsap.to(incoming, {
        opacity: 1,
        duration: reduce ? 0 : 0.5,
        ease: 'power2.out',
      })
      active.current = 1 - active.current
    },
    { dependencies: [pathname] },
  )

  return (
    <div
      aria-hidden
      className="vb-breathe pointer-events-none fixed inset-x-0 top-0 -z-10 h-[80vh]"
      style={{ maskImage: FADE, WebkitMaskImage: FADE }}
    >
      {/* layerA starts visible with the initial gradient; layerB is the spare. */}
      <div
        ref={layerA}
        className="absolute inset-0"
        style={{ backgroundImage: current, opacity: 1 }}
      />
      <div ref={layerB} className="absolute inset-0" style={{ opacity: 0 }} />
    </div>
  )
}
