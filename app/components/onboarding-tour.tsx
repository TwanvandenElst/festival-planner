'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { driver, type Driver } from 'driver.js'
import 'driver.js/dist/driver.css'

import { useUser } from '@/lib/use-user'

// Set once the tour is completed or skipped, so it never runs again.
const DONE_KEY = 'onboarding_done'
// Mirrors WelcomePopup's per-user key so we can tell if the greeting was seen.
const welcomeSeenKey = (userId: string) => `welcome_seen_${userId}`

// The tour only runs on the main authenticated pages.
function isAllowedPath(path: string) {
  return path === '/' || path.startsWith('/artists') || path.startsWith('/shows')
}

/** Resolves once `selector` exists in the DOM (or after `timeout`ms). */
function waitForElement(selector: string, timeout = 5000): Promise<Element | null> {
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
 * key features across the artists and shows pages, and records completion in
 * localStorage so it never runs again. Excluded from public/pre-auth pages.
 */
export function OnboardingTour() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, loading } = useUser()

  const startedRef = useRef(false)
  const driverRef = useRef<Driver | null>(null)

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

    function markDone() {
      try {
        localStorage.setItem(DONE_KEY, 'true')
      } catch {
        // Storage unavailable — nothing we can do; worst case the tour repeats.
      }
    }

    async function startTour() {
      // Step 1 lives on the artists home (`/`) — make sure we're there first.
      if (window.location.pathname !== '/') {
        router.push('/')
      }
      await waitForElement('[data-tour="add-artist"]')

      const d = driver({
        showProgress: true,
        progressText: '{{current}} of {{total}}',
        overlayColor: '#000000',
        overlayOpacity: 0.6,
        stagePadding: 6,
        stageRadius: 12,
        popoverClass: 'festi-tour',
        showButtons: ['next', 'close'],
        nextBtnText: 'Next',
        doneBtnText: "Let's go! 👊",
        // Driver.js has no closeBtnText option — relabel the close button to
        // read "Skip tour" each time a popover renders.
        onPopoverRender: popover => {
          popover.closeButton.innerText = 'Skip tour'
        },
        onDestroyed: markDone,
        steps: [
          {
            element: '[data-tour="add-artist"]',
            popover: {
              description:
                'Search for artists and follow them. Every day we scan festival lineups across the Netherlands. The moment they hit a lineup, you get a push notification straight to your phone.',
              // Move to the shows page before the festivals step.
              onNextClick: () => {
                router.push('/shows')
                void waitForElement('[data-tour="festivals"]').then(() => {
                  driverRef.current?.moveNext()
                })
              },
            },
          },
          {
            element: '[data-tour="festivals"]',
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
            element: '[data-tour="friends"]',
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
            element: '[data-tour="share-navbar"]',
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
    }

    function schedule() {
      if (startedRef.current) return
      startedRef.current = true
      // A short beat so the page (and any dismissed popup) settles first.
      setTimeout(() => void startTour(), 600)
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
  }, [user, loading, pathname, router])

  // Tear down the tour if the component unmounts mid-run.
  useEffect(() => {
    return () => {
      driverRef.current?.destroy()
    }
  }, [])

  return null
}
