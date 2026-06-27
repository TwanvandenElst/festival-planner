// Device / browser detection for the iOS-aware notification setup flow.
//
// iOS only allows web push from a PWA that's been added to the Home Screen, and
// only Safari can do the "Add to Home Screen" step (Chrome/Firefox on iOS are
// WebKit wrappers that lack the option). These helpers let the UI branch on that.

export type DeviceInfo = {
  isIOS: boolean
  isIOSChrome: boolean
  isIOSFirefox: boolean
  /** iOS, but a non-Safari browser (Chrome or Firefox). */
  isIOSOtherBrowser: boolean
  isIOSSafari: boolean
  /** Running as an installed PWA (iOS standalone mode). */
  isPWA: boolean
}

const EMPTY: DeviceInfo = {
  isIOS: false,
  isIOSChrome: false,
  isIOSFirefox: false,
  isIOSOtherBrowser: false,
  isIOSSafari: false,
  isPWA: false,
}

/**
 * Resolves the current device/browser. Safe to call during SSR (returns all
 * false when `navigator` is unavailable).
 */
export function getDeviceInfo(): DeviceInfo {
  if (typeof navigator === 'undefined') return EMPTY

  const ua = navigator.userAgent
  const isIOS = /iPad|iPhone|iPod/.test(ua)
  const isIOSChrome = isIOS && /CriOS/.test(ua)
  const isIOSFirefox = isIOS && /FxiOS/.test(ua)
  const isIOSOtherBrowser = isIOS && (isIOSChrome || isIOSFirefox)
  const isIOSSafari = isIOS && !isIOSChrome && !isIOSFirefox && /WebKit/.test(ua)
  // `navigator.standalone` is a non-standard iOS-only flag, true when launched
  // from the Home Screen.
  const isPWA = (window.navigator as Navigator & { standalone?: boolean }).standalone === true

  return { isIOS, isIOSChrome, isIOSFirefox, isIOSOtherBrowser, isIOSSafari, isPWA }
}
