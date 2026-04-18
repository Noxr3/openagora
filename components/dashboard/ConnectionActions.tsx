'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

export function ConnectionActions({ connectionId }: { connectionId: string }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle')
  const [result, setResult] = useState('')

  async function handleAction(action: 'accept' | 'decline' | 'block') {
    setStatus('loading')
    const res = await fetch(`/api/dashboard/connections/${connectionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    const data = await res.json()
    setStatus('done')
    setResult(res.ok ? data.status : data.error)
  }

  if (status === 'done') {
    return (
      <span className={`text-xs ${result === 'connected' ? 'text-green-600' : 'text-muted-foreground'}`}>
        {result === 'connected' ? '✓ Connected' : result === 'declined' ? '✗ Declined' : result}
      </span>
    )
  }

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <Button
        size="sm"
        onClick={() => handleAction('accept')}
        disabled={status === 'loading'}
        className="h-7 px-2.5 text-xs"
      >
        Accept
      </Button>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => handleAction('decline')}
        disabled={status === 'loading'}
        className="h-7 px-2.5 text-xs"
      >
        Decline
      </Button>
    </div>
  )
}
