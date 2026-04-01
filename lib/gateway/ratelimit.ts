import { supabaseAdmin } from '@/lib/supabase/admin'

// ─── Trust levels ──────────────────────────────────────────────────────────

export type TrustLevel = 'connected' | 'verified' | 'unverified'

/**
 * Rate limit windows per trust level.
 *
 * unverified — 1 request per 5 minutes (exploratory access only)
 * verified   — 1 request per minute    + Extended Agent Card access
 * connected  — 300 requests per minute  + full capabilities
 */
const LIMITS: Record<
  TrustLevel,
  { windowMs: number; maxRequests: number; perDay: number; label: string }
> = {
  connected:  { windowMs: 60_000, maxRequests: 300, perDay: 10_000, label: '300 req/min' },
  verified:   { windowMs: 60_000, maxRequests: 5,   perDay: 1_000,  label: '5 req/min'   },
  unverified: { windowMs: 60_000, maxRequests: 1,   perDay: 5,      label: '1 req/min'   },
}

/**
 * Capabilities unlocked at each trust level.
 * Each level includes all capabilities of the levels below it.
 */
export const CAPABILITIES: Record<TrustLevel, string[]> = {
  unverified: ['send_message'],
  verified:   ['send_message', 'extended_agent_card'],
  connected:  ['send_message', 'extended_agent_card', 'priority_routing'],
}

export function hasCapability(
  trustLevel: TrustLevel,
  capability: string
): boolean {
  return CAPABILITIES[trustLevel].includes(capability)
}

// ─── Determine trust level between two agents ─────────────────────────────

export async function getTrustLevel(
  callerAgentId: string,
  targetAgentId: string
): Promise<TrustLevel> {
  const [{ data: connection }, { data: caller }] = await Promise.all([
    supabaseAdmin
      .from('agent_connections')
      .select('status')
      .or(
        `and(requester_id.eq.${callerAgentId},target_id.eq.${targetAgentId}),` +
        `and(requester_id.eq.${targetAgentId},target_id.eq.${callerAgentId})`
      )
      .eq('status', 'connected')
      .maybeSingle(),
    supabaseAdmin
      .from('agents')
      .select('is_verified')
      .eq('id', callerAgentId)
      .single(),
  ])

  if (connection) return 'connected'
  if (caller?.is_verified) return 'verified'
  return 'unverified'
}

// ─── Rate limit check ─────────────────────────────────────────────────────

export async function checkRateLimit(
  callerAgentId: string,
  targetAgentId: string,
  trustLevel: TrustLevel
): Promise<{ allowed: boolean; reason?: string; retryAfter?: number }> {
  const limits = LIMITS[trustLevel]
  const now = Date.now()

  const windowStart = new Date(now - limits.windowMs).toISOString()
  const oneDayAgo   = new Date(now - 86_400_000).toISOString()

  const [{ count: windowCount }, { count: dayCount }] = await Promise.all([
    supabaseAdmin
      .from('proxy_calls')
      .select('*', { count: 'exact', head: true })
      .eq('caller_agent_id', callerAgentId)
      .eq('target_agent_id', targetAgentId)
      .gte('called_at', windowStart),

    supabaseAdmin
      .from('proxy_calls')
      .select('*', { count: 'exact', head: true })
      .eq('caller_agent_id', callerAgentId)
      .eq('target_agent_id', targetAgentId)
      .gte('called_at', oneDayAgo),
  ])

  if ((windowCount ?? 0) >= limits.maxRequests) {
    const retryAfter = Math.ceil(limits.windowMs / 1000)
    return {
      allowed: false,
      reason: `Rate limit exceeded: ${limits.label} for trust level "${trustLevel}". Connect with this agent for higher limits.`,
      retryAfter,
    }
  }

  if ((dayCount ?? 0) >= limits.perDay) {
    return {
      allowed: false,
      reason: `Daily rate limit exceeded for trust level "${trustLevel}".`,
      retryAfter: 3600,
    }
  }

  return { allowed: true }
}

export { LIMITS }
