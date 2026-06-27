'use client'

import { useRef } from 'react'
import { ArrowRight, Check, Mic } from 'lucide-react'

import { cn } from '@/lib/utils'
import { useSpeechRecognition } from '@/lib/use-speech-recognition'

/** Mic button that dictates into a text value via the Web Speech API. */
function MicButton({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const baseRef = useRef('')
  const { listening, supported, start } = useSpeechRecognition(transcript => {
    const base = baseRef.current
    onChange(base ? `${base} ${transcript}` : transcript)
  })

  if (!supported) return null

  return (
    <button
      type="button"
      aria-label={listening ? 'Stop dictating' : 'Dictate your answer'}
      onClick={() => {
        baseRef.current = value.trim()
        start()
      }}
      className={cn(
        'relative grid size-9 shrink-0 place-items-center rounded-full transition-transform active:scale-90',
        listening ? 'bg-pink-500/25 text-pink-700 dark:text-pink-200' : 'bg-black/[0.06] dark:bg-white/10 text-muted-foreground active:text-foreground',
      )}
    >
      {/* Radiating soundwave rings while listening. */}
      {listening && (
        <>
          <span className="vb-mic-ring" />
          <span className="vb-mic-ring" style={{ animationDelay: '0.7s' }} />
        </>
      )}
      <Mic className="size-4" />
    </button>
  )
}

/**
 * Glassmorphic text field (single- or multi-line) with a voice-input mic and an
 * optional chat-style send/submit arrow on the right. Pressing Enter (without
 * Shift) calls `onSubmit`, advancing to the next slide.
 */
export function TextField({
  value,
  onChange,
  placeholder,
  multiline,
  autoFocus,
  type = 'text',
  inputMode,
  onSubmit,
  submitIcon,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  multiline?: boolean
  autoFocus?: boolean
  type?: string
  inputMode?: 'text' | 'tel' | 'url'
  onSubmit?: () => void
  submitIcon?: 'next' | 'check'
  disabled?: boolean
}) {
  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSubmit?.()
    }
  }

  return (
    <div className="glass-panel flex items-end gap-1.5 rounded-2xl p-2">
      {multiline ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKey}
          placeholder={placeholder}
          autoFocus={autoFocus}
          rows={3}
          className="max-h-48 min-h-[3.5rem] flex-1 resize-none bg-transparent px-2 py-1.5 text-base outline-none placeholder:text-muted-foreground/70"
        />
      ) : (
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKey}
          placeholder={placeholder}
          autoFocus={autoFocus}
          type={type}
          inputMode={inputMode}
          className="h-10 flex-1 bg-transparent px-2 text-base outline-none placeholder:text-muted-foreground/70"
        />
      )}

      <MicButton value={value} onChange={onChange} />

      {onSubmit && submitIcon && (
        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled}
          aria-label={submitIcon === 'check' ? 'Send' : 'Next'}
          className="grid size-9 shrink-0 place-items-center rounded-full bg-pink-500/30 text-pink-700 dark:text-pink-100 shadow-lg shadow-pink-900/20 transition-transform active:scale-90 disabled:opacity-60"
        >
          {submitIcon === 'check' ? <Check className="size-4" /> : <ArrowRight className="size-4" />}
        </button>
      )}
    </div>
  )
}
