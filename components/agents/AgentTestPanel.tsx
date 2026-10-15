'use client'

import { useRef, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Eye, EyeOff } from 'lucide-react'

interface AgentTestPanelProps {
  agentId: string
  agentSlug: string | null
}

interface A2AResponse {
  result?: {
    status?: { state: string }
    artifacts?: Array<{ parts: Array<{ type: string; text?: string }> }>
  }
  // JSON-RPC errors are objects; the relay's own refusals are { error, hint }.
  error?: { message: string } | string
  hint?: string
}

interface Turn {
  role: 'user' | 'agent'
  text: string
  isError?: boolean
}

export function AgentTestPanel({ agentId, agentSlug }: AgentTestPanelProps) {
  const sessionId = useRef(`session-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const bottomRef = useRef<HTMLDivElement>(null)

  const [input, setInput] = useState('')
  const ANON_KEY = process.env.NEXT_PUBLIC_ANON_API_KEY ?? ''
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [turns, setTurns] = useState<Turn[]>([])
  const [loading, setLoading] = useState(false)

  const relayPath = `/relay/${agentSlug ?? agentId}`

  async function send() {
    const text = input.trim()
    if (!text || loading) return

    const effectiveKey = apiKey.trim() || ANON_KEY
    if (!effectiveKey) {
      setTurns(prev => [...prev, { role: 'agent', text: 'Enter your LinkAgora API key to send messages.', isError: true }])
      return
    }

    setInput('')
    setLoading(true)
    setTurns(prev => [...prev, { role: 'user', text }])

    const taskId = `task-${Date.now()}`

    try {
      const res = await fetch(relayPath, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${effectiveKey}`,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: taskId,
          method: 'tasks/send',
          params: {
            id: taskId,
            sessionId: sessionId.current,
            message: {
              role: 'user',
              parts: [{ type: 'text', text }],
            },
          },
        }),
      })

      const data = (await res.json()) as A2AResponse

      if (data.error) {
        const message = typeof data.error === 'string' ? data.hint ?? data.error : data.error.message
        setTurns(prev => [...prev, { role: 'agent', text: message, isError: true }])
        return
      }

      const reply =
        data.result?.artifacts
          ?.flatMap(a => a.parts)
          .filter(p => p.type === 'text')
          .map(p => p.text)
          .join('\n')
          .trim() ||
        `(state: ${data.result?.status?.state ?? 'unknown'}, no text returned)`

      setTurns(prev => [...prev, { role: 'agent', text: reply }])
    } catch (err) {
      setTurns(prev => [
        ...prev,
        { role: 'agent', text: err instanceof Error ? err.message : 'Network error', isError: true },
      ])
    } finally {
      setLoading(false)
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
  }

  function clearSession() {
    sessionId.current = `session-${Date.now()}-${Math.random().toString(36).slice(2)}`
    setTurns([])
  }

  return (
    <Card id="try" className="scroll-mt-20 rounded-lg py-0 ring-border">
      <CardContent className="px-6 py-5">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Try it</h2>
          {turns.length > 0 && (
            <button
              onClick={clearSession}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              New session
            </button>
          )}
        </div>

        <p className="mb-3 text-sm text-muted-foreground">
          Send a live A2A message through the LinkAgora relay. Every call counts toward this agent&apos;s track record.
        </p>

        {/* API Key input */}
        <div className="mb-3 flex items-center gap-2">
          <input
            type={showKey ? 'text' : 'password'}
            placeholder={ANON_KEY ? 'API Key — optional, uses anon by default' : 'API Key (oag_...)'}
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 font-mono text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            onClick={() => setShowKey(v => !v)}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={showKey ? 'Hide key' : 'Show key'}
          >
            {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>

        {/* Conversation history */}
        {turns.length > 0 && (
          <div className="mb-4 max-h-96 space-y-3 overflow-y-auto rounded-md border bg-muted/30 p-3">
            {turns.map((turn, i) => (
              <div key={i} className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-md px-3 py-2 text-sm whitespace-pre-wrap ${
                    turn.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : turn.isError
                        ? 'border border-destructive/30 bg-destructive/10 text-destructive'
                        : 'border bg-card text-foreground'
                  }`}
                >
                  {turn.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1.5 rounded-md border bg-card px-3 py-2">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:0ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms]" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}

        {/* Input */}
        <Textarea
          rows={2}
          placeholder="Send a message to this agent…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send()
          }}
          disabled={loading}
          className="resize-none"
        />

        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="font-mono text-xs text-muted-foreground/50">
            via {relayPath}
          </span>
          <Button onClick={send} disabled={loading || !input.trim()} size="sm" className="rounded-full px-4">
            {loading ? (
              <>
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                Waiting…
              </>
            ) : (
              'Send'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
