'use client'

import type { RefObject } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

/**
 * Reveals `[data-reveal-title]` and `[data-reveal-card]` elements inside `scope`:
 * - titles fade in + collapse letter-spacing as they scroll into view
 * - cards stagger in on load (those already visible) and on scroll (below fold)
 *
 * `deps` lets callers re-run when async data arrives (e.g. a client-fetched list).
 * useGSAP scopes the context so all tweens/ScrollTriggers are reverted on unmount.
 */
export function useGsapReveal(scope: RefObject<HTMLElement | null>, deps: unknown[] = []) {
  useGSAP(
    () => {
      const el = scope.current
      if (!el) return
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

      gsap.registerPlugin(ScrollTrigger)

      const titles = gsap.utils.toArray<HTMLElement>(el.querySelectorAll('[data-reveal-title]'))
      titles.forEach(t => {
        gsap.fromTo(
          t,
          { opacity: 0, letterSpacing: '0.1em' },
          {
            opacity: 1,
            letterSpacing: '0em',
            duration: 0.6,
            ease: 'power2.out',
            scrollTrigger: { trigger: t, start: 'top 90%' },
          },
        )
      })

      const cards = gsap.utils.toArray<HTMLElement>(el.querySelectorAll('[data-reveal-card]'))
      if (cards.length) {
        gsap.set(cards, { opacity: 0, y: 40 })
        ScrollTrigger.batch(cards, {
          start: 'top 92%',
          onEnter: batch =>
            gsap.to(batch, {
              opacity: 1,
              y: 0,
              duration: 0.6,
              ease: 'power3.out',
              stagger: 0.08,
              delay: 0.2,
              overwrite: true,
            }),
        })
      }

      ScrollTrigger.refresh()
    },
    { dependencies: deps, scope },
  )
}
