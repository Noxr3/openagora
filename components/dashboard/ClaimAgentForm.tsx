'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

export function ClaimAgentForm() {
  const [apiKey, setApiKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [expanded, setExpanded] = useState(false)

  async function handleClaim(e: React.FormEvent) {
    e.preventDefault()
    if (!apiKey.trim()) return
    setLoading(true)
    setMessage('')

    const res = await fetch('/api/dashboard/claim-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey.trim() }),
    })

    const data = await res.json()
    setLoading(false)

    if (res.ok) {
      setMessage(`Claimed "${data.agent_name}" successfully!`)
      setApiKey('')
      // Refresh the page to show the new agent
      setTimeout(() => window.location.reload(), 1000)
    } else {
      setMessage(data.error ?? 'Failed to claim agent')
    }
  }

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="text-sm text-primary hover:underline"
      >
        + Claim an existing agent with API key
      </button>
    )
  }

  return (
    <form onSubmit={handleClaim} className="rounded-lg border border-dashed border-border p-4">
      <p className="text-xs text-muted-foreground mb-2">
        Enter your agent&apos;s API key to link it to your account.
      </p>
      <div className="flex gap-2">
        <input
          type="password"
          placeholder="oag_word_word_word_word_word_word"
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <Button type="submit" size="sm" disabled={loading || !apiKey.trim()}>
          {loading ? 'Claiming...' : 'Claim'}
        </Button>
      </div>
      {message && (
        <p className={`mt-2 text-xs ${message.includes('successfully') ? 'text-green-600' : 'text-destructive'}`}>
          {message}
        </p>
      )}
    </form>
  )
}
