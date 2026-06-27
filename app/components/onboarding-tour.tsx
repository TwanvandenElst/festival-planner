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
        doneBtnText: 'Got it! 👊',
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
              title: 'Follow your favorite artists',
              description:
                "Search and follow artists. We'll show you when and where they perform in the Netherlands.",
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
              title: 'Your festival lineup',
              description:
                "Add festivals you're attending and keep track of your entire season in one place.",
            },
          },
          {
            element: '[data-tour="share"]',
            popover: {
              title: 'Share your lineup',
              description:
                'Share your festival schedule with friends so they know where to find you.',
            },
          },
          {
            element: '[data-tour="friends"]',
            popover: {
              title: 'Friendship book',
              description:
                'Let new festival friends fill in a digital friendship book, your personal festival memory.',
            },
          },
          {
            element: '[data-tour="account"]',
            popover: {
              title: 'Your account',
              description:
                'Invite friends to join the app and share feedback to help improve it.',
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
