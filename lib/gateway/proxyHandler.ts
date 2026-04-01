import { randomUUID } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { resolveApiKey, signGatewayHeaders } from '@/lib/gateway/auth'
import { getTrustLevel, checkRateLimit } from '@/lib/gateway/ratelimit'

export async function handleProxyRequest(
  request: Request,
  slugOrId: string,
): Promise<Response> {
  const start = Date.now()

  // ── 1. Authenticate caller ───────────────────────────────────────────────
  const caller = await resolveApiKey(request.headers.get('authorization'))
  if (!caller) {
    return Response.json(
      { error: 'Unauthorized', hint: 'Provide your OpenAgora API key as: Authorization: Bearer oag_...' },
      { status: 401 },
    )
  }

  // ── 2. Resolve target agent (by UUID or slug) ────────────────────────────
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId)
  const { data: targetAgent } = await supabaseAdmin
    .from('agents')
    .select('id, name, url, health_status')
    .eq(isUuid ? 'id' : 'slug', slugOrId)
    .single()

  if (!targetAgent) {
    return Response.json({ error: 'Agent not found' }, { status: 404 })
  }

  // ── 3. Trust level ───────────────────────────────────────────────────────
  const trustLevel = await getTrustLevel(caller.agentId, targetAgent.id)

  // ── 4. Rate limits ───────────────────────────────────────────────────────
  const { allowed, reason, retryAfter } = await checkRateLimit(caller.agentId, targetAgent.id, trustLevel)
  if (!allowed) {
    return Response.json(
      { error: 'Too Many Requests', message: reason, trust_level: trustLevel },
      { status: 429, headers: { 'Retry-After': String(retryAfter ?? 60) } },
    )
  }

  // ── 5. Caller identity ───────────────────────────────────────────────────
  const { data: callerAgent } = await supabaseAdmin
    .from('agents').select('name').eq('id', caller.agentId).single()

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
        'Content-Type': request.headers.get('content-type') ?? 'application/json',
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
    upstreamContentType = upstream.headers.get('content-type') ?? 'application/json'
  } catch {
    // fall through with 502 defaults
  }

  // ── 7. Log ───────────────────────────────────────────────────────────────
  await supabaseAdmin.from('proxy_calls').insert({
    target_agent_id: targetAgent.id,
    caller_agent_id: caller.agentId,
    trust_level:     trustLevel,
    status_code:     upstreamStatus,
    latency_ms:      Date.now() - start,
  })

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
