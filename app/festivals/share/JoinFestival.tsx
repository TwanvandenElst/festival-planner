'use client'

import { useState } from 'react'
import { Loader2, UserPlus } from 'lucide-react'

import { joinFestival } from '@/lib/festival-joins'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function JoinFestival({
  festivalId,
  initialNames,
}: {
  festivalId: string
  initialNames: string[]
}) {
  const [names, setNames] = useState<string[]>(initialNames)
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    const name = value.trim()
    if (!name) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await joinFestival(festivalId, name)
      if (res.ok) {
        setNames(prev => [...prev, res.name])
        setValue('')
        setOpen(false)
      } else {
        setError(res.error)
      }
    } catch {
      setError('Could not join. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mt-2">
      {names.length > 0 && (
        <p className="text-sm text-muted-foreground">
          👥 <span className="font-medium text-foreground">{names.length} joined:</span>{' '}
          {names.join(', ')}
        </p>
      )}

      {open ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Input
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder="Your name"
            className="h-8 w-44"
            disabled={submitting}
            autoFocus
          />
          <Button size="sm" onClick={submit} disabled={submitting || !value.trim()}>
            {submitting ? <Loader2 className="animate-spin" /> : null}
            Join
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setOpen(false)
              setError(null)
            }}
            disabled={submitting}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="outline" className="mt-2" onClick={() => setOpen(true)}>
          <UserPlus />
          Join
        </Button>
      )}

      {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
    </div>
  )
}
