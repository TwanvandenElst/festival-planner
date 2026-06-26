'use client'

import { useState } from 'react'
import { Mail, Send, CheckCircle2, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type Status = 'idle' | 'sending' | 'sent' | 'error'

export function LoginForm() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')

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
    <form onSubmit={handleSubmit} className="glass-panel rounded-3xl p-6">
      <label htmlFor="email" className="mb-2 block px-1 text-sm font-medium text-muted-foreground">
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

      {status === 'error' && (
        <p className="mt-3 px-1 text-sm text-rose-300">
          Er ging iets mis: {errorMsg || 'probeer het opnieuw.'}
        </p>
      )}

      <p className="mt-4 px-1 text-center text-xs text-muted-foreground/80">
        Geen wachtwoord nodig — je ontvangt een inloglink per e-mail.
      </p>
    </form>
  )
}
