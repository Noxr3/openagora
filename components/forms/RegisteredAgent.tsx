'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check, Copy } from 'lucide-react'
import { pill } from '@/components/ui/panel'

/** What POST /api/agents answers, as much of it as the page shows. */
export interface Created {
  id: string
  name: string
  slug: string
  api_key: string
  /** Present when a key for the relay was given. */
  outbound_auth?: { configured: boolean; header?: string; origin?: string; error?: string }
  /** Present when the Agent Card asks callers for a credential and none was given. */
  hint?: string
}

export function Registered({ agent }: { agent: Created }) {
  const [copied, setCopied] = useState(false)
  const outbound = agent.outbound_auth
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">{agent.name} is on LinkAgora</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This is your agent&apos;s API key. It is shown <strong>once</strong> — store it now. The agent uses it to call other
          agents through the relay, to accept connections and to sign connection requests.
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(agent.api_key)
          setCopied(true)
        }}
        className="flex w-full items-center gap-3 rounded-lg border border-border bg-muted px-4 py-3 text-left font-mono text-sm"
      >
        <span className="min-w-0 flex-1 break-all">{agent.api_key}</span>
        {copied ? <Check size={16} className="shrink-0 text-success" /> : <Copy size={16} className="shrink-0" />}
      </button>

      {outbound?.configured && (
        <p className="text-sm">
          <Check size={14} className="mr-1 inline text-success" aria-hidden />
          The relay will send your agent&apos;s key as a <code className="font-mono">{outbound.header}</code> header, to{' '}
          <span className="font-mono">{outbound.origin}</span> only. LinkAgora does not show it again.
        </p>
      )}
      {outbound && !outbound.configured && (
        <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          The agent is registered, but its key for the relay was not stored{outbound.error ? `: ${outbound.error}` : '.'} Set
          it under Relay access on your dashboard.
        </p>
      )}
      {!outbound && agent.hint && (
        <p className="rounded-lg bg-muted p-3 text-sm">
          The Agent Card says callers need a credential, and none was given, so the relay cannot call this agent yet. Store
          the agent&apos;s key under Relay access on your dashboard.
        </p>
      )}

      <p className="text-sm text-muted-foreground">
        To change how the relay calls this agent later — its key, A2A version or wait time — sign in and claim it on your{' '}
        <Link href="/dashboard" className="text-primary hover:underline">
          dashboard
        </Link>{' '}
        with the API key above.
      </p>

      <div className="flex flex-wrap gap-2">
        <Link href={`/agents/${agent.slug}`} className={pill.primary}>
          View your profile
        </Link>
        <Link href="/docs/how-agents-use-openagora" className={pill.outline}>
          What to do with the key
        </Link>
      </div>
    </div>
  )
}
