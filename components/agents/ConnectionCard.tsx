'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Panel } from '@/components/ui/panel'
import { Check, Copy, Eye, EyeOff } from 'lucide-react'
import { BASE_URL } from '@/lib/brand'

interface Props {
  agentId: string
  agentSlug: string | null
  agentUrl: string
  paymentAddress?: string | null
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button
      onClick={copy}
      className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
      aria-label="Copy"
    >
      {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
    </button>
  )
}

export function ConnectionCard({ agentId, agentSlug, agentUrl, paymentAddress }: Props) {
  const [showEndpoint, setShowEndpoint] = useState(false)
  // The public origin, never window.location: the server and the browser must render the same text.
  const baseUrl = BASE_URL
  const relayUrl = `${baseUrl}/relay/${agentSlug ?? agentId}`

  const rows: { label: string; value: React.ReactNode; copy?: string }[] = [
    {
      label: 'Profile',
      value: <span className="break-all">{`${baseUrl.replace(/^https?:\/\//, '')}/agents/${agentSlug ?? agentId}`}</span>,
      copy: `${baseUrl}/agents/${agentSlug ?? agentId}`,
    },
    { label: 'Relay (A2A)', value: <code className="break-all text-xs">{relayUrl}</code>, copy: relayUrl },
    {
      label: 'Agent Card',
      value: (
        <Link href={`/agents/${agentId}/agent-card.json`} className="break-all text-primary hover:underline">
          agent-card.json
        </Link>
      ),
      copy: `${baseUrl}/agents/${agentId}/agent-card.json`,
    },
  ]

  return (
    <Panel className="p-5">
      <h2 className="text-base font-semibold">Contact info</h2>
      <dl className="mt-3 space-y-3 text-sm">
        {rows.map((row) => (
          <div key={row.label}>
            <dt className="font-semibold">{row.label}</dt>
            <dd className="mt-0.5 flex items-start gap-2 text-muted-foreground">
              <span className="min-w-0 flex-1">{row.value}</span>
              {row.copy && <CopyButton text={row.copy} />}
            </dd>
          </div>
        ))}
        <div>
          <dt className="font-semibold">Endpoint</dt>
          <dd className="mt-0.5 flex items-start gap-2 text-muted-foreground">
            <code className={`min-w-0 flex-1 break-all text-xs transition-all ${showEndpoint ? '' : 'pointer-events-none select-none blur-sm'}`}>
              {agentUrl}
            </code>
            <button
              onClick={() => setShowEndpoint((v) => !v)}
              className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
              aria-label={showEndpoint ? 'Hide endpoint' : 'Show endpoint'}
            >
              {showEndpoint ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            {showEndpoint && <CopyButton text={agentUrl} />}
          </dd>
        </div>
        {paymentAddress && (
          <div>
            <dt className="font-semibold">Payment address</dt>
            <dd className="mt-0.5 flex items-start gap-2 text-muted-foreground">
              <code className="min-w-0 flex-1 break-all text-xs">{paymentAddress}</code>
              <CopyButton text={paymentAddress} />
            </dd>
          </div>
        )}
      </dl>
    </Panel>
  )
}
