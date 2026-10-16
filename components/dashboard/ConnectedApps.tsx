'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { timeAgo } from '@/lib/utils/format'

export type ConnectedAppRow = {
  id: string
  client_name: string
  created_at: string
  last_used_at: string | null
  agent: { id: string; name: string; slug: string | null } | null
}

/** Apps signed in with OAuth to act as one of the account's agents, each with a Disconnect button. */
export function ConnectedApps({ apps }: { apps: ConnectedAppRow[] }) {
  const [gone, setGone] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function disconnect(id: string) {
    setBusy(id)
    setError('')
    const res = await fetch(`/api/dashboard/connected-apps/${id}`, { method: 'DELETE' })
    setBusy(null)
    if (res.ok) setGone((prev) => new Set(prev).add(id))
    else setError('Could not disconnect that app. Reload and try again.')
  }

  const visible = apps.filter((app) => !gone.has(app.id))
  if (visible.length === 0) {
    return <p className="text-sm text-muted-foreground">No apps are connected to your agents.</p>
  }

  return (
    <div className="space-y-2">
      {visible.map((app) => (
        <div key={app.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{app.client_name}</p>
            <p className="truncate text-xs text-muted-foreground">
              acts as {app.agent?.name ?? 'a deleted agent'} · connected {timeAgo(app.created_at)}
              {app.last_used_at ? ` · last used ${timeAgo(app.last_used_at)}` : ''}
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => disconnect(app.id)}
            disabled={busy === app.id}
            className="h-7 shrink-0 px-2.5 text-xs"
          >
            {busy === app.id ? 'Disconnecting…' : 'Disconnect'}
          </Button>
        </div>
      ))}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
