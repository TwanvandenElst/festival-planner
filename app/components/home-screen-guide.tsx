'use client'

import { useEffect, useState } from 'react'
import { Check, Compass, Copy, Loader2, X } from 'lucide-react'

/**
 * Step-by-step guide that walks an iOS user through adding Festi to their Home
 * Screen (the only way to get web push on iPhone). Two variants:
 *  - 'safari'        → 2 steps (Share button → Add to Home Screen)
 *  - 'other-browser' → same 2 steps, preceded by a "open this in Safari" step,
 *                      because Chrome/Firefox on iOS can't add to the Home Screen.
 *
 * The screenshots live in /public/onboarding. The highlight box is positioned as
 * a percentage of the rendered image, so if you swap the screenshots, tweak the
 * HIGHLIGHT constants below to line the box up with the relevant button.
 */

type HighlightBox = { top: string; left: string; width: string; height: string }

// % positions of the highlight box over each screenshot. Adjust to match the art.
// Measured against the actual screenshots in /public/onboarding:
//  - safari-share.png: "Share" is the first row of the bottom menu card.
//  - safari-add-home.png: "Add to Home Screen" is the last row of the second card.
const SHARE_HIGHLIGHT: HighlightBox = { top: '55.5%', left: '31%', width: '32%', height: '5.5%' }
const ADD_HOME_HIGHLIGHT: HighlightBox = { top: '61%', left: '7%', width: '56%', height: '5%' }

type GuideStep =
  | { kind: 'safari-hint' }
  | { kind: 'screenshot'; image: string; text: string; highlight: HighlightBox }

const SCREENSHOT_STEPS: GuideStep[] = [
  {
    kind: 'screenshot',
    image: '/onboarding/safari-share.png',
    text: 'Tap the Share button at the bottom of your Safari browser.',
    highlight: SHARE_HIGHLIGHT,
  },
  {
    kind: 'screenshot',
    image: '/onboarding/safari-add-home.png',
    text: 'Scroll down and tap Add to Home Screen. Then open Festi from your home screen and come back to enable notifications.',
    highlight: ADD_HOME_HIGHLIGHT,
  },
]

export function HomeScreenGuide({
  variant,
  onClose,
  onEnable,
}: {
  variant: 'safari' | 'other-browser'
  /** Dismiss the guide (caller marks "asked" so we don't nag again). */
  onClose: () => void
  /** Request permission + subscribe. Called by the final button. */
  onEnable: () => Promise<void>
}) {
  const steps: GuideStep[] =
    variant === 'other-browser' ? [{ kind: 'safari-hint' }, ...SCREENSHOT_STEPS] : SCREENSHOT_STEPS

  const [index, setIndex] = useState(0)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [canSkipHint, setCanSkipHint] = useState(false)

  const step = steps[index]
  const isFirst = index === 0
  const isLast = index === steps.length - 1
  const onHint = step.kind === 'safari-hint'
  // The Safari-hint step blocks "Next" until the link is copied, or 3s pass.
  const nextBlocked = onHint && !copied && !canSkipHint

  // Close on Escape.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Allow skipping the hint step after 3s even without copying.
  useEffect(() => {
    if (!onHint) return
    const t = setTimeout(() => setCanSkipHint(true), 3000)
    return () => clearTimeout(t)
  }, [onHint])

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
    } catch {
      // Clipboard blocked — the URL is shown for manual copy; allow proceeding.
      setCanSkipHint(true)
    }
  }

  async function finish() {
    setBusy(true)
    try {
      await onEnable()
    } catch (err) {
      console.error('[push] home-screen-guide enable failed:', err)
    } finally {
      setBusy(false)
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="Add Festi to your Home Screen"
    >
      {/* Dimmed, blurred backdrop. */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />

      <div className="glass-panel relative mx-auto flex h-full w-full max-w-md flex-col border-pink-400/20 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] sm:my-auto sm:h-auto sm:rounded-3xl">
        {/* Top bar: step indicator + dismiss */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-pink-300">
              Step {index + 1} of {steps.length}
            </span>
            <span className="flex items-center gap-1.5">
              {steps.map((_, i) => (
                <span
                  key={i}
                  className={
                    i === index
                      ? 'size-1.5 rounded-full bg-pink-400'
                      : 'size-1.5 rounded-full bg-black/[0.12] dark:bg-white/25'
                  }
                />
              ))}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-black/[0.06] dark:hover:bg-white/10 hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col items-center justify-center gap-5 py-6 text-center">
          {step.kind === 'safari-hint' ? (
            <>
              <span className="grid size-16 place-items-center rounded-2xl bg-sky-500/15 text-sky-300">
                <Compass className="size-8" />
              </span>
              <p className="max-w-xs text-sm leading-relaxed text-foreground/90">
                Push notifications on iPhone only work in Safari. Copy the link below and open it in
                Safari.
              </p>
              <div className="flex w-full max-w-xs items-center gap-2 rounded-full border border-black/[0.08] dark:border-white/10 bg-black/[0.04] dark:bg-white/[0.05] py-1.5 pl-4 pr-1.5">
                <span className="min-w-0 flex-1 truncate text-left text-xs text-muted-foreground">
                  {typeof window !== 'undefined' ? window.location.href : ''}
                </span>
                <button
                  type="button"
                  onClick={copyLink}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-r from-pink-500 to-fuchsia-500 px-3 py-1.5 text-xs font-semibold text-white transition-transform active:scale-95"
                >
                  {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="relative inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={step.image}
                  alt=""
                  onError={e => {
                    ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                  }}
                  className="max-h-[55vh] w-auto rounded-xl"
                />
                {/* Bright highlight over the relevant button in the screenshot. */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute"
                  style={{
                    top: step.highlight.top,
                    left: step.highlight.left,
                    width: step.highlight.width,
                    height: step.highlight.height,
                    border: '3px solid #f0abfc',
                    borderRadius: '8px',
                    boxShadow: '0 0 0 4px rgba(240,171,252,0.3)',
                  }}
                />
              </div>
              <p className="max-w-xs text-sm leading-relaxed text-foreground/90">{step.text}</p>
            </>
          )}
        </div>

        {/* Footer: Back + Next / final action */}
        <div className="flex items-center justify-between gap-3">
          {!isFirst ? (
            <button
              type="button"
              onClick={() => setIndex(i => Math.max(0, i - 1))}
              className="rounded-full border border-black/10 dark:border-white/15 bg-black/[0.04] dark:bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-foreground/85 backdrop-blur-md transition-colors hover:bg-black/[0.06] dark:hover:bg-white/10"
            >
              Back
            </button>
          ) : (
            <span />
          )}

          {isLast ? (
            <button
              type="button"
              onClick={finish}
              disabled={busy}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-fuchsia-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-pink-900/30 transition-transform active:scale-[0.97] disabled:opacity-60"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              I&apos;ve added it to my Home Screen
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIndex(i => Math.min(steps.length - 1, i + 1))}
              disabled={nextBlocked}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-fuchsia-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-pink-900/30 transition-transform active:scale-[0.97] disabled:opacity-50"
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
