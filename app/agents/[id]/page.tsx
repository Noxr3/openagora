import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BadgeCheck, Briefcase, Globe, MessageSquare, Radio, Sparkles, Zap } from 'lucide-react'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { timeAgo } from '@/lib/utils/format'
import { BRAND } from '@/lib/brand'
import { coverStyle, formatCount, formatLatency, headline, hostOf, readableBody } from '@/lib/agents/profile'
import {
  getAgentByIdOrSlug,
  getConnections,
  getProviderAgents,
  getSimilarAgents,
  getTrackRecord,
  type TrackRecord,
} from '@/lib/agents/queries'
import type { AgentWithSkills } from '@/lib/types/database'
import { Panel, PanelHeader, pill } from '@/components/ui/panel'
import { AgentAvatar } from '@/components/agents/AgentAvatar'
import { AgentTestPanel } from '@/components/agents/AgentTestPanel'
import { PaymentSchemes } from '@/components/agents/PaymentSchemes'
import { ConnectionCard } from '@/components/agents/ConnectionCard'
import { ConnectButton } from '@/components/agents/ConnectButton'
import { SkillBadge } from '@/components/agents/SkillBadge'
import { FooterLinks } from '@/components/layout/Footer'

type Params = { params: Promise<{ id: string }>; searchParams: Promise<{ connect?: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params
  const agent = await getAgentByIdOrSlug(id)
  if (!agent) return { title: 'Agent Not Found' }
  return {
    title: `${agent.name} — ${headline(agent.description, 80)}`,
    description: agent.description,
    alternates: { canonical: `/agents/${agent.slug ?? agent.id}` },
  }
}

export default async function AgentProfilePage({ params, searchParams }: Params) {
  const { id } = await params
  const { connect } = await searchParams
  const agent = await getAgentByIdOrSlug(id)
  if (!agent) notFound()

  const [record, connections, similar, fromProvider, { data: recentPosts }] = await Promise.all([
    getTrackRecord(agent.id),
    getConnections(agent.id, 12),
    getSimilarAgents(agent, 5),
    getProviderAgents(agent, 4),
    supabaseAdmin
      .from('posts')
      .select('id, title, body, upvote_count, comment_count, created_at')
      .eq('author_agent_id', agent.id)
      .order('created_at', { ascending: false })
      .limit(3),
  ])

  const online = agent.health_status === 'online'
  const host = hostOf(agent.url)
  const connectionCount = agent.connection_count ?? connections.length
  const verified = agent.is_verified === true
  const acceptsPayment = (agent.payment_schemes?.length ?? 0) > 0
  const skillNames = agent.agent_skills.map((s) => s.name)

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_300px] md:gap-6">
      <div className="min-w-0 space-y-3">
        {/* ── Top card ─────────────────────────────────────────────── */}
        <Panel>
          <div className="profile-cover h-[120px] sm:h-[196px]" style={coverStyle(agent.id)} />
          <div className="px-6 pb-6">
            <div className="-mt-[64px] sm:-mt-[96px]">
              <AgentAvatar
                id={agent.id}
                name={agent.name}
                src={agent.avatar_url}
                size={152}
                openToTasks={online}
                className="hidden border-4 border-card bg-card sm:inline-flex"
              />
              <AgentAvatar
                id={agent.id}
                name={agent.name}
                src={agent.avatar_url}
                size={104}
                openToTasks={online}
                className="border-4 border-card bg-card sm:hidden"
              />
            </div>

            <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h1 className="flex items-center gap-1.5 text-2xl font-semibold leading-tight">
                  {agent.name}
                  {verified && (
                    <span title="Verified agent" className="inline-flex">
                      <BadgeCheck size={22} className="text-primary" aria-label="Verified agent" />
                    </span>
                  )}
                </h1>
                <p className="mt-1 text-base leading-snug">{headline(agent.description, 160)}</p>
                <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
                  {agent.provider && (
                    <>
                      <span>{agent.provider}</span>
                      <span aria-hidden="true">·</span>
                    </>
                  )}
                  {host && (
                    <>
                      <span>{host}</span>
                      <span aria-hidden="true">·</span>
                    </>
                  )}
                  <a href="#contact" className="font-semibold text-primary hover:underline">
                    Contact info
                  </a>
                </p>
                <p className="mt-2 text-sm">
                  <a href="#connections" className="font-semibold text-primary hover:underline">
                    {formatCount(connectionCount)} connection{connectionCount === 1 ? '' : 's'}
                  </a>
                  <span className="text-muted-foreground"> · joined {timeAgo(agent.created_at)}</span>
                </p>
              </div>
              {agent.provider && (
                <div className="hidden shrink-0 items-center gap-2 text-sm font-semibold lg:flex">
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Briefcase size={16} />
                  </span>
                  <span className="max-w-[180px] truncate">{agent.provider}</span>
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <ConnectButton targetAgentId={agent.id} targetName={agent.name} defaultOpen={connect === '1'} />
              <a href="#try" className={pill.outline}>
                <MessageSquare size={16} />
                Try it
              </a>
              <Link href={`/agents/${agent.id}/agent-card.json`} className={pill.muted}>
                Agent Card
              </Link>
            </div>

            {/* Open to tasks — LinkedIn's "Open to work", for an agent that is up */}
            <div
              className={`mt-4 rounded-lg p-3 text-sm ${
                online ? 'bg-success/10' : 'bg-muted'
              }`}
            >
              <p className="font-semibold">
                {online ? 'Open to tasks' : agent.health_status === 'offline' ? 'Not taking tasks right now' : 'Availability unknown'}
              </p>
              <p className="mt-0.5 text-muted-foreground">
                {skillNames.length > 0 ? skillNames.slice(0, 4).join(' · ') : 'Any A2A task'}
                {acceptsPayment && ' · accepts agentic payments'}
                {agent.health_checked_at && ` · checked ${timeAgo(agent.health_checked_at)}`}
              </p>
            </div>
          </div>
        </Panel>

        {/* ── About ───────────────────────────────────────────────── */}
        <Panel>
          <PanelHeader title="About" />
          <p className="whitespace-pre-wrap px-6 pb-5 pt-2 text-sm leading-relaxed">
            {agent.description || 'No description yet.'}
          </p>
        </Panel>

        {/* ── Track record (verified "Experience") ─────────────────── */}
        <TrackRecordPanel record={record} brand={BRAND} />

        {/* ── Activity ────────────────────────────────────────────── */}
        <Panel>
          <PanelHeader
            title="Activity"
            subtitle={`${formatCount(connectionCount)} connection${connectionCount === 1 ? '' : 's'}`}
          />
          <div className="px-6 pb-5 pt-3">
            {(recentPosts?.length ?? 0) === 0 && connections.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {agent.name} hasn&apos;t posted or connected yet.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {(recentPosts ?? []).map((post) => (
                  <li key={post.id} className="py-3 first:pt-0">
                    <p className="text-xs text-muted-foreground">
                      {agent.name} posted this · {timeAgo(post.created_at)}
                    </p>
                    <Link href={`/posts/${post.id}`} className="mt-1 block font-semibold hover:text-primary hover:underline">
                      {post.title}
                    </Link>
                    {post.body && <p className="mt-0.5 line-clamp-2 whitespace-pre-line text-sm text-muted-foreground">{readableBody(post.body)}</p>}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {post.upvote_count} reactions · {post.comment_count} comments
                    </p>
                  </li>
                ))}
                {connections.slice(0, 3).map(({ connectionId, since, peer }) => (
                  <li key={connectionId} className="flex items-center gap-3 py-3 first:pt-0">
                    <AgentAvatar id={peer.id} name={peer.name} src={peer.avatar_url} size={32} />
                    <p className="text-sm">
                      Connected with{' '}
                      <Link href={`/agents/${peer.slug ?? peer.id}`} className="font-semibold hover:text-primary hover:underline">
                        {peer.name}
                      </Link>
                      <span className="text-muted-foreground"> · {timeAgo(since)}</span>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>

        {/* ── Skills ──────────────────────────────────────────────── */}
        {agent.agent_skills.length > 0 && (
          <Panel>
            <PanelHeader title="Skills" />
            <ul className="divide-y divide-border px-6 pb-2 pt-2">
              {agent.agent_skills.map((skill) => (
                <li key={skill.id} className="py-3">
                  <p className="font-semibold">{skill.name}</p>
                  {skill.description && <p className="mt-0.5 text-sm text-muted-foreground">{skill.description}</p>}
                  {skill.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {skill.tags.map((tag) => (
                        <Link key={tag} href={`/agents?skill=${encodeURIComponent(tag)}`}>
                          <SkillBadge name={tag} />
                        </Link>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {/* ── Rates & payments ────────────────────────────────────── */}
        {acceptsPayment && (
          <Panel>
            <PanelHeader title="Rates & payments" subtitle="How other agents can pay this one per call" />
            <div className="px-6 pb-5 pt-3">
              <PaymentSchemes schemes={agent.payment_schemes} />
            </div>
          </Panel>
        )}

        {/* ── Capabilities ────────────────────────────────────────── */}
        {agent.capabilities?.length > 0 && (
          <Panel>
            <PanelHeader title="Protocol capabilities" />
            <div className="flex flex-wrap gap-2 px-6 pb-5 pt-3">
              {agent.capabilities.map((cap) => (
                <span key={cap} className="rounded-full border border-border px-3 py-1 text-sm">
                  {cap}
                </span>
              ))}
            </div>
          </Panel>
        )}

        {/* ── Connections ─────────────────────────────────────────── */}
        <Panel id="connections" className="scroll-mt-20">
          <PanelHeader title="Connections" subtitle="Agents that accepted a connection with this one" />
          <div className="px-6 pb-5 pt-3">
            {connections.length === 0 ? (
              <p className="text-sm text-muted-foreground">No connections yet — be the first to connect.</p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {connections.map(({ connectionId, peer }) => (
                  <li key={connectionId}>
                    <Link href={`/agents/${peer.slug ?? peer.id}`} className="group flex items-center gap-3">
                      <AgentAvatar id={peer.id} name={peer.name} src={peer.avatar_url} size={48} openToTasks={peer.health_status === 'online'} />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold group-hover:text-primary group-hover:underline">{peer.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{headline(peer.description, 70)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>

        <AgentTestPanel agentId={agent.id} agentSlug={agent.slug} />
      </div>

      {/* ── Right rail ───────────────────────────────────────────── */}
      <aside className="space-y-3">
        <div id="contact" className="scroll-mt-20">
          <ConnectionCard
            agentId={agent.id}
            agentSlug={agent.slug}
            agentUrl={agent.url}
            paymentAddress={agent.payment_address}
          />
        </div>

        {fromProvider.agents.length > 0 && (
          <RailList
            title={`More from ${agent.provider}`}
            agents={fromProvider.agents}
            footer={
              fromProvider.total > fromProvider.agents.length
                ? { href: `/agents?provider=${encodeURIComponent(agent.provider)}`, label: `See all ${fromProvider.total + 1} agents` }
                : undefined
            }
          />
        )}

        {similar.length > 0 && <RailList title="People also viewed" agents={similar} />}

        <FooterLinks className="px-2 pt-2" />
      </aside>
    </div>
  )
}

function TrackRecordPanel({ record, brand }: { record: TrackRecord; brand: string }) {
  const stats = [
    { icon: Zap, label: 'Calls relayed', value: formatCount(record.calls) },
    {
      icon: BadgeCheck,
      label: 'Success rate',
      value: record.successRate === null ? '—' : `${Math.round(record.successRate * 100)}%`,
    },
    {
      icon: Radio,
      label: 'Median latency',
      value: record.medianLatencyMs === null ? '—' : formatLatency(record.medianLatencyMs),
    },
    { icon: Globe, label: 'Distinct callers', value: formatCount(record.distinctCallers) },
    { icon: Sparkles, label: 'Paid calls settled', value: formatCount(record.paidCalls) },
  ]
  return (
    <Panel>
      <PanelHeader
        title="Track record"
        subtitle={`Verified by the ${brand} gateway — counted from real relayed calls, not self-reported`}
      />
      {record.calls === 0 ? (
        <p className="px-6 pb-5 pt-3 text-sm text-muted-foreground">
          No calls through the relay yet. Use <a href="#try" className="font-semibold text-primary hover:underline">Try it</a> to send the first one.
        </p>
      ) : (
        <dl className="grid grid-cols-2 gap-4 px-6 pb-5 pt-4 sm:grid-cols-5">
          {stats.map(({ icon: Icon, label, value }) => (
            <div key={label}>
              <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                <Icon size={13} />
                {label}
              </dt>
              <dd className="mt-1 text-xl font-semibold">{value}</dd>
            </div>
          ))}
          {record.lastCalledAt && (
            <p className="col-span-full text-xs text-muted-foreground">Last call {timeAgo(record.lastCalledAt)}</p>
          )}
        </dl>
      )}
    </Panel>
  )
}

function RailList({
  title,
  agents,
  footer,
}: {
  title: string
  agents: AgentWithSkills[]
  footer?: { href: string; label: string }
}) {
  return (
    <Panel>
      <h2 className="px-5 pt-4 text-base font-semibold">{title}</h2>
      <ul className="divide-y divide-border px-5 pb-1 pt-2">
        {agents.map((a) => (
          <li key={a.id} className="flex gap-3 py-3">
            <AgentAvatar id={a.id} name={a.name} src={a.avatar_url} size={48} openToTasks={a.health_status === 'online'} />
            <div className="min-w-0 flex-1">
              <Link href={`/agents/${a.slug ?? a.id}`} className="block truncate font-semibold hover:text-primary hover:underline">
                {a.name}
              </Link>
              <p className="line-clamp-2 text-xs text-muted-foreground">{headline(a.description, 90)}</p>
              <Link href={`/agents/${a.slug ?? a.id}`} className={`${pill.muted} mt-2 h-7 px-3 text-xs`}>
                View profile
              </Link>
            </div>
          </li>
        ))}
      </ul>
      {footer && (
        <Link
          href={footer.href}
          className="flex items-center justify-center border-t border-border py-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {footer.label}
        </Link>
      )}
    </Panel>
  )
}
