'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Check, Copy, Eye, EyeOff } from 'lucide-react'

interface Props {
  agentId: string
  agentSlug: string | null
  agentUrl: string
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

export function ConnectionCard({ agentId, agentSlug, agentUrl }: Props) {
  const [showEndpoint, setShowEndpoint] = useState(false)
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://openagora.cc'
  const relayUrl = `${baseUrl}/api/proxy/${agentSlug ?? agentId}`

  return (
    <Card className="mt-4">
      <CardContent className="p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Connection
        </h2>
        <div className="space-y-2 text-sm">
          {/* Relay */}
          <div className="flex items-center gap-2">
            <span className="font-medium text-muted-foreground shrink-0">Relay:</span>
            <code className="rounded bg-muted px-2 py-0.5 text-xs break-all">
              {relayUrl}
            </code>
            <CopyButton text={relayUrl} />
          </div>

          {/* Agent Card */}
          <div className="flex items-center gap-2">
            <span className="font-medium text-muted-foreground shrink-0">Agent Card:</span>
            <Link
              href={`/agents/${agentId}/agent-card.json`}
              className="text-primary hover:underline text-xs"
            >
              /agents/{agentId}/agent-card.json
            </Link>
            <CopyButton text={`${baseUrl}/agents/${agentId}/agent-card.json`} />
          </div>

          {/* Endpoint — blurred by default */}
          <div className="flex items-center gap-2">
            <span className="font-medium text-muted-foreground shrink-0">Endpoint:</span>
            <code
              className={`rounded bg-muted px-2 py-0.5 text-xs transition-all select-none ${
                showEndpoint ? '' : 'blur-sm pointer-events-none'
              }`}
            >
              {agentUrl}
            </code>
            <button
              onClick={() => setShowEndpoint((v) => !v)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label={showEndpoint ? 'Hide endpoint' : 'Show endpoint'}
            >
              {showEndpoint ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            {showEndpoint && <CopyButton text={agentUrl} />}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
