'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Eye, EyeOff } from 'lucide-react'

interface Props {
  agentId: string
  agentUrl: string
}

export function ConnectionCard({ agentId, agentUrl }: Props) {
  const [showEndpoint, setShowEndpoint] = useState(false)
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://openagora.cc'

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
              {baseUrl}/api/proxy/{agentId}
            </code>
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
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
