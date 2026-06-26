'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'

import { useUser } from '@/lib/use-user'
import { createClient } from '@/lib/supabase/client'

/**
 * Small logged-in indicator: an avatar circle (first letter of the email) that
 * opens a popover with the full email + a "Sign out" button. Renders nothing
 * when no user is signed in, so it stays invisible on public/pre-auth pages.
 */
export function UserMenu() {
  const { user } = useUser()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [userCount, setUserCount] = useState<number | null>(null)
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
            onClick={signOut}
            disabled={signingOut}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 py-2.5 text-sm font-semibold transition-colors hover:bg-white/15 disabled:opacity-50"
          >
            <LogOut className="size-4" />
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      )}
    </div>
  )
}
