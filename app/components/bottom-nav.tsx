'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { BookHeart, CalendarDays, Heart, Users } from 'lucide-react'
import gsap from 'gsap'

import { cn } from '@/lib/utils'
import { ThemeToggle } from './theme-toggle'
import { UserMenu } from './user-menu'

const NAV = [
  {
    href: '/',
    label: 'Artists',
    icon: Users,
    match: (p: string) => p === '/' || p.startsWith('/artists'),
    activeText: 'text-orange-600 dark:text-orange-300',
    activeBg: 'bg-orange-500/15',
    tour: undefined,
  },
  {
    href: '/shows',
    label: 'Shows',
    icon: CalendarDays,
    match: (p: string) => p.startsWith('/shows'),
    activeText: 'text-cyan-600 dark:text-cyan-300',
    activeBg: 'bg-cyan-500/15',
    tour: 'nav-shows',
  },
  {
    href: '/share',
    label: 'Share',
    icon: Heart,
    match: (p: string) => p.startsWith('/share'),
    activeText: 'text-violet-600 dark:text-violet-300',
    activeBg: 'bg-violet-500/15',
    tour: 'nav-share',
  },
  {
    href: '/vriendenboekje',
    label: 'Friends',
    icon: BookHeart,
    match: (p: string) => p.startsWith('/vriendenboekje'),
    activeText: 'text-pink-600 dark:text-pink-300',
    activeBg: 'bg-pink-500/15',
    tour: 'nav-friends',
  },
]

export function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()

  // Play the outgoing page animation, then navigate. The nav bar itself never
  // animates — only the page content (#page-root) does.
  function handleNav(e: React.MouseEvent, href: string) {
    e.preventDefault()
    if (href === pathname) return
    const el = document.getElementById('page-root')
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!el || reduce) {
      router.push(href)
      return
    }
    gsap.to(el, {
      opacity: 0,
      y: -20,
      duration: 0.25,
      ease: 'power2.in',
      onComplete: () => router.push(href),
    })
  }

  // The public share page is standalone — no app chrome.
  if (pathname.startsWith('/festivals/share')) return null

  // The login page is pre-auth — no nav to protected pages.
  if (pathname.startsWith('/login')) return null

  // The public invite page is standalone — no app chrome.
  if (pathname.startsWith('/invite')) return null

  return (
    <>
      {/* Floating top-right cluster: account menu + theme toggle */}
      <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
        <UserMenu />
        <div className="glass-panel rounded-full">
          <ThemeToggle />
        </div>
      </div>

      {/* Bottom tab bar — glass surface with a top-only border */}
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-black/[0.08] dark:border-white/10 bg-black/[0.04] dark:bg-white/[0.06] shadow-[0_-10px_30px_-12px_rgba(0,0,0,0.5)] backdrop-blur-[18px] [-webkit-backdrop-filter:blur(18px)]">
        <div className="mx-auto flex max-w-md justify-around gap-2 px-6 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {NAV.map(item => {
            const active = item.match(pathname)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={e => handleNav(e, item.href)}
                aria-current={active ? 'page' : undefined}
                data-tour={item.tour}
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
