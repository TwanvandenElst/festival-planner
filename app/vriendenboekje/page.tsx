import type { Metadata } from 'next'

import { getReactionCounts, getVriendenboekjes } from '@/lib/vriendenboekje'
import { VriendenboekjeClient } from './VriendenboekjeClient'

// Entries are user-submitted; always reflect the latest state.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Vriendenboekje',
  description: 'Vul jouw vriendenboekje in en word officieel vrienden.',
}

export default async function VriendenboekjePage() {
  const [entries, reactionCounts] = await Promise.all([
    getVriendenboekjes(),
    getReactionCounts(),
  ])

  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-10 pt-6">
      <VriendenboekjeClient entries={entries} initialCounts={reactionCounts} />
    </div>
  )
}
