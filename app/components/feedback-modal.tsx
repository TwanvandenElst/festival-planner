'use client'

import { useEffect, useState } from 'react'
import { Check, Loader2, Send, X } from 'lucide-react'

import { submitFeedback } from '@/lib/feedback'

/**
 * Feedback modal: a glass dialog with a personal note from Twan and a message
 * textarea. The sender (`defaultFrom`, the signed-in email) is attached
 * automatically — there's no editable name field. On submit the message is sent
 * to the owner via Telegram, then a success state is shown.
 */
export function FeedbackModal({
  defaultFrom = '',
  onClose,
}: {
  defaultFrom?: string
  onClose: () => void
}) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Close on Escape.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleSend() {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setSending(true)
    setError(null)
    const res = await submitFeedback(trimmed, defaultFrom)
    setSending(false)
    if (res.ok) setSent(true)
    else setError(res.error)
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="feedback-title"
    >
      {/* Dimmed backdrop — tap to dismiss. */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="glass-panel relative w-full max-w-sm rounded-2xl border-pink-400/30 p-6 shadow-2xl shadow-pink-900/20 duration-200 animate-in fade-in zoom-in-95">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
        >
          <X className="size-4" />
        </button>

        {sent ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <span className="grid size-14 place-items-center rounded-full bg-emerald-400/20">
              <Check className="size-7 text-emerald-300" />
            </span>
            <p className="text-lg font-semibold tracking-tight">Thanks! I&apos;ll read it 👊</p>
          </div>
        ) : (
          <>
            <h2 id="feedback-title" className="pr-6 text-lg font-bold tracking-tight">
              💡 Your idea matters
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              I&apos;m building this app for you. So if something&apos;s missing, something&apos;s
              annoying, or you have a brilliant idea: let me know. Every message is read by me
              personally.
            </p>
            <p className="mt-2 text-sm italic text-muted-foreground/80">Twan</p>

            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Your idea, feedback or bug..."
              rows={4}
              autoFocus
              className="mt-4 min-h-[6rem] w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-pink-400/50 placeholder:text-muted-foreground/70"
            />

            {error && <p className="mt-2 text-sm text-rose-300">{error}</p>}

            <button
              type="button"
              onClick={handleSend}
              disabled={sending || !text.trim()}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-pink-500 to-fuchsia-500 py-3 text-sm font-semibold text-white shadow-lg shadow-pink-900/30 transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {sending ? 'Sending…' : 'Send'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
