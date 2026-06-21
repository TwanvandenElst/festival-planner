'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarDays, Users } from 'lucide-react'

import { cn } from '@/lib/utils'
import { ThemeToggle } from './theme-toggle'

const NAV = [
  {
    href: '/',
    label: 'Artists',
    icon: Users,
    match: (p: string) => p === '/' || p.startsWith('/artists'),
    activeText: 'text-orange-300',
    activeBg: 'bg-orange-500/15',
  },
  {
    href: '/shows',
    label: 'Shows',
    icon: CalendarDays,
    match: (p: string) => p.startsWith('/shows'),
    activeText: 'text-cyan-300',
    activeBg: 'bg-cyan-500/15',
  },
]

export function BottomNav() {
  const pathname = usePathname()

  // The public share page is standalone — no app chrome.
  if (pathname.startsWith('/festivals/share')) return null

  return (
    <>
      {/* Floating theme toggle (top-right) */}
      <div className="glass-panel fixed top-4 right-4 z-50 rounded-full">
        <ThemeToggle />
      </div>

      {/* Bottom tab bar — glass surface with a top-only border */}
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-white/[0.06] shadow-[0_-10px_30px_-12px_rgba(0,0,0,0.5)] backdrop-blur-[18px] [-webkit-backdrop-filter:blur(18px)]">
        <div className="mx-auto flex max-w-md justify-around gap-2 px-6 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {NAV.map(item => {
            const active = item.match(pathname)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex flex-1 flex-col items-center gap-1 py-1 text-[0.7rem] font-medium transition-colors',
                  active ? item.activeText : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <span
                  className={cn(
                    'flex size-10 items-center justify-center rounded-2xl transition-colors',
                    active ? item.activeBg : 'bg-transparent',
                  )}
                >
                  <Icon className="size-5" />
                </span>
                {item.label}
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}
