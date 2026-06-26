import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { getReactionCounts, getVriendenboekjesForHost } from '@/lib/vriendenboekje'
import { VriendenboekjeClient } from './VriendenboekjeClient'

// Entries are user-submitted; always reflect the latest state.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Vriendenboekje',
  description: 'Fill in your vriendenboekje and become official friends.',
}

export default async function VriendenboekjePage({
  searchParams,
}: {
  searchParams: Promise<{ host?: string }>
}) {
  const { host } = await searchParams

  // Visitor mode: someone opened a host's share link. Public, fill-in only —
  // no auth and no overview of the host's existing entries.
  if (host) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 pb-10 pt-6">
        <VriendenboekjeClient mode="visitor" hostId={host} entries={[]} initialCounts={{}} />
      </div>
    )
  }

  // Host mode: the logged-in owner's own book. Requires auth.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const entries = await getVriendenboekjesForHost(user.id)
  const reactionCounts = await getReactionCounts(entries.map(e => e.id))

  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-10 pt-6">
      <VriendenboekjeClient
        mode="host"
        hostId={user.id}
        entries={entries}
        initialCounts={reactionCounts}
      />
    </div>
  )
}
