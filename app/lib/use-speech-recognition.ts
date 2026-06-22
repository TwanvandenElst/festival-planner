'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// Minimal typing for the Web Speech API — it isn't in the standard TS DOM lib.
type RecognitionResultList = ArrayLike<ArrayLike<{ transcript: string }>>
type SpeechRecognitionLike = {
  lang: string
  interimResults: boolean
  continuous: boolean
  start: () => void
  stop: () => void
  onresult: ((e: { results: RecognitionResultList }) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
}

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/**
 * Thin wrapper around the Web Speech API. `onText` receives the cumulative
 * transcript for the current dictation session (interim + final), so callers
 * can append it to whatever was already in the field.
 */
export function useSpeechRecognition(onText: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const [supported, setSupported] = useState(false)
  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const onTextRef = useRef(onText)
  onTextRef.current = onText

  useEffect(() => {
    setSupported(getRecognitionCtor() !== null)
  }, [])

  const start = useCallback(() => {
    // Tapping again while listening stops the session (toggle).
    if (recRef.current) {
      recRef.current.stop()
      return
    }
    const Ctor = getRecognitionCtor()
    if (!Ctor) return

    const rec = new Ctor()
    rec.lang = 'nl-NL'
    rec.interimResults = true
    rec.continuous = false
    rec.onresult = e => {
      let transcript = ''
      for (let i = 0; i < e.results.length; i++) transcript += e.results[i][0].transcript
      onTextRef.current(transcript)
    }
    rec.onerror = () => {
      setListening(false)
      recRef.current = null
    }
    rec.onend = () => {
      setListening(false)
      recRef.current = null
    }
    recRef.current = rec
    setListening(true)
    rec.start()
  }, [])

  // Stop any active session on unmount.
  useEffect(() => () => recRef.current?.stop(), [])

  return { listening, supported, start }
}
