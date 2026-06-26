import type { Metadata } from 'next'
import { Headphones } from 'lucide-react'
import { LoginForm } from './LoginForm'

export const metadata: Metadata = {
  title: 'Inloggen — Artist Tracker',
  description: 'Log in met een magic link om je artiesten en festivals te beheren.',
}

export default function LoginPage() {
  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col items-center justify-center px-6 py-16">
      <div className="w-full">
        <header className="mb-8 text-center">
          <div className="glass-panel mx-auto mb-4 grid size-14 place-items-center rounded-2xl">
            <Headphones className="size-7 text-cyan-300" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Welkom terug</h1>
          <p className="mx-auto mt-1.5 max-w-xs text-sm text-muted-foreground">
            Log in met je e-mail — we sturen je een magic link.
          </p>
        </header>

        <LoginForm />
      </div>
    </div>
  )
}
