'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * Social proof line shown below the login card: total number of accounts
 * already using the app. Renders nothing until the count has loaded.
 */
export function UserCount() {
  const [count, setCount] = useState<number | null>(null)

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

  if (count === null) return null

  return (
    <p className="mt-5 text-center text-xs text-muted-foreground/80">
      🎪 {count} people already use the app
    </p>
  )
}
