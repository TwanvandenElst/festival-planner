'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, LogOut, MessageSquare } from 'lucide-react'

import { useUser } from '@/lib/use-user'
import { createClient } from '@/lib/supabase/client'
import { FeedbackModal } from './feedback-modal'

/**
 * Small logged-in indicator: an avatar circle (first letter of the email) that
 * opens a popover with the full email + a "Sign out" button. Renders nothing
 * when no user is signed in, so it stays invisible on public/pre-auth pages.
 */
export function UserMenu() {
  const { user } = useUser()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [userCount, setUserCount] = useState<number | null>(null)
  const [testingPush, setTestingPush] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  // Total number of accounts, for the "X people use the app" line.
  useEffect(() => {
    let active = true
    const supabase = createClient()
    supabase.rpc('get_user_count').then(({ data, error }) => {
      if (active && !error && typeof data === 'number') setUserCount(data)
    })
    return () => {
      active = false
    }
  }, [])

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return
    function onPointer(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!user) return null

  const email = user.email ?? ''
  const initial = (email[0] ?? '?').toUpperCase()

  // Brief auto-dismissing toast for transient feedback.
  function showToast(message: string) {
    setToast(message)
    setTimeout(() => setToast(null), 4000)
  }

  // TEMP (dev/test): fire a server-side push to this user via /api/push/test and
  // surface the result. The real delivery shows in the [push] server logs.
  async function testPush() {
    setTestingPush(true)
    try {
      const res = await fetch('/api/push/test')
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (res.ok && data.ok) {
        showToast('✅ Test push sent — check your notifications')
      } else {
        showToast(`⚠️ Failed (${res.status})${data.error ? `: ${data.error}` : ''}`)
      }
    } catch {
      showToast('⚠️ Request failed — are you online?')
    } finally {
      setTestingPush(false)
    }
  }

  // TEMP (dev/test): wipe onboarding state so the welcome popup + tour run again.
  function resetOnboarding() {
    try {
      localStorage.removeItem('onboarding_done')
      if (user) localStorage.removeItem(`welcome_seen_${user.id}`)
    } catch {
      // Storage unavailable — nothing to clear.
    }
    window.location.reload()
  }

  async function signOut() {
    setSigningOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    setOpen(false)
    router.push('/login')
    router.refresh()
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account"
        data-tour="account"
        className="grid size-9 place-items-center rounded-full bg-blue-500/80 text-sm font-semibold text-white shadow-lg shadow-blue-900/30 transition-transform active:scale-95"
      >
        {initial}
      </button>

      {open && (
        <div
          role="menu"
          className="glass-panel absolute right-0 top-11 w-60 rounded-2xl p-3 shadow-xl"
        >
          <p className="px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Signed in as
          </p>
          <p className="mt-0.5 truncate px-1 text-sm font-medium" title={email}>
            {email}
          </p>

          {userCount !== null && (
            <p className="mt-2 px-1 text-xs text-muted-foreground">
              🎪 {userCount} people use the app
            </p>
          )}

          <button
            type="button"
            onClick={() => {
              setOpen(false)
              setFeedbackOpen(true)
            }}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 py-2.5 text-sm font-semibold transition-colors hover:bg-white/15"
          >
            <MessageSquare className="size-4" />
            Share feedback
          </button>

          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 py-2.5 text-sm font-semibold transition-colors hover:bg-white/15 disabled:opacity-50"
          >
            <LogOut className="size-4" />
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>

          {/* TEMP dev/test option — remove when push testing is done. */}
          <button
            type="button"
            onClick={testPush}
            disabled={testingPush}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium text-muted-foreground/70 transition-colors hover:text-foreground disabled:opacity-60"
          >
            <Bell className="size-3.5" />
            {testingPush ? 'Sending…' : '🔔 Test push'}
          </button>

          {/* TEMP dev/test option — remove when onboarding testing is done. */}
          <button
            type="button"
            onClick={resetOnboarding}
            className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium text-muted-foreground/70 transition-colors hover:text-foreground"
          >
            <span aria-hidden>↺</span>
            Replay tour
          </button>
        </div>
      )}

      {feedbackOpen && (
        <FeedbackModal defaultFrom={email} onClose={() => setFeedbackOpen(false)} />
      )}

      {/* Transient toast for the test-push result. */}
      {toast && (
        <div className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[60] flex justify-center px-4">
          <div className="glass-panel max-w-sm rounded-full px-4 py-2.5 text-sm font-medium shadow-xl">
            {toast}
          </div>
        </div>
      )}
    </div>
  )
}
