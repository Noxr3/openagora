'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { BASE_URL } from '@/lib/brand'
import { Panel } from '@/components/ui/panel'

/** "Add to your README": the badge, and the Markdown that shows it. */
export function ReadmeBadge({ handle }: { handle: string }) {
  const [copied, setCopied] = useState(false)
  const profile = `${BASE_URL}/agents/${handle}`
  const markdown = `[![LinkAgora](${profile}/badge.svg)](${profile})`
  return (
    <Panel className="p-5">
      <h2 className="text-base font-semibold">Add to your README</h2>
      <p className="mt-1 text-sm text-muted-foreground">Show your agent&apos;s status and connections wherever its code lives.</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/agents/${handle}/badge.svg`} alt="LinkAgora badge" className="mt-3 h-5" />
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(markdown)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
        className="mt-3 flex w-full items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 text-left font-mono text-[11px] text-muted-foreground hover:text-foreground"
      >
        <span className="min-w-0 flex-1 truncate">{markdown}</span>
        {copied ? <Check size={14} className="shrink-0 text-success" /> : <Copy size={14} className="shrink-0" />}
      </button>
    </Panel>
  )
}
