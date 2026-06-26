import type { Metadata } from 'next'
import Link from 'next/link'

import { getInviterName } from '@/lib/invite'

// Public, no auth. The inviter's name is fetched per-user server-side.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Uitnodiging — Festival Planner',
  description: 'Je bent uitgenodigd voor Festival Planner.',
}

/** Google's 4-colour "G" mark — same as on /login. */
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

const BENEFITS = [
  { emoji: '🎵', text: 'Volg je favoriete artiesten en zie wanneer ze optreden' },
  { emoji: '🎪', text: 'Beheer je festivalagenda en deel die met vrienden' },
  { emoji: '📖', text: 'Vul een digitaal vriendenboekje in voor nieuwe festivalvrienden' },
]

export default async function InvitePage({
  params,
}: {
  params: Promise<{ userId: string }>
}) {
  const { userId } = await params
  const name = await getInviterName(userId)

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col items-center justify-center px-6 py-16">
      <div className="w-full">
        <header className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            {name} heeft je uitgenodigd voor Festi!
          </h1>
        </header>

        <video
          autoPlay
          loop
          muted
          playsInline
          className="mx-auto mt-6 max-h-[200px] w-auto rounded-2xl shadow-lg shadow-black/20"
        >
          <source src="/gifs/invite.webm" type="video/webm" />
        </video>

        <ul className="mt-8 space-y-4">
          {BENEFITS.map(b => (
            <li key={b.text} className="flex items-start gap-3">
              <span className="text-xl leading-tight">{b.emoji}</span>
              <span className="text-sm leading-relaxed text-muted-foreground">{b.text}</span>
            </li>
          ))}
        </ul>

        <Link
          href="/login"
          className="mt-6 flex w-full items-center justify-center gap-3 rounded-2xl bg-white px-4 py-3 text-base font-semibold text-zinc-800 shadow-lg shadow-black/20 transition-transform hover:bg-zinc-50 active:scale-[0.98]"
        >
          <GoogleIcon className="size-5" />
          Inloggen met Google
        </Link>
      </div>
    </div>
  )
}
