'use client'

import { usePathname } from 'next/navigation'

// Maps a route to its mesh-gradient CSS variable (defined in globals.css).
const ROUTE_GRADIENTS: { test: (p: string) => boolean; variable: string }[] = [
  { test: p => p.startsWith('/festivals/share'), variable: '--gradient-share' },
  { test: p => p.startsWith('/shows'), variable: '--gradient-shows' },
  { test: p => p === '/' || p.startsWith('/artists'), variable: '--gradient-artists' },
]

/**
 * A fixed, route-aware mesh-gradient glow anchored at the top of the viewport.
 * Sits behind page content (an accent, not a full-page flood) and fades out
 * downward via a mask. Renders nothing on routes without a mapped gradient.
 */
export function RouteGradient() {
  const pathname = usePathname()

  const match = ROUTE_GRADIENTS.find(g => g.test(pathname))
  if (!match) return null

  const fade = 'linear-gradient(to bottom, black 0%, black 32%, transparent 88%)'

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[80vh]"
      style={{
        backgroundImage: `var(${match.variable})`,
        maskImage: fade,
        WebkitMaskImage: fade,
      }}
    />
  )
}
