'use client'

import { useEffect } from 'react'

/**
 * Registers the push service worker (/sw.js) once, on the client only. Renders
 * nothing. The `'serviceWorker' in navigator` guard means it's a no-op during
 * SSR and on browsers without service worker support.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.error('[sw] registration failed:', err)
    })
  }, [])

  return null
}
