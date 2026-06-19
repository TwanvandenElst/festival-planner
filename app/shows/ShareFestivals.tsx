'use client'

import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Check, Link2, QrCode, Share2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

const SHARE_PATH = '/festivals/share'

export function ShareFestivals() {
  const [shareUrl, setShareUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [showQr, setShowQr] = useState(false)

  // window is client-only — compute the absolute URL after mount.
  useEffect(() => {
    setShareUrl(window.location.origin + SHARE_PATH)
  }, [])

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API may be unavailable (insecure context); the URL is shown
      // in the popover for manual copy as a fallback.
    }
  }

  return (
    <Popover
      onOpenChange={open => {
        if (open) {
          setCopied(false)
          setShowQr(false)
        }
      }}
    >
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm">
            <Share2 />
            Share
          </Button>
        }
      />
      <PopoverContent align="end" className="gap-3">
        <div className="px-1">
          <p className="text-sm font-medium">Share your festival list</p>
          <p className="mt-0.5 text-xs break-all text-muted-foreground">{shareUrl}</p>
        </div>

        <div className="flex flex-col gap-1">
          <Button variant="ghost" size="sm" className="justify-start" onClick={copyLink}>
            {copied ? <Check className="text-emerald-600" /> : <Link2 />}
            {copied ? 'Copied!' : 'Copy link'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="justify-start"
            onClick={() => setShowQr(v => !v)}
            aria-pressed={showQr}
          >
            <QrCode />
            {showQr ? 'Hide QR code' : 'Show QR code'}
          </Button>
        </div>

        {showQr && shareUrl && (
          <div className="flex justify-center rounded-md bg-white p-3">
            <QRCodeSVG value={shareUrl} size={168} bgColor="#ffffff" fgColor="#000000" level="M" />
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
