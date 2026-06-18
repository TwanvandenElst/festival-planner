'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'
import { ThemeToggle } from './theme-toggle'

const NAV = [
  { href: '/', label: 'Artists', match: (p: string) => p === '/' || p.startsWith('/artists') },
  { href: '/shows', label: 'Shows', match: (p: string) => p.startsWith('/shows') },
]

export function SiteHeader() {
  const pathname = usePathname()

  // The public share page is standalone — no nav/header chrome.
  if (pathname.startsWith('/festivals/share')) return null

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          Artist Tracker
        </Link>

        <nav className="flex items-center gap-1">
          {NAV.map(item => {
            const active = item.match(pathname)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm transition-colors',
                  active
                    ? 'bg-muted font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                )}
              >
                {item.label}
              </Link>
            )
          })}
          <div className="ml-1">
            <ThemeToggle />
          </div>
        </nav>
      </div>
    </header>
  )
}
