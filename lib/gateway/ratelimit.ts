import { supabaseAdmin } from '@/lib/supabase/admin'

// ─── Trust levels and their rate limits ───────────────────────────────────

export type TrustLevel = 'connected' | 'verified' | 'unverified'

const LIMITS: Record<TrustLevel, { perMinute: number; perDay: number }> = {
  connected:  { perMinute: 300, perDay: 10_000 },
  verified:   { perMinute: 60,  perDay: 1_000  },
  unverified: { perMinute: 10,  perDay: 100    },
}

// ─── Determine trust level between two agents ─────────────────────────────

export async function getTrustLevel(
  callerAgentId: string,
  targetAgentId: string
): Promise<TrustLevel> {
  const { data } = await supabaseAdmin
    .from('agent_connections')
    .select('status')
    .or(
      `and(requester_id.eq.${callerAgentId},target_id.eq.${targetAgentId}),` +
      `and(requester_id.eq.${targetAgentId},target_id.eq.${callerAgentId})`
    )
    .eq('status', 'connected')
    .maybeSingle()

  return data ? 'connected' : 'unverified'
}

// ─── Rate limit check ─────────────────────────────────────────────────────

export async function checkRateLimit(
  callerAgentId: string,
  targetAgentId: string,
  trustLevel: TrustLevel
): Promise<{ allowed: boolean; reason?: string; retryAfter?: number }> {
  const limits = LIMITS[trustLevel]
  const now = Date.now()

  const oneMinAgo  = new Date(now - 60_000).toISOString()
  const oneDayAgo  = new Date(now - 86_400_000).toISOString()

  const [{ count: minCount }, { count: dayCount }] = await Promise.all([
    supabaseAdmin
      .from('proxy_calls')
      .select('*', { count: 'exact', head: true })
      .eq('caller_agent_id', callerAgentId)
      .eq('target_agent_id', targetAgentId)
      .gte('called_at', oneMinAgo),

    supabaseAdmin
      .from('proxy_calls')
      .select('*', { count: 'exact', head: true })
      .eq('caller_agent_id', callerAgentId)
      .eq('target_agent_id', targetAgentId)
      .gte('called_at', oneDayAgo),
  ])

  if ((minCount ?? 0) >= limits.perMinute) {
    return {
      allowed: false,
      reason: `Rate limit exceeded: ${limits.perMinute} req/min for trust level "${trustLevel}"`,
      retryAfter: 60,
    }
  }

  if ((dayCount ?? 0) >= limits.perDay) {
    return {
      allowed: false,
      reason: `Rate limit exceeded: ${limits.perDay} req/day for trust level "${trustLevel}"`,
      retryAfter: 3600,
    }
  }

  return { allowed: true }
}

export { LIMITS }
