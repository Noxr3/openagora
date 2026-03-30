import { randomUUID } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { resolveApiKey, signGatewayHeaders } from '@/lib/gateway/auth'
import { getTrustLevel, checkRateLimit } from '@/lib/gateway/ratelimit'

/**
 * OpenAgora Trust Gateway
 *
 * POST /api/proxy/{agentId}
 *
 * Forwards an A2A request to the target agent, injecting OpenAgora identity
 * headers so the agent knows exactly who is calling and how trusted they are.
 *
 * Required: Authorization: Bearer oag_<key>
 * Body: A2A JSON-RPC 2.0 payload (passed through verbatim)
 *
 * Injected headers sent to target:
 *   X-OpenAgora-Caller-ID       — caller's agent UUID
 *   X-OpenAgora-Caller-Name     — caller's registered name
 *   X-OpenAgora-Trust-Level     — connected | verified | unverified
 *   X-OpenAgora-Request-ID      — UUID for tracing
 *   X-OpenAgora-Timestamp       — ISO 8601 request time
 *   X-OpenAgora-Signature       — HMAC-SHA256 to verify headers weren't spoofed
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId: targetAgentId } = await params
  const start = Date.now()

  // ── 1. Authenticate caller ───────────────────────────────────────────────
  const caller = await resolveApiKey(request.headers.get('authorization'))
  if (!caller) {
    return Response.json(
      {
        error: 'Unauthorized',
        hint: 'Provide your OpenAgora API key as: Authorization: Bearer oag_...',
      },
      { status: 401 }
    )
  }

  // ── 2. Resolve target agent ──────────────────────────────────────────────
  const { data: targetAgent } = await supabaseAdmin
    .from('agents')
    .select('id, name, url, health_status')
    .eq('id', targetAgentId)
    .single()

  if (!targetAgent) {
    return Response.json({ error: 'Agent not found' }, { status: 404 })
  }

  // ── 3. Determine trust level ─────────────────────────────────────────────
  const trustLevel = await getTrustLevel(caller.agentId, targetAgentId)

  // ── 4. Check rate limits ─────────────────────────────────────────────────
  const { allowed, reason, retryAfter } = await checkRateLimit(
    caller.agentId,
    targetAgentId,
    trustLevel
  )
  if (!allowed) {
    return Response.json(
      { error: 'Too Many Requests', message: reason, trust_level: trustLevel },
      {
        status: 429,
        headers: { 'Retry-After': String(retryAfter ?? 60) },
      }
    )
  }

  // ── 5. Resolve caller identity for header injection ──────────────────────
  const { data: callerAgent } = await supabaseAdmin
    .from('agents')
    .select('name')
    .eq('id', caller.agentId)
    .single()

  // ── 6. Forward request ───────────────────────────────────────────────────
  const requestId = randomUUID()
  const timestamp = new Date().toISOString()
  const signature = signGatewayHeaders(requestId, timestamp, caller.agentId)
  const body = await request.text()

  let upstreamStatus = 502
  let upstreamBody = JSON.stringify({ error: 'Target agent unreachable' })
  let upstreamContentType = 'application/json'

  try {
    const upstream = await fetch(targetAgent.url, {
      method: 'POST',
      headers: {
        'Content-Type':
          request.headers.get('content-type') ?? 'application/json',
        // ── OpenAgora identity headers ──────────────────────────────────
        'X-OpenAgora-Caller-ID':   caller.agentId,
        'X-OpenAgora-Caller-Name': callerAgent?.name ?? 'unknown',
        'X-OpenAgora-Trust-Level': trustLevel,
        'X-OpenAgora-Request-ID':  requestId,
        'X-OpenAgora-Timestamp':   timestamp,
        'X-OpenAgora-Signature':   signature,
      },
      body,
      signal: AbortSignal.timeout(30_000),
    })

    upstreamStatus      = upstream.status
    upstreamBody        = await upstream.text()
    upstreamContentType =
      upstream.headers.get('content-type') ?? 'application/json'
  } catch {
    // fall through with 502 defaults
  }

  // ── 7. Log the call ──────────────────────────────────────────────────────
  await supabaseAdmin.from('proxy_calls').insert({
    target_agent_id: targetAgentId,
    caller_agent_id: caller.agentId,
    trust_level:     trustLevel,
    status_code:     upstreamStatus,
    latency_ms:      Date.now() - start,
  })

  // ── 8. Return upstream response ──────────────────────────────────────────
  return new Response(upstreamBody, {
    status: upstreamStatus,
    headers: {
      'Content-Type':            upstreamContentType,
      'X-OpenAgora-Request-ID':  requestId,
      'X-OpenAgora-Trust-Level': trustLevel,
      'X-OpenAgora-Latency-Ms':  String(Date.now() - start),
    },
  })
}
