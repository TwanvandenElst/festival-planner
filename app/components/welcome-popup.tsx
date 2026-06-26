'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { usePathname } from 'next/navigation'

import { useUser } from '@/lib/use-user'

// Per-user so every new account is greeted once on this device.
const seenKey = (userId: string) => `welcome_seen_${userId}`
// Only greet people once they've landed on the main app, never on public pages.
const ALLOWED_PATHS = ['/', '/artists']

/**
 * One-time personal welcome note from Twan. Appears 4s after a first-time user
 * lands on the main app (/ or /artists), then is remembered per account in
 * localStorage so it never shows that user again — not after a refresh,
 * re-login, or revisit. A different account sees it once too. Excluded from
 * /login and the public /vriendenboekje and /festivals/share pages.
 */
export function WelcomePopup() {
  const pathname = usePathname()
  const { user, loading } = useUser()
  const [mounted, setMounted] = useState(false) // in the DOM at all
  const [visible, setVisible] = useState(false) // drives the fade/scale state

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (loading || !user) return
    if (!ALLOWED_PATHS.includes(pathname)) return
    if (localStorage.getItem(seenKey(user.id))) return

    const timer = setTimeout(() => {
      setMounted(true)
      // Next frame: flip to visible so the enter transition runs.
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
    }, 4000)

    return () => clearTimeout(timer)
  }, [pathname, user, loading])

  function dismiss() {
    if (user) {
      try {
        localStorage.setItem(seenKey(user.id), 'true')
      } catch {
        // Private mode / storage disabled — worst case it shows once more.
      }
    }
    setVisible(false)
    // Remove from the DOM once the fade-out transition has finished.
    setTimeout(() => setMounted(false), 200)
  }

  if (!mounted) return null

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-200 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
    >
      {/* Dimmed backdrop — does not dismiss; only the button closes the popup. */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        className={`glass-panel relative w-full max-w-sm rounded-xl border-pink-400/30 p-6 text-center shadow-2xl shadow-pink-900/20 transition-transform duration-200 ${
          visible ? 'scale-100' : 'scale-90'
        }`}
      >
        <Image
          src="/twan-profile.jpg"
          alt="Twan"
          width={128}
          height={128}
          className="mx-auto size-32 rounded-full border border-white/20 object-cover shadow-lg"
        />

        <h2 id="welcome-title" className="mt-4 text-lg font-bold tracking-tight">
          🎉 Hi, welcome!
        </h2>

        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          This app is a joke that got out of hand and I&apos;m far from done with
          it. Got an idea for a fun feature, or is something not working right?{' '}
          <span className="font-medium text-foreground">Let me know!</span>{' '}
          Together we&apos;ll make something great out of it. 🙏
        </p>

        <p className="mt-3 text-xs italic text-muted-foreground/80">— Twan</p>

        <button
          type="button"
          onClick={dismiss}
          className="mt-5 w-full rounded-2xl bg-gradient-to-r from-pink-500 to-fuchsia-500 py-3 text-sm font-semibold text-white shadow-lg shadow-pink-900/30 transition-transform active:scale-[0.98]"
        >
          Sounds good! 👊
        </button>
      </div>
    </div>
  )
}
