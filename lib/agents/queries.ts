import { cache } from 'react'
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { AgentWithSkills } from '@/lib/types/database'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * A profile is reachable by id or by its vanity slug: /agents/del.
 * Wrapped in React `cache` so metadata and the page share one query.
 */
export const getAgentByIdOrSlug = cache(async (idOrSlug: string) => {
  const column = UUID_RE.test(idOrSlug) ? 'id' : 'slug'
  const { data } = await supabaseAdmin
    .from('agents')
    .select('*, agent_skills(*)')
    .eq(column, idOrSlug.toLowerCase())
    .maybeSingle()
  return data as AgentWithSkills | null
})

export interface TrackRecord {
  calls: number
  successRate: number | null
  medianLatencyMs: number | null
  distinctCallers: number
  paidCalls: number
  lastCalledAt: string | null
}

/**
 * Experience that nobody typed in: what the LinkAgora gateway itself saw.
 * Every call relayed to this agent is in proxy_calls, every paid one in
 * payments — so this section cannot be padded the way a résumé can.
 */
export async function getTrackRecord(agentId: string): Promise<TrackRecord> {
  const [{ data: calls }, { count: paidCalls }] = await Promise.all([
    supabaseAdmin
      .from('proxy_calls')
      .select('status_code, latency_ms, caller_agent_id, called_at')
      .eq('target_agent_id', agentId)
      .order('called_at', { ascending: false })
      .limit(1000),
    supabaseAdmin
      .from('payments')
      .select('id', { count: 'exact', head: true })
      .eq('target_agent_id', agentId)
      .eq('status', 'settled'),
  ])

  const rows = calls ?? []
  const answered = rows.filter((r) => typeof r.status_code === 'number')
  const ok = answered.filter((r) => r.status_code! >= 200 && r.status_code! < 400)
  const latencies = rows
    .map((r) => r.latency_ms)
    .filter((v): v is number => typeof v === 'number')
    .sort((a, b) => a - b)

  return {
    calls: rows.length,
    successRate: answered.length ? ok.length / answered.length : null,
    medianLatencyMs: latencies.length ? latencies[Math.floor(latencies.length / 2)] : null,
    distinctCallers: new Set(rows.map((r) => r.caller_agent_id).filter(Boolean)).size,
    paidCalls: paidCalls ?? 0,
    lastCalledAt: rows[0]?.called_at ?? null,
  }
}

export type ConnectionPeer = { id: string; name: string; avatar_url: string | null; slug: string | null; description: string; health_status: string }

/** Accepted connections, newest first, as the agents on the other side. */
export async function getConnections(agentId: string, limit = 12) {
  const { data } = await supabaseAdmin
    .from('agent_connections')
    .select(
      `id, resolved_at, created_at, requester_id, target_id,
       requester:agents!requester_id(id, name, avatar_url, slug, description, health_status),
       target:agents!target_id(id, name, avatar_url, slug, description, health_status)`,
    )
    .or(`requester_id.eq.${agentId},target_id.eq.${agentId}`)
    .eq('status', 'connected')
    .order('resolved_at', { ascending: false, nullsFirst: false })
    .limit(limit)

  return (data ?? []).map((row) => {
    const other = (row.requester_id === agentId ? row.target : row.requester) as unknown as ConnectionPeer
    return { connectionId: row.id as string, since: (row.resolved_at ?? row.created_at) as string, peer: other }
  })
}

/**
 * "People also viewed": agents that share skill tags or a provider with this
 * one, scored by overlap. Pool is the most recent registrations, which is
 * plenty while the network is young and keeps the page one query.
 */
export async function getSimilarAgents(agent: AgentWithSkills, limit = 5) {
  const { data } = await supabaseAdmin
    .from('agents')
    .select('*, agent_skills(*)')
    .neq('id', agent.id)
    .order('created_at', { ascending: false })
    .limit(120)

  const myTags = new Set(agent.agent_skills.flatMap((s) => s.tags.map((t) => t.toLowerCase())))
  const provider = agent.provider?.trim().toLowerCase()

  return ((data ?? []) as AgentWithSkills[])
    .map((other) => {
      const tags = other.agent_skills.flatMap((s) => s.tags.map((t) => t.toLowerCase()))
      const shared = tags.filter((t) => myTags.has(t)).length
      const sameProvider = provider && other.provider?.trim().toLowerCase() === provider ? 1 : 0
      const online = other.health_status === 'online' ? 0.5 : 0
      return { other, score: shared * 2 + sameProvider * 1.5 + online }
    })
    .filter((x) => x.score > 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.other)
}

/** Other agents published under the same provider — the "company" view. */
export async function getProviderAgents(agent: AgentWithSkills, limit = 4) {
  const provider = agent.provider?.trim()
  if (!provider) return { agents: [] as AgentWithSkills[], total: 0 }
  const { data, count } = await supabaseAdmin
    .from('agents')
    .select('*, agent_skills(*)', { count: 'exact' })
    .eq('provider', provider)
    .neq('id', agent.id)
    .order('upvote_count', { ascending: false })
    .limit(limit)
  return { agents: (data ?? []) as AgentWithSkills[], total: count ?? 0 }
}
