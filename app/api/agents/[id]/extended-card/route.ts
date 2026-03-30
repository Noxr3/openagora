import { supabaseAdmin } from '@/lib/supabase/admin'
import { resolveApiKey } from '@/lib/gateway/auth'
import { getTrustLevel, hasCapability } from '@/lib/gateway/ratelimit'

/**
 * GET /api/agents/{id}/extended-card
 *
 * Returns the Extended Agent Card — includes private contact info, detailed
 * authentication requirements, and full payment scheme configuration.
 *
 * Access: verified or connected trust level only (A2A §3.1.11 GetExtendedAgentCard)
 * Auth:   Authorization: Bearer oag_<key>
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // ── Authenticate caller ────────────────────────────────────────────────
  const caller = await resolveApiKey(request.headers.get('authorization'))
  if (!caller) {
    return Response.json(
      {
        error: 'Unauthorized',
        hint: 'Extended Agent Card requires a verified OpenAgora API key.',
      },
      {
        status: 401,
        headers: {
          'WWW-Authenticate':
            'Bearer realm="OpenAgora", scope="extended_agent_card"',
        },
      }
    )
  }

  // ── Check trust level ──────────────────────────────────────────────────
  const trustLevel = await getTrustLevel(caller.agentId, id)

  if (!hasCapability(trustLevel, 'extended_agent_card')) {
    return Response.json(
      {
        error: 'Forbidden',
        message:
          'Extended Agent Card requires "verified" or "connected" trust level. ' +
          'Send a connection request to this agent to gain access.',
        your_trust_level: trustLevel,
        required: ['verified', 'connected'],
      },
      { status: 403 }
    )
  }

  // ── Fetch full agent data ──────────────────────────────────────────────
  const { data: agent, error } = await supabaseAdmin
    .from('agents')
    .select('*, agent_skills(*)')
    .eq('id', id)
    .single()

  if (error || !agent) {
    return Response.json({ error: 'Agent not found' }, { status: 404 })
  }

  // ── Fetch connection details between caller and target ─────────────────
  const { data: connection } = await supabaseAdmin
    .from('agent_connections')
    .select('id, status, created_at')
    .or(
      `and(requester_id.eq.${caller.agentId},target_id.eq.${id}),` +
      `and(requester_id.eq.${id},target_id.eq.${caller.agentId})`
    )
    .maybeSingle()

  // ── Build extended card ────────────────────────────────────────────────
  const extendedCard = {
    // Standard A2A AgentCard fields
    name:         agent.name,
    description:  agent.description,
    url:          agent.url,
    version:      '1.0.0',
    provider:     { organization: agent.provider },
    capabilities: {
      streaming:              false,
      pushNotifications:      false,
      stateTransitionHistory: false,
    },
    skills: (agent.agent_skills ?? []).map(
      (s: { id: string; name: string; description: string; tags: string[] }) => ({
        id:          s.id,
        name:        s.name,
        description: s.description,
        tags:        s.tags,
      })
    ),

    // Extended fields (verified+ only)
    'x-openagora': {
      agent_id:       agent.id,
      health_status:  agent.health_status,
      payment_schemes: agent.payment_schemes ?? [],
      trust_level:    trustLevel,
      connection:     connection ?? null,
      gateway_url:    `${process.env.NEXT_PUBLIC_BASE_URL}/api/proxy/${agent.id}`,
      retrieved_at:   new Date().toISOString(),
    },
  }

  return Response.json(extendedCard, {
    headers: {
      'Cache-Control':          'private, no-store',
      'X-OpenAgora-Trust-Level': trustLevel,
    },
  })
}
