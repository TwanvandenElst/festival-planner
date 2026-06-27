'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Bell, Loader2, X } from 'lucide-react'

import { useUser } from '@/lib/use-user'
import { savePushSubscription } from '@/lib/push-subscribe'
import { getDeviceInfo } from '@/lib/device'
import { HomeScreenGuide } from './home-screen-guide'

// Asked-once flag (global per device, as specified).
const ASKED_KEY = 'notifications_asked'

// Standalone/public pages have no app chrome — never prompt there.
function isPublicPath(path: string) {
  return (
    path.startsWith('/login') ||
    path.startsWith('/invite') ||
    path.startsWith('/festivals/share')
  )
}

// VAPID public key (base64url) → Uint8Array for pushManager.subscribe().
// Built over an explicit ArrayBuffer so it satisfies BufferSource.
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const buffer = new ArrayBuffer(raw.length)
  const output = new Uint8Array(buffer)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

/**
 * Subtle bottom banner that asks the user (once) to enable push notifications.
 * Appears a few seconds after a signed-in user lands on an app page, unless
 * they've already been asked, already granted, or previously denied. On
 * "Enable" it requests permission, subscribes via the service worker, and saves
 * the subscription server-side.
 */
export function NotificationsPrompt() {
  const pathname = usePathname()
  const { user, loading } = useUser()
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  // When set, the iOS Home Screen guide is shown instead of the banner.
  const [guide, setGuide] = useState<null | 'safari' | 'other-browser'>(null)
  // Bumped by the "Replay tour" reset so the trigger effect re-evaluates.
  const [resetTick, setResetTick] = useState(0)

  // The "Replay tour" menu item clears the asked-gate and fires this event;
  // re-run the trigger logic so the prompt can show again without a reload.
  useEffect(() => {
    function onReplay() {
      setVisible(false)
      setGuide(null)
      setResetTick(t => t + 1)
    }
    window.addEventListener('replay-tour', onReplay)
    return () => window.removeEventListener('replay-tour', onReplay)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (loading || !user) return
    if (isPublicPath(pathname)) return

    const device = getDeviceInfo()
    console.log('[notifications] device info:', device)

    // iOS in a browser (not installed as a PWA): web push isn't available here at
    // all — Notification/PushManager don't exist until the app is added to the
    // Home Screen. So DON'T run the capability check (it would bail). Instead
    // surface the prompt, which routes into the Home Screen guide, once.
    if (device.isIOS && !device.isPWA) {
      try {
        if (localStorage.getItem(ASKED_KEY)) return
      } catch {
        // localStorage blocked — fall through; worst case we ask again later.
      }
      const t = setTimeout(() => setVisible(true), 3500)
      return () => clearTimeout(t)
    }

    // Everything else (Android, desktop, installed iOS PWA) needs the real APIs.
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      console.log('[notifications] push APIs unavailable — not prompting')
      return
    }

    // Already granted: self-heal. If there's no active push subscription (e.g.
    // after a reinstall or cleared data), silently re-subscribe and save — never
    // show the banner in this case.
    if (Notification.permission === 'granted') {
      markAsked()
      let cancelled = false
      navigator.serviceWorker.ready
        .then(reg => reg.pushManager.getSubscription())
        .then(sub => {
          if (cancelled || sub) return // already subscribed — nothing to do
          return subscribeAndSave() // null → re-subscribe and save
        })
        .catch(err => console.error('[push] auto-resubscribe failed:', err))
      return () => {
        cancelled = true
      }
    }

    // Hard-denied → don't nag.
    if (Notification.permission === 'denied') {
      markAsked()
      return
    }

    // permission === 'default': ask once, after the page (and onboarding) settle.
    try {
      if (localStorage.getItem(ASKED_KEY)) return
    } catch {
      // localStorage blocked — fall through; worst case we ask again later.
    }
    const t = setTimeout(() => setVisible(true), 3500)
    return () => clearTimeout(t)
  }, [user, loading, pathname, resetTick])

  function markAsked() {
    try {
      localStorage.setItem(ASKED_KEY, 'true')
    } catch {
      /* ignore */
    }
  }

  function dismiss() {
    markAsked()
    setVisible(false)
  }

  // Subscribe to push and persist it. pushManager.subscribe() returns the
  // existing subscription when one already matches the key, so it's idempotent.
  async function subscribeAndSave() {
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!key) {
      console.error('[push] NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set — cannot subscribe.')
      return
    }
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    })
    await savePushSubscription(subscription.toJSON())
  }

  // Request permission and (if granted) subscribe. Used by the direct flow and
  // by the Home Screen guide's final button.
  async function requestAndSubscribe() {
    // On an iOS browser tab the Notification API doesn't exist yet (only inside
    // the installed PWA), so guard against it instead of throwing.
    if (typeof Notification === 'undefined') {
      console.log('[notifications] Notification API unavailable — open the app from your Home Screen')
      return
    }
    const permission = await Notification.requestPermission()
    if (permission === 'granted') {
      await subscribeAndSave()
    }
  }

  async function enable() {
    const device = getDeviceInfo()

    // Android, desktop, or an installed iOS PWA can request permission directly.
    if (!device.isIOS || device.isPWA) {
      setBusy(true)
      try {
        await requestAndSubscribe()
      } catch (err) {
        console.error('[push] enable failed:', err)
      } finally {
        setBusy(false)
        dismiss()
      }
      return
    }

    // iOS in a browser (no push until added to the Home Screen as a PWA). Show
    // the guide — with an extra "open in Safari" step for Chrome/Firefox.
    setVisible(false)
    setGuide(device.isIOSOtherBrowser ? 'other-browser' : 'safari')
  }

  function closeGuide() {
    markAsked()
    setGuide(null)
    setVisible(false)
  }

  if (guide) {
    return <HomeScreenGuide variant={guide} onClose={closeGuide} onEnable={requestAndSubscribe} />
  }

  if (!visible) return null

  return (
    <div className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4">
      <div className="glass-panel flex w-full max-w-md items-start gap-3 rounded-2xl border-pink-400/30 p-4 shadow-xl shadow-pink-900/20 duration-300 animate-in fade-in slide-in-from-bottom-4">
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-pink-500/20 text-pink-300">
          <Bell className="size-4" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm leading-snug">
            🔔 Get notified when artists join lineups or friends join your festivals. Enable
            notifications?
          </p>

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={enable}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-pink-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-pink-900/30 transition-transform active:scale-[0.97] disabled:opacity-60"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Enable
            </button>
            <button
              type="button"
              onClick={dismiss}
              disabled={busy}
              className="rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
            >
              Maybe later
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="-mr-1 -mt-1 grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  )
}
