import type { Metadata } from 'next'
import Image from 'next/image'
import { LoginForm } from './LoginForm'
import { UserCount } from './UserCount'

export const metadata: Metadata = {
  title: 'Sign in — Artist Tracker',
  description: 'Sign in with a magic link to manage your artists and festivals.',
}

export default function LoginPage() {
  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col items-center justify-center px-6 py-16">
      <div className="w-full">
        <header className="mb-8 text-center">
          <Image
            src="/icon-f-mark.png"
            alt="Artist Tracker"
            width={80}
            height={80}
            priority
            className="mx-auto mb-4 size-20"
          />
          <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mx-auto mt-1.5 max-w-xs text-sm text-muted-foreground">
            Sign in with your email and we&apos;ll send you a magic link.
          </p>
        </header>

        <LoginForm />
        <UserCount />
      </div>
    </div>
  )
}
