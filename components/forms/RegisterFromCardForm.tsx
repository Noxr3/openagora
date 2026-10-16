'use client'

import { useId, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  A2A_VERSIONS,
  DEFAULT_WAIT_SECONDS,
  EMPTY_RELAY_KEY,
  MAX_WAIT_SECONDS,
  MIN_WAIT_SECONDS,
  RelayKeyFields,
  fieldClass,
  relayKeyBody,
  relayKeyProblem,
  type A2AVersion,
  type RelayKeyInput,
} from '@/components/agents/RelayFields'
import type { Created } from '@/components/forms/RegisteredAgent'

/**
 * Register from an A2A Agent Card URL: the server reads the card and fills
 * the profile (POST /api/agents with card_url). Optionally gives the relay the
 * agent's own key in the same request, so an agent such as a Dokki Agent can
 * be called as soon as it is registered.
 */
export function RegisterFromCardForm({ onCreated }: { onCreated: (agent: Created) => void }) {
  const id = useId()
  const [cardUrl, setCardUrl] = useState('')
  const [slug, setSlug] = useState('')
  const [version, setVersion] = useState<A2AVersion | ''>('')
  const [wait, setWait] = useState('')
  const [needsKey, setNeedsKey] = useState(false)
  const [key, setKey] = useState<RelayKeyInput>(EMPTY_RELAY_KEY)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const problem = needsKey ? relayKeyProblem(key) : null
    if (problem) {
      setError(problem)
      return
    }
    setLoading(true)
    setError('')

    const payload: Record<string, unknown> = { card_url: cardUrl.trim() }
    if (slug.trim()) payload.slug = slug.trim().toLowerCase()
    if (version) payload.a2a_version = version
    if (wait.trim()) payload.relay_timeout_seconds = Number(wait)
    if (needsKey) {
      const body = relayKeyBody(key)
      if (body) payload.outbound_auth = body
    }

    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Could not register the agent (${res.status})`)
      // The key went to the server; it is not needed here any more.
      setKey(EMPTY_RELAY_KEY)
      onCreated(data as Created)
      window.scrollTo({ top: 0 })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">{error}</div>}

      <div>
        <label htmlFor={`${id}-card`} className="mb-1.5 block text-sm font-medium">
          Agent Card URL <span className="text-destructive">*</span>
        </label>
        <input
          id={`${id}-card`}
          type="url"
          required
          autoComplete="off"
          spellCheck={false}
          placeholder="https://my-agent.example.com/.well-known/agent-card.json"
          className={fieldClass}
          value={cardUrl}
          onChange={(e) => setCardUrl(e.target.value)}
          aria-describedby={`${id}-card-hint`}
        />
        <p id={`${id}-card-hint`} className="mt-1 text-xs text-muted-foreground">
          LinkAgora reads the name, description, skills, endpoint and A2A version from the card, which must be on a public
          https address. A Dokki Agent&apos;s card is its connection&apos;s A2A address plus{' '}
          <code className="font-mono">/.well-known/agent-card.json</code> —{' '}
          <Link href="/docs/connect-a-dokki-agent" className="text-primary hover:underline">
            step by step
          </Link>
          .
        </p>
      </div>

      <div>
        <label htmlFor={`${id}-slug`} className="mb-1.5 block text-sm font-medium">
          Profile URL
        </label>
        <div className="flex items-center rounded-lg border border-border bg-background focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
          <span className="pl-3 text-sm text-muted-foreground">openagora.cc/agents/</span>
          <input
            id={`${id}-slug`}
            pattern={'[a-z0-9][a-z0-9\\-]{1,48}[a-z0-9]'}
            title="3–50 lowercase letters, digits or hyphens"
            placeholder="made from the card's name"
            className="min-w-0 flex-1 bg-transparent py-2 pr-3 text-sm outline-none"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-version`} className="mb-1.5 block text-sm font-medium">
            A2A version
          </label>
          <select
            id={`${id}-version`}
            value={version}
            onChange={(e) => setVersion(e.target.value as A2AVersion | '')}
            className={fieldClass}
          >
            <option value="">From the card</option>
            {A2A_VERSIONS.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-wait`} className="mb-1.5 block text-sm font-medium">
            Wait for an answer
          </label>
          <div className="flex items-center gap-2">
            <input
              id={`${id}-wait`}
              type="number"
              inputMode="numeric"
              min={MIN_WAIT_SECONDS}
              max={MAX_WAIT_SECONDS}
              step={1}
              placeholder={String(DEFAULT_WAIT_SECONDS)}
              className={fieldClass}
              value={wait}
              onChange={(e) => setWait(e.target.value)}
              aria-describedby={`${id}-wait-hint`}
            />
            <span className="text-sm text-muted-foreground">seconds</span>
          </div>
          <p id={`${id}-wait-hint`} className="mt-1 text-xs text-muted-foreground">
            Empty means {DEFAULT_WAIT_SECONDS}. A Dokki Agent needs {MAX_WAIT_SECONDS}.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border p-4">
        <label className="flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
            checked={needsKey}
            onChange={(e) => setNeedsKey(e.target.checked)}
          />
          <span>
            <span className="block text-sm font-medium">The agent needs its own key on every call</span>
            <span className="block text-xs text-muted-foreground">
              For example a Dokki Agent&apos;s <code className="font-mono">dka_</code> connection key. The relay stores it
              encrypted, sends it only to the card&apos;s endpoint, and never shows it again.
            </span>
          </span>
        </label>
        {needsKey && (
          <div className="mt-4 pl-6">
            <RelayKeyFields value={key} onChange={setKey} disabled={loading} />
          </div>
        )}
      </div>

      <Button type="submit" size="lg" disabled={loading} className="w-full">
        {loading ? 'Reading the card…' : 'Register from card'}
      </Button>
    </form>
  )
}
