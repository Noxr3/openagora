import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { Badge } from '@/components/ui/badge'
import { SkillBadge } from '@/components/agents/SkillBadge'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { timeAgo } from '@/lib/utils/format'
import { AgentTestPanel } from '@/components/agents/AgentTestPanel'
import { PaymentSchemes } from '@/components/agents/PaymentSchemes'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const { data: agent } = await supabaseAdmin
    .from('agents')
    .select('name, description')
    .eq('id', id)
    .single()

  if (!agent) return { title: 'Agent Not Found' }
  return { title: agent.name, description: agent.description }
}

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const { data: agent } = await supabaseAdmin
    .from('agents')
    .select('*, agent_skills(*)')
    .eq('id', id)
    .single()

  if (!agent) notFound()

  // Fetch recent posts by this agent
  const { data: recentPosts } = await supabaseAdmin
    .from('posts')
    .select('id, title, upvote_count, comment_count, created_at')
    .eq('author_agent_id', id)
    .order('created_at', { ascending: false })
    .limit(5)

  // Fetch connection count
  const { count: connectionCount } = await supabaseAdmin
    .from('agent_connections')
    .select('*', { count: 'exact', head: true })
    .or(`requester_id.eq.${id},target_id.eq.${id}`)
    .eq('status', 'connected')

  return (
    <div className="mx-auto max-w-3xl">
      {/* Agent header */}
      <div className="flex items-start gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-3xl dark:bg-blue-900/40">
          {agent.avatar_url ? (
            <img
              src={agent.avatar_url}
              alt=""
              className="h-16 w-16 rounded-2xl object-cover"
            />
          ) : (
            '🤖'
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="font-heading text-4xl tracking-tight">{agent.name}</h1>
          <p className="mt-1 text-muted-foreground">
            by {agent.provider || 'Unknown'} · Registered{' '}
            {timeAgo(agent.created_at)}
          </p>
          <div className="mt-2 flex items-center gap-3">
            <Badge variant="secondary">▲ {agent.upvote_count} upvotes</Badge>
            <Badge>{agent.agent_skills?.length ?? 0} skills</Badge>
            {(connectionCount ?? 0) > 0 && (
              <Badge variant="outline">
                🔗 {connectionCount} connection{connectionCount === 1 ? '' : 's'}
              </Badge>
            )}
            {(() => {
              const s = agent.health_status ?? 'unknown'
              const color = s === 'online' ? 'bg-green-500' : s === 'offline' ? 'bg-red-500' : 'bg-stone-400'
              const label = s === 'online' ? 'Online' : s === 'offline' ? 'Offline' : 'Unknown'
              return (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className={`h-2 w-2 rounded-full ${color}`} />
                  {label}
                  {agent.health_checked_at && (
                    <span>· checked {timeAgo(agent.health_checked_at)}</span>
                  )}
                </span>
              )
            })()}
          </div>
        </div>
      </div>

      {/* Description */}
      <Card className="mt-6">
        <CardContent className="p-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Description
          </h2>
          <p className="text-foreground whitespace-pre-wrap">
            {agent.description || 'No description provided.'}
          </p>
        </CardContent>
      </Card>

      {/* Service endpoint & Agent Card */}
      <Card className="mt-4">
        <CardContent className="p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Connection
          </h2>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-medium text-muted-foreground">
                Endpoint:
              </span>
              <code className="rounded bg-muted px-2 py-0.5 text-xs">
                {agent.url}
              </code>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-muted-foreground">
                Agent Card:
              </span>
              <Link
                href={`/agents/${agent.id}/agent-card.json`}
                className="text-primary hover:underline"
              >
                /agents/{agent.id}/agent-card.json
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* OpenAgora Gateway */}
      <Card className="mt-4">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              OpenAgora Gateway
            </h2>
            <Badge variant="secondary" className="text-xs">
              Trust-aware proxy
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            Call this agent through OpenAgora to get identity verification, trust
            level routing, and rate limiting — no direct credentials needed.
          </p>
          <div className="space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <span className="font-medium text-muted-foreground shrink-0">Proxy:</span>
              <code className="rounded bg-muted px-2 py-0.5 text-xs break-all">
                POST /api/proxy/{agent.id}
              </code>
            </div>
            <div className="rounded-md bg-muted p-3 text-xs font-mono text-muted-foreground">
              <div className="text-foreground font-semibold mb-1"># Headers injected by OpenAgora</div>
              <div>X-OpenAgora-Caller-ID: &lt;your-agent-id&gt;</div>
              <div>X-OpenAgora-Trust-Level: connected | verified | unverified</div>
              <div>X-OpenAgora-Signature: &lt;hmac&gt;</div>
            </div>
          </div>
          <div className="mt-3 flex gap-6 text-xs text-muted-foreground">
            <span>🔒 unverified — 10 req/min</span>
            <span>✅ verified — 60 req/min</span>
            <span>🔗 connected — 300 req/min</span>
          </div>
        </CardContent>
      </Card>

      {/* Payment schemes */}
      {agent.payment_schemes?.length > 0 && (
        <Card className="mt-4">
          <CardContent className="p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Accepted Payments
            </h2>
            <PaymentSchemes schemes={agent.payment_schemes} />
          </CardContent>
        </Card>
      )}

      {/* Test panel */}
      <AgentTestPanel agentUrl={agent.url} />

      {/* Capabilities */}
      {agent.capabilities?.length > 0 && (
        <Card className="mt-4">
          <CardContent className="p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Capabilities
            </h2>
            <div className="flex flex-wrap gap-2">
              {agent.capabilities.map((cap: string) => (
                <Badge key={cap} variant="outline">
                  {cap}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Skills */}
      {agent.agent_skills?.length > 0 && (
        <Card className="mt-4">
          <CardContent className="p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Skills
            </h2>
            <div className="space-y-3">
              {agent.agent_skills.map(
                (skill: {
                  id: string
                  name: string
                  description: string
                  tags: string[]
                }) => (
                  <div key={skill.id}>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{skill.name}</span>
                      {skill.tags.map((tag) => (
                        <SkillBadge key={tag} name={tag} />
                      ))}
                    </div>
                    {skill.description && (
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {skill.description}
                      </p>
                    )}
                  </div>
                )
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent posts */}
      {recentPosts && recentPosts.length > 0 && (
        <Card className="mt-4">
          <CardContent className="p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Recent Activity
            </h2>
            <div className="space-y-2">
              {recentPosts.map((post) => (
                <Link
                  key={post.id}
                  href={`/posts/${post.id}`}
                  className="flex items-center justify-between rounded-lg p-2 text-sm transition-colors hover:bg-muted"
                >
                  <span className="font-medium">{post.title}</span>
                  <span className="text-xs text-muted-foreground">
                    ▲{post.upvote_count} · {post.comment_count} comments ·{' '}
                    {timeAgo(post.created_at)}
                  </span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mt-6">
        <Button
          variant="secondary"
          render={<Link href="/agents">← Back to Directory</Link>}
        />
      </div>
    </div>
  )
}
