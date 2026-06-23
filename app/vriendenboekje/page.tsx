import type { Metadata } from 'next'

import { getVriendenboekjes } from '@/lib/vriendenboekje'
import { VriendenboekjeClient } from './VriendenboekjeClient'

// Entries are user-submitted; always reflect the latest state.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Vriendenboekje',
  description: 'Vul jouw vriendenboekje in en word officieel vrienden.',
}

export default async function VriendenboekjePage() {
  const entries = await getVriendenboekjes()

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-10 sm:py-14">
      <VriendenboekjeClient entries={entries} />
    </div>
  )
}
