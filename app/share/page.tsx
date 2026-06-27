'use client'

import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Check, Copy, Loader2, Share2 } from 'lucide-react'

import { useUser } from '@/lib/use-user'
import { createClient } from '@/lib/supabase/client'

/**
 * Invite page. Festi is invite-only, so this is where a member gets their
 * personal invite link (/invite/[userId]) to bring people in: a marketing hero,
 * a copyable link, a QR code, and a native-share button.
 */
export default function SharePage() {
  const { user, loading } = useUser()
  const [count, setCount] = useState<number | null>(null)
  const [inviteUrl, setInviteUrl] = useState('')
  const [copied, setCopied] = useState(false)

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
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked (insecure context) — the link is shown for manual copy.
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
    <div className="mx-auto w-full max-w-md px-4 py-10 sm:py-14">
      {/* 1. Hero */}
      <header>
        <h1 data-reveal-title className="text-3xl font-bold tracking-tight">
          Festi is invite only.
        </h1>
        <div
          data-reveal-card
          className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground"
        >
          <p>
            Not everyone gets in. Festi is a closed community for people who live for festivals. No
            ads, no algorithm, no randoms. Just people who know what it means to be in the crowd at
            2am when the drop hits.
          </p>
          <p>
            Right now we are{' '}
            <span className="font-semibold text-foreground">{count ?? '…'}</span> people. Every
            person in here was invited by someone who trusted them with this.
          </p>
          <p className="font-medium text-foreground">Know someone who belongs here? Bring them in.</p>
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

      {/* 4. Personal invite link (copy) */}
      <section data-reveal-card className="mt-8">
        <p className="mb-2 px-1 text-sm font-medium">Your personal invite link</p>
        <div className="glass-panel flex items-center gap-2 rounded-2xl py-1.5 pl-4 pr-1.5">
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground" title={inviteUrl}>
            {inviteUrl}
          </span>
          <button
            type="button"
            onClick={copyLink}
            aria-label="Copy invite link"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-black/[0.06] px-3 py-2 text-xs font-semibold transition-colors hover:bg-black/[0.1] dark:bg-white/10 dark:hover:bg-white/15"
          >
            {copied ? (
              <Check className="size-4 text-emerald-600 dark:text-emerald-300" />
            ) : (
              <Copy className="size-4" />
            )}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </section>

      {/* 5. Community feel */}
      <p className="mt-8 text-center text-xs text-muted-foreground/80">
        Every great community starts with one invite.
      </p>
    </div>
  )
}
