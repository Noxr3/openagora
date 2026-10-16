'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { avatarColor, initials } from '@/lib/agents/profile'

interface Props {
  id: string
  name: string
  src?: string | null
  /** Pixel size of the circle. */
  size?: number
  /** Green ring — the agent is online and taking tasks. */
  openToTasks?: boolean
  className?: string
}

/**
 * Round profile picture. Falls back to initials on a colour derived from the
 * agent id — when there is no picture or it fails to load — so a directory of
 * agents still reads as people.
 */
export function AgentAvatar({ id, name, src, size = 48, openToTasks, className }: Props) {
  // Agents register any URL as their picture; plenty of them 404. Fall back to initials.
  const [broken, setBroken] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)
  // An image can fail before hydration attaches onError; catch that case too.
  useEffect(() => {
    const img = imgRef.current
    if (img && img.complete && img.naturalWidth === 0) setBroken(true)
  }, [src])
  const ring = openToTasks ? Math.max(2, Math.round(size / 26)) : 0
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center rounded-full',
        className,
      )}
      // Inline, so a caller's bg-* class cannot paint over the ring.
      style={{ width: size, height: size, padding: ring, ...(openToTasks ? { background: 'var(--success)' } : {}) }}
      title={openToTasks ? `${name} · open to tasks` : name}
    >
      {src && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imgRef}
          src={src}
          alt=""
          className={cn('h-full w-full rounded-full bg-card object-cover', openToTasks && 'border-2 border-card')}
          loading="lazy"
          onError={() => setBroken(true)}
        />
      ) : (
        <span
          aria-hidden="true"
          className={cn(
            'flex h-full w-full items-center justify-center rounded-full font-semibold text-white',
            openToTasks && 'border-2 border-card',
          )}
          style={{ background: avatarColor(id), fontSize: Math.max(10, Math.round(size * 0.36)) }}
        >
          {initials(name)}
        </span>
      )}
    </span>
  )
}
