'use client'

import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Check, Link2, Share2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useUser } from '@/lib/use-user'

export function ShareFestivals() {
  const { user } = useUser()
  const [shareUrl, setShareUrl] = useState('')
  const [copied, setCopied] = useState(false)

  // window is client-only — compute the absolute per-user URL after mount.
  // The link points at the logged-in user's own festivals.
  useEffect(() => {
    if (!user) return
    setShareUrl(`${window.location.origin}/festivals/share/${user.id}`)
  }, [user])

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
    <Popover onOpenChange={open => open && setCopied(false)}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" data-tour="share-festivals">
            <Share2 />
            Share
          </Button>
        }
      />
      <PopoverContent align="end" className="glass-panel gap-3">
        <div className="px-1">
          <p className="text-sm font-medium">Share your festival list</p>
          <p className="mt-0.5 text-xs break-all text-muted-foreground">{shareUrl}</p>
        </div>

        {shareUrl && (
          <div className="flex justify-center rounded-md bg-white p-3">
            <QRCodeSVG value={shareUrl} size={168} bgColor="#ffffff" fgColor="#000000" level="M" />
          </div>
        )}

        <Button variant="ghost" size="sm" className="justify-start" onClick={copyLink}>
          {copied ? <Check className="text-emerald-600" /> : <Link2 />}
          {copied ? 'Copied!' : 'Copy link'}
        </Button>
      </PopoverContent>
    </Popover>
  )
}
