'use client'

import { cn } from '@/lib/utils'
import { sourceBadgeClass } from '@/lib/sources'
import { Badge } from '@/components/ui/badge'

type Props = {
  sources: string[]
  sourceSite: string
  sourceUrl: string
}

/**
 * Renders a show's sources as coloured, clickable chips. Client island so it
 * can be dropped into server-rendered pages (Badge relies on a hook).
 */
export function SourceBadges({ sources, sourceSite, sourceUrl }: Props) {
  const list = (sources?.length ? sources : [sourceSite]).filter(Boolean)

  return (
    <div className="flex flex-wrap gap-1.5">
      {list.map(src => (
        <Badge
          key={src}
          className={cn('cursor-pointer', sourceBadgeClass(src))}
          render={
            <a href={sourceUrl} target="_blank" rel="noopener noreferrer" />
          }
        >
          {src}
        </Badge>
      ))}
    </div>
  )
}
