'use client'

import { useState } from 'react'
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

/** GitHub's "Octocat" mark. */
function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222 0 1.606-.014 2.898-.014 3.293 0 .322.216.694.825.576C20.565 22.092 24 17.595 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  )
}

export function LoginForm() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [showEmail, setShowEmail] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [githubLoading, setGithubLoading] = useState(false)

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

  async function signInWithGithub() {
    setGithubLoading(true)
    setErrorMsg('')
    setStatus('idle')

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        // GitHub redirects back here with a code that /auth/callback exchanges.
        redirectTo: `${window.location.origin}/auth/callback?next=/`,
      },
    })

    // On success the browser navigates to GitHub's consent screen, so we only
    // reach here on error.
    if (error) {
      setGithubLoading(false)
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
        <p className="mt-4 text-lg font-semibold">Check your email!</p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          We sent a magic link to{' '}
          <span className="font-medium text-foreground">{email.trim()}</span>. Click the link to sign
          in.
        </p>
        <button
          type="button"
          onClick={() => {
            setStatus('idle')
            setEmail('')
          }}
          className="mt-5 text-sm font-medium text-cyan-600 transition-colors hover:text-cyan-500 dark:text-cyan-300 dark:hover:text-cyan-200"
        >
          Use a different email
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
        Sign in with Google
      </button>

      {/* Secondary: GitHub — dark pill matching GitHub's brand colour. */}
      <button
        type="button"
        onClick={signInWithGithub}
        disabled={githubLoading}
        className="mt-3 flex w-full items-center justify-center gap-3 rounded-2xl bg-[#24292e] px-4 py-3 text-base font-semibold text-white shadow-lg shadow-black/20 transition-transform hover:bg-[#2f363d] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {githubLoading ? (
          <Loader2 className="size-5 animate-spin text-white/70" />
        ) : (
          <GithubIcon className="size-5" />
        )}
        Sign in with GitHub
      </button>

      {status === 'error' && (
        <p className="mt-3 px-1 text-center text-sm text-rose-600 dark:text-rose-300">
          Something went wrong: {errorMsg || 'please try again.'}
        </p>
      )}

      {/* Fallback: subtle toggle that reveals the email magic-link form. */}
      {!showEmail ? (
        <button
          type="button"
          onClick={() => setShowEmail(true)}
          className="mx-auto mt-4 block text-xs font-medium text-muted-foreground/80 transition-colors hover:text-foreground"
        >
          Or sign in with email
        </button>
      ) : (
        <form onSubmit={handleSubmit} className="mt-5 border-t border-black/[0.08] dark:border-white/10 pt-5">
          <label
            htmlFor="email"
            className="mb-2 block px-1 text-sm font-medium text-muted-foreground"
          >
            Email address
          </label>

          <div className="flex items-center gap-2.5 rounded-2xl border border-black/[0.08] dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.04] px-3.5 transition-colors focus-within:border-cyan-400/50">
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
              placeholder="you@example.com"
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
                <Loader2 className="size-4 animate-spin" /> Sending…
              </>
            ) : (
              <>
                <Send className="size-4" /> Send magic link
              </>
            )}
          </button>

          <p className="mt-4 px-1 text-center text-xs text-muted-foreground/80">
            No password needed. You&apos;ll get a sign-in link by email.
          </p>
        </form>
      )}
    </div>
  )
}
