/* Festival Planner service worker — web push notifications. */

// Activate a new worker immediately instead of waiting for old tabs to close.
self.addEventListener('install', () => {
  self.skipWaiting()
})

// Take control of any already-open clients as soon as we activate.
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim())
})

// A push arrived. The payload is JSON: { title, body, url, icon, badge }.
// Fall back to sensible defaults if the payload is missing or unparseable.
self.addEventListener('push', event => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }

  const title = data.title || 'Festival Planner'
  const options = {
    body: data.body || '',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/icon-192.png',
    // Where notificationclick should send the user.
    data: { url: data.url || '/' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

// Notification tapped: focus an existing app tab if one is open, otherwise
// open a new window at the target URL.
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        // Reuse a same-origin tab if we have one.
        if ('focus' in client) {
          client.navigate(targetUrl)
          return client.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl)
    }),
  )
})
