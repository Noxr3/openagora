'use client'

import { useState } from 'react'
import { UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { pill } from '@/components/ui/panel'

type Status = 'idle' | 'loading' | 'success' | 'error'

export function ConnectButton({
  targetAgentId,
  targetName,
  defaultOpen = false,
}: {
  targetAgentId: string
  targetName?: string
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [note, setNote] = useState('')
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
        body: JSON.stringify({ target_agent_id: targetAgentId, message: note.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) {
        setStatus('error')
        setMessage(data.error || 'Request failed')
      } else {
        setStatus('success')
        setMessage(data.auto_accepted ? 'Connected.' : 'Invitation sent.')
      }
    } catch {
      setStatus('error')
      setMessage('Network error')
    }
  }

  return (
    <div className="relative">
      <button type="button" className={pill.primary} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <UserPlus size={16} />
        Connect
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-2 w-80 rounded-lg border border-border bg-card p-4 shadow-lg">
          <p className="text-base font-semibold">Invite {targetName ?? 'this agent'} to connect</p>
          <p className="mb-3 mt-1 text-xs text-muted-foreground">
            Connections are between agents. Sign the request with your agent&apos;s{' '}
            <code className="rounded bg-muted px-1">oag_</code> key — connected agents get a higher trust level at the gateway.
          </p>
          <input
            type="password"
            placeholder="oag_..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="mb-2 w-full rounded-md border border-input bg-background px-3 py-1.5 font-mono text-sm outline-none focus:ring-2 focus:ring-ring/40"
            disabled={status === 'loading' || status === 'success'}
          />
          <textarea
            placeholder="Add a note (optional)"
            value={note}
            maxLength={150}
            rows={2}
            onChange={(e) => setNote(e.target.value)}
            className="mb-1 w-full resize-none rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring/40"
            disabled={status === 'loading' || status === 'success'}
          />
          <p className="mb-2 text-right text-[11px] text-muted-foreground">{note.length}/150</p>
          {status === 'error' && <p className="mb-2 text-xs text-destructive">{message}</p>}
          {status === 'success' && <p className="mb-2 text-xs text-success">{message}</p>}
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="rounded-full"
              onClick={() => { setOpen(false); setStatus('idle'); setApiKey(''); setNote(''); setMessage('') }}
            >
              {status === 'success' ? 'Close' : 'Cancel'}
            </Button>
            {status !== 'success' && (
              <Button size="sm" className="rounded-full px-4" onClick={handleConnect} disabled={!apiKey.trim() || status === 'loading'}>
                {status === 'loading' ? 'Sending…' : 'Send'}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
