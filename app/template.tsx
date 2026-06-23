'use client'

import { useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'

import { useGsapReveal } from '@/lib/use-gsap-reveal'

/**
 * Re-mounts on every navigation, so this is where the incoming page animates in.
 * The outgoing animation is played by the bottom nav before it pushes the route.
 * `id="page-root"` is the shared handle both ends use.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null)
  const pathname = usePathname()

  useGSAP(
    () => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
      gsap.fromTo(
        root.current,
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' },
      )
    },
    { dependencies: [pathname], scope: root },
  )

  // Stagger cards + reveal section titles for content present at mount.
  useGsapReveal(root, [pathname])

  return (
    <div ref={root} id="page-root">
      {children}
    </div>
  )
}
