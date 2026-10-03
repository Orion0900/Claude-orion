/** What kind of device and browser the game is running on. */

/** A phone or tablet: show the on-screen buttons and say TAP. */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false
  return !!window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window
}

/** iPhone, iPod or iPad (iPadOS reports itself as a Mac with a touch screen). */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

/** Launched from the home screen rather than a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const nav = navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true || !!window.matchMedia?.('(display-mode: standalone)').matches || !!window.matchMedia?.('(display-mode: fullscreen)').matches
}
