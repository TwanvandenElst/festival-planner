'use client'

import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Loader2, Share2 } from 'lucide-react'

import { useUser } from '@/lib/use-user'
import { createClient } from '@/lib/supabase/client'

/**
 * Invite page. Festi is invite-only, so this is where a member gets their
 * personal invite link (/invite/[userId]) to bring people in: a marketing hero,
 * a QR code, and a native-share button.
 */
export default function SharePage() {
  const { user, loading } = useUser()
  const [count, setCount] = useState<number | null>(null)
  const [inviteUrl, setInviteUrl] = useState('')

  // Live community size (same RPC the login page uses).
  useEffect(() => {
    let active = true
    const supabase = createClient()
    supabase.rpc('get_user_count').then(({ data, error }) => {
      if (active && !error && typeof data === 'number') setCount(data)
    })
    return () => {
      active = false
    }
  }, [])

  // window is client-only — build the absolute invite URL after mount.
  useEffect(() => {
    if (user) setInviteUrl(`${window.location.origin}/invite/${user.id}`)
  }, [user])

  async function copyLink() {
    if (!inviteUrl) return
    try {
      await navigator.clipboard.writeText(inviteUrl)
    } catch {
      // Clipboard blocked (insecure context) — nothing to do.
    }
  }

  async function shareLink() {
    if (!inviteUrl) return
    const data = {
      title: 'Festi — invite only',
      text: "You're invited to Festi. The festival community for people who live for the crowd.",
      url: inviteUrl,
    }
    try {
      if (navigator.share) {
        await navigator.share(data)
      } else {
        await copyLink()
      }
    } catch {
      // User dismissed the share sheet — nothing to do.
    }
  }

  if (loading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">Sign in to get your invite link.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 pt-[60px] pb-10 sm:pb-14">
      {/* 1. Hero */}
      <header>
        <h1 data-reveal-title className="text-3xl font-bold tracking-tight">
          Festi is invite only.
        </h1>
        <div
          data-reveal-card
          className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground"
        >
          <p>No ads. No payments. Just people who actually live for festivals.</p>
          <p>
            <span className="font-semibold text-foreground">{count ?? '…'}</span> members. Every
            single one hand-picked by someone already inside.
          </p>
          <p className="font-medium text-foreground">
            You got in because someone vouched for you. Now it&apos;s your turn.
          </p>
        </div>
      </header>

      {/* 2. Share button */}
      <button
        type="button"
        onClick={shareLink}
        className="mt-8 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-500 to-fuchsia-500 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-900/30 transition-transform active:scale-[0.98]"
      >
        <Share2 className="size-4" />
        Share your invite link 🎪
      </button>

      {/* 3. QR code */}
      <section data-reveal-card className="mt-8 flex flex-col items-center">
        <div className="rounded-xl bg-[#0b0b12] p-4 shadow-lg shadow-black/30">
          {inviteUrl && (
            <QRCodeSVG
              value={inviteUrl}
              size={200}
              bgColor="#0b0b12"
              fgColor="#ffffff"
              level="M"
              marginSize={1}
            />
          )}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Or scan to share</p>
      </section>

      {/* 4. Community feel */}
      <p className="mt-8 text-center text-xs text-muted-foreground/80">
        Every great community starts with one invite.
      </p>
    </div>
  )
}
