'use client'

import { useCallback, useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { driver, type Driver } from 'driver.js'
import 'driver.js/dist/driver.css'

import { useUser } from '@/lib/use-user'

// Set once the tour is completed or skipped, so it never runs again.
const DONE_KEY = 'onboarding_done'
// Mirrors WelcomePopup's per-user key so we can tell if the greeting was seen.
const welcomeSeenKey = (userId: string) => `welcome_seen_${userId}`
// Dispatched by the "Replay tour" menu item to restart the tour without a reload.
const REPLAY_EVENT = 'replay-tour'

// The tour only runs on the main authenticated pages.
function isAllowedPath(path: string) {
  return path === '/' || path.startsWith('/artists') || path.startsWith('/shows')
}

/** Resolves once `selector` exists in the DOM (or after `timeout`ms). */
function waitForElement(selector: string, timeout = 1000): Promise<Element | null> {
  return new Promise(resolve => {
    const existing = document.querySelector(selector)
    if (existing) return resolve(existing)

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector)
      if (el) {
        observer.disconnect()
        resolve(el)
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    setTimeout(() => {
      observer.disconnect()
      resolve(document.querySelector(selector))
    }, timeout)
  })
}

/**
 * One-time Driver.js onboarding tour for new users. Starts after the welcome
 * popup is dismissed (or immediately if it was already seen), walks through the
 * key features across the artists, shows and vriendenboekje pages, and records
 * completion in localStorage so it never runs again. Excluded from
 * public/pre-auth pages. Can be replayed on demand via the REPLAY_EVENT.
 */
export function OnboardingTour() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, loading } = useUser()

  const startedRef = useRef(false)
  const driverRef = useRef<Driver | null>(null)

  // Builds and starts the tour. Stable so both the auto-start effect and the
  // replay listener can call it.
  const startTour = useCallback(async () => {
    // Step 1 lives on the artists home (`/`) — make sure we're there first.
    if (window.location.pathname !== '/') {
      router.push('/')
    }
    await waitForElement('[data-tour="add-artist"]')

    // Replay: tear down any previous instance before starting a fresh one.
    driverRef.current?.destroy()

    const d = driver({
      showProgress: true,
      progressText: '{{current}} of {{total}}',
      overlayColor: '#000000',
      // Darker backdrop so the highlighted element pops. (driver.js v1 applies
      // this as the overlay SVG fill opacity; it has no CSS-variable hook.)
      overlayOpacity: 0.8,
      stagePadding: 6,
      stageRadius: 12,
      popoverClass: 'festi-tour',
      showButtons: ['next', 'previous', 'close'],
      nextBtnText: 'Next →',
      prevBtnText: '← Prev',
      doneBtnText: "Let's go! 👊",
      // driver.js renders the close button as a tiny corner "X" (fixed 32px
      // wide), so a text label like "Skip" wraps. Relabel it and fold it — plus
      // prev/next/progress — into the footer so it reads as one row:
      //   [← Prev]   [1 of 7]   [Next →]   [Skip]
      onPopoverRender: popover => {
        popover.closeButton.innerText = 'Skip'
        const { footer, footerButtons, progress, previousButton, nextButton, closeButton } =
          popover
        footer.appendChild(previousButton)
        footer.appendChild(progress)
        footer.appendChild(nextButton)
        footer.appendChild(closeButton)
        footerButtons.remove()
      },
      onDestroyed: () => {
        try {
          localStorage.setItem(DONE_KEY, 'true')
        } catch {
          // Storage unavailable — nothing we can do; worst case the tour repeats.
        }
      },
      steps: [
        {
          element: '[data-tour="add-artist"]',
          popover: {
            description:
              'Search for artists and follow them. Every day we scan festival lineups across the Netherlands. The moment they hit a lineup, you get a push notification straight to your phone.',
            // Move to the shows page before the festivals steps.
            onNextClick: () => {
              router.push('/shows')
              void waitForElement('[data-tour="share-festivals"]').then(() => {
                driverRef.current?.moveNext()
              })
            },
          },
        },
        {
          element: '[data-tour="nav-shows"]',
          popover: {
            description:
              "Add the festivals you're going to and keep your entire season in one place. From wishlist to tickets bought, always know what's coming up.",
          },
        },
        {
          element: '[data-tour="share-festivals"]',
          popover: {
            description:
              "Share your festival schedule with friends. They can join your festivals with one tap and you'll get a notification when they do.",
          },
        },
        {
          element: '[data-tour="nav-friends"]',
          popover: {
            description:
              "Meet the people you'll be dancing next to. Answer a few fun questions together and your friendship is officially locked in. You'll show up in each other's friend list.",
            // Move to the vriendenboekje page before its share step.
            onNextClick: () => {
              router.push('/vriendenboekje')
              void waitForElement('[data-tour="share-vriendenboekje"]').then(() => {
                driverRef.current?.moveNext()
              })
            },
          },
        },
        {
          element: '[data-tour="share-vriendenboekje"]',
          popover: {
            description:
              'Send the link to a friend and they can fill in the book from their own phone. The funniest answers get their own highlight reel so you never lose the gold.',
          },
        },
        {
          element: '[data-tour="nav-share"]',
          popover: {
            description:
              'Festi is invite only. The only way in is through someone who is already here. Share your personal invite link and bring your people in.',
          },
        },
        {
          element: '[data-tour="account"]',
          popover: {
            description:
              'Festi started as a hobby project. If you have ideas, found a bug, or just want to say something, drop it in the feedback. Every message gets read. Every idea counts.',
          },
        },
      ],
    })

    driverRef.current = d
    d.drive()
  }, [router])

  // Auto-start for users who haven't completed the tour yet.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (loading || !user) return
    if (!isAllowedPath(pathname)) return
    if (startedRef.current) return

    let done = false
    try {
      done = localStorage.getItem(DONE_KEY) === 'true'
    } catch {
      // localStorage blocked (private mode) — treat as not done; tour may repeat.
    }
    if (done) return

    function schedule() {
      if (startedRef.current) return
      startedRef.current = true
      // A short beat so the page (and any dismissed popup) settles first.
      setTimeout(() => void startTour(), 100)
    }

    let welcomeSeen = false
    try {
      welcomeSeen = localStorage.getItem(welcomeSeenKey(user.id)) === 'true'
    } catch {
      welcomeSeen = false
    }

    if (welcomeSeen) {
      // Returning user who never did the tour — start right away.
      schedule()
      return
    }

    // New user — wait until they dismiss the welcome greeting.
    window.addEventListener('welcome-dismissed', schedule)
    return () => window.removeEventListener('welcome-dismissed', schedule)
  }, [user, loading, pathname, startTour])

  // Replay on demand (from the "Replay tour" menu item) — start immediately,
  // no page reload.
  useEffect(() => {
    function onReplay() {
      startedRef.current = true
      void startTour()
    }
    window.addEventListener(REPLAY_EVENT, onReplay)
    return () => window.removeEventListener(REPLAY_EVENT, onReplay)
  }, [startTour])

  // Tear down the tour if the component unmounts mid-run.
  useEffect(() => {
    return () => {
      driverRef.current?.destroy()
    }
  }, [])

  return null
}
