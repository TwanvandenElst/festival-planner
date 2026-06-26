'use client'

import { useEffect, useState } from 'react'
import { Mail, Send, CheckCircle2, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type Status = 'idle' | 'sending' | 'sent' | 'error'

/** Google's 4-colour "G" mark. */
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  )
}

export function LoginForm() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [showEmail, setShowEmail] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [userCount, setUserCount] = useState<number | null>(null)

  // Social proof: total number of accounts already using the app.
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

  async function signInWithGoogle() {
    setGoogleLoading(true)
    setErrorMsg('')
    setStatus('idle')

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // Google redirects back here with a code that /auth/callback exchanges.
        redirectTo: `${window.location.origin}/auth/callback?next=/`,
      },
    })

    // On success the browser navigates to Google's consent screen, so we only
    // reach here on error.
    if (error) {
      setGoogleLoading(false)
      setStatus('error')
      setErrorMsg(error.message)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed || status === 'sending') return

    setStatus('sending')
    setErrorMsg('')

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        // Magic link lands on /auth/callback, which exchanges the code for a
        // session and forwards to the artists home.
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/`,
      },
    })

    if (error) {
      setStatus('error')
      setErrorMsg(error.message)
    } else {
      setStatus('sent')
    }
  }

  if (status === 'sent') {
    return (
      <div className="glass-panel rounded-3xl p-7 text-center">
        <CheckCircle2 className="mx-auto size-11 text-emerald-400" />
        <p className="mt-4 text-lg font-semibold">Check je mail!</p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          We hebben een magic link gestuurd naar{' '}
          <span className="font-medium text-foreground">{email.trim()}</span>. Klik de link om in te
          loggen.
        </p>
        <button
          type="button"
          onClick={() => {
            setStatus('idle')
            setEmail('')
          }}
          className="mt-5 text-sm font-medium text-cyan-300 transition-colors hover:text-cyan-200"
        >
          Ander e-mailadres gebruiken
        </button>
      </div>
    )
  }

  return (
    <div className="glass-panel rounded-3xl p-6">
      {/* Primary: Google — white pill that pops on the dark glass card. */}
      <button
        type="button"
        onClick={signInWithGoogle}
        disabled={googleLoading}
        className="flex w-full items-center justify-center gap-3 rounded-2xl bg-white px-4 py-3 text-base font-semibold text-zinc-800 shadow-lg shadow-black/20 transition-transform hover:bg-zinc-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {googleLoading ? (
          <Loader2 className="size-5 animate-spin text-zinc-500" />
        ) : (
          <GoogleIcon className="size-5" />
        )}
        Inloggen met Google
      </button>

      {status === 'error' && (
        <p className="mt-3 px-1 text-center text-sm text-rose-300">
          Er ging iets mis: {errorMsg || 'probeer het opnieuw.'}
        </p>
      )}

      {/* Fallback: subtle toggle that reveals the email magic-link form. */}
      {!showEmail ? (
        <button
          type="button"
          onClick={() => setShowEmail(true)}
          className="mx-auto mt-4 block text-xs font-medium text-muted-foreground/80 transition-colors hover:text-foreground"
        >
          Of log in met e-mail
        </button>
      ) : (
        <form onSubmit={handleSubmit} className="mt-5 border-t border-white/10 pt-5">
          <label
            htmlFor="email"
            className="mb-2 block px-1 text-sm font-medium text-muted-foreground"
          >
            E-mailadres
          </label>

          <div className="flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 transition-colors focus-within:border-cyan-400/50">
            <Mail className="size-4 shrink-0 text-muted-foreground" />
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoFocus
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="jij@voorbeeld.nl"
              className="h-12 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground/70"
            />
          </div>

          <button
            type="submit"
            disabled={status === 'sending' || !email.trim()}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-500/90 px-4 py-3 text-base font-semibold text-white shadow-lg shadow-blue-900/30 transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === 'sending' ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Versturen…
              </>
            ) : (
              <>
                <Send className="size-4" /> Stuur magic link
              </>
            )}
          </button>

          <p className="mt-4 px-1 text-center text-xs text-muted-foreground/80">
            Geen wachtwoord nodig — je ontvangt een inloglink per e-mail.
          </p>
        </form>
      )}

      {userCount !== null && (
        <p className="mt-4 px-1 text-center text-xs text-muted-foreground/80">
          🎪 {userCount} mensen gebruiken al de app
        </p>
      )}
    </div>
  )
}
