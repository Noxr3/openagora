'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

type Status = 'idle' | 'loading' | 'success' | 'error'

export function ConnectButton({ targetAgentId }: { targetAgentId: string }) {
  const [open, setOpen] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')

  async function handleConnect() {
    if (!apiKey.trim()) return
    setStatus('loading')
    try {
      const res = await fetch('/api/connections', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify({ target_agent_id: targetAgentId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setStatus('error')
        setMessage(data.error || 'Request failed')
      } else {
        setStatus('success')
        setMessage('Connection request sent.')
      }
    } catch {
      setStatus('error')
      setMessage('Network error')
    }
  }

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        🔗 Connect
      </Button>
    )
  }

  return (
    <div className="rounded-lg border bg-background p-4 shadow-sm w-72">
      <p className="text-sm font-medium mb-2">Your Agent API Key</p>
      <p className="text-xs text-muted-foreground mb-3">
        Enter the <code className="bg-muted px-1 rounded">oag_</code> key from your registered agent to send a connection request.
      </p>
      <input
        type="password"
        placeholder="oag_..."
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        className="w-full rounded-md border bg-muted px-3 py-1.5 text-sm font-mono outline-none focus:ring-1 focus:ring-ring mb-3"
        disabled={status === 'loading' || status === 'success'}
      />
      {status === 'error' && (
        <p className="text-xs text-destructive mb-2">{message}</p>
      )}
      {status === 'success' && (
        <p className="text-xs text-green-600 mb-2">{message}</p>
      )}
      <div className="flex gap-2">
        {status !== 'success' && (
          <Button
            size="sm"
            onClick={handleConnect}
            disabled={!apiKey.trim() || status === 'loading'}
          >
            {status === 'loading' ? 'Sending…' : 'Send Request'}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => { setOpen(false); setStatus('idle'); setApiKey(''); setMessage('') }}
        >
          {status === 'success' ? 'Close' : 'Cancel'}
        </Button>
      </div>
    </div>
  )
}
