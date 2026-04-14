import { randomUUID } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { resolveApiKey, signGatewayHeaders } from '@/lib/gateway/auth'
import { getTrustLevel, checkRateLimit } from '@/lib/gateway/ratelimit'
import { verifyPayment, settlePayment, encodeSettlementHeader } from '@/lib/gateway/x402'

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

  // ── 6. Validate & normalize request body ─────────────────────────────────
  const requestId = randomUUID()
  const timestamp = new Date().toISOString()
  const signature = signGatewayHeaders(requestId, timestamp, caller.agentId)
  const rawBody = await request.text()

  // Try to parse and validate before forwarding
  let body = rawBody
  try {
    const parsed = JSON.parse(rawBody) as Record<string, unknown>
    const hints: string[] = []

    // Mistake 1: plain message without JSON-RPC wrapper
    if (!parsed.jsonrpc && !parsed.method && (parsed.message || parsed.text)) {
      const text = typeof parsed.message === 'string' ? parsed.message : typeof parsed.text === 'string' ? parsed.text : null
      if (text) {
        // Auto-wrap into proper A2A format
        const wrapped = {
          jsonrpc: '2.0',
          id: `auto-${Date.now()}`,
          method: 'tasks/send',
          params: {
            id: `task-${Date.now()}`,
            sessionId: `session-${Date.now()}`,
            message: { role: 'user', parts: [{ type: 'text', text }] },
          },
        }
        body = JSON.stringify(wrapped)
        // Don't error — just fix it and proceed
      }
    }

    // Mistake 2: jsonrpc present but missing "2.0"
    if (parsed.jsonrpc && parsed.jsonrpc !== '2.0') {
      hints.push('jsonrpc must be "2.0"')
    }

    // Mistake 3: wrong method name
    if (parsed.method && parsed.method !== 'tasks/send' && parsed.method !== 'tasks/get' && parsed.method !== 'tasks/cancel') {
      hints.push(`Unknown method "${parsed.method}". Did you mean "tasks/send"?`)
    }

    // Mistake 4: message.content instead of message.parts
    const params = parsed.params as Record<string, unknown> | undefined
    const msg = params?.message as Record<string, unknown> | undefined
    if (msg && !msg.parts && msg.content) {
      // Auto-fix: convert content to parts
      const content = msg.content
      if (typeof content === 'string') {
        msg.parts = [{ type: 'text', text: content }]
        delete msg.content
        body = JSON.stringify(parsed)
      } else if (typeof content === 'object' && content && 'text' in (content as Record<string, unknown>)) {
        msg.parts = [content]
        delete msg.content
        body = JSON.stringify(parsed)
      }
    }

    // Return hints as warnings (non-blocking) unless they indicate unfixable issues
    if (hints.length > 0 && !body.includes('"tasks/send"') && parsed.method) {
      return Response.json(
        {
          error: 'Bad Request',
          hints,
          example: {
            jsonrpc: '2.0',
            method: 'tasks/send',
            params: {
              id: 'task-1',
              sessionId: 'session-1',
              message: { role: 'user', parts: [{ type: 'text', text: 'Hello' }] },
            },
          },
        },
        { status: 400, headers: { 'X-OpenAgora-Request-ID': requestId } },
      )
    }
  } catch {
    // Not valid JSON — let it pass through; the target agent will handle the error
  }

  // ── x402: Forward PAYMENT-SIGNATURE from caller if present ───────────────
  const paymentSignature = request.headers.get('payment-signature')

  let upstreamStatus = 502
  let upstreamBody = JSON.stringify({ error: 'Target agent unreachable' })
  let upstreamContentType = 'application/json'
  let upstreamPaymentRequired = ''
  let upstreamPaymentResponse = ''

  const forwardHeaders: Record<string, string> = {
    'Content-Type': request.headers.get('content-type') ?? 'application/json',
    'X-OpenAgora-Caller-ID':   caller.agentId,
    'X-OpenAgora-Caller-Name': callerAgent?.name ?? 'unknown',
    'X-OpenAgora-Trust-Level': trustLevel,
    'X-OpenAgora-Request-ID':  requestId,
    'X-OpenAgora-Timestamp':   timestamp,
    'X-OpenAgora-Signature':   signature,
  }
  if (paymentSignature) {
    forwardHeaders['payment-signature'] = paymentSignature
  }

  try {
    const upstream = await fetch(targetAgent.url, {
      method: 'POST',
      headers: forwardHeaders,
      body,
      signal: AbortSignal.timeout(30_000),
    })
    upstreamStatus      = upstream.status
    upstreamBody        = await upstream.text()
    upstreamContentType = upstream.headers.get('content-type') ?? 'application/json'
    upstreamPaymentRequired = upstream.headers.get('payment-required') ?? ''
    upstreamPaymentResponse = upstream.headers.get('payment-response') ?? ''
  } catch {
    // fall through with 502 defaults
  }

  // ── 7. Log proxy call ──────────────────────────────────────────────────
  await supabaseAdmin.from('proxy_calls').insert({
    target_agent_id: targetAgent.id,
    caller_agent_id: caller.agentId,
    trust_level:     trustLevel,
    status_code:     upstreamStatus,
    latency_ms:      Date.now() - start,
  })

  // ── 8. x402 payment flow ────────────────────────────────────────────────

  // 8a. Target returned 402 — log challenge, forward to caller
  if (upstreamStatus === 402 && upstreamPaymentRequired) {
    try {
      const decoded = JSON.parse(
        Buffer.from(upstreamPaymentRequired, 'base64').toString()
      ) as { accepts?: Array<{ network?: string; asset?: string; amount?: string; payTo?: string }> }
      const first = decoded.accepts?.[0]
      if (first) {
        await supabaseAdmin.from('payments').insert({
          caller_agent_id: caller.agentId,
          target_agent_id: targetAgent.id,
          network: first.network ?? 'unknown',
          asset:   first.asset ?? 'unknown',
          amount:  first.amount ?? '0',
          pay_to:  first.payTo ?? '',
          status:  'challenged',
        })
      }
    } catch {
      // Malformed — still forward the 402
    }
  }

  // 8b. Caller provided PAYMENT-SIGNATURE — verify + settle via Coinbase facilitator
  if (paymentSignature && upstreamPaymentRequired && upstreamStatus === 402) {
    // The upstream returned 402 even with the signature — means we need to
    // verify + settle ourselves, then retry the request with proof
    const hasCdpKeys = process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET

    if (hasCdpKeys) {
      const verification = await verifyPayment(paymentSignature, upstreamPaymentRequired)

      if (verification.isValid) {
        const settlement = await settlePayment(paymentSignature, upstreamPaymentRequired)

        if (settlement.success) {
          // Payment settled — log it
          const decoded = JSON.parse(
            Buffer.from(upstreamPaymentRequired, 'base64').toString()
          ) as { accepts?: Array<{ network?: string; asset?: string; amount?: string; payTo?: string }> }
          const first = decoded.accepts?.[0]
          await supabaseAdmin.from('payments').insert({
            caller_agent_id: caller.agentId,
            target_agent_id: targetAgent.id,
            network:    settlement.network ?? first?.network ?? 'unknown',
            asset:      first?.asset ?? 'unknown',
            amount:     first?.amount ?? '0',
            pay_to:     first?.payTo ?? '',
            tx_hash:    settlement.transaction,
            status:     'settled',
            settled_at: new Date().toISOString(),
          })

          // Retry the original request to target with settlement proof
          const paymentResponseHeader = encodeSettlementHeader(settlement)
          try {
            const retryUpstream = await fetch(targetAgent.url, {
              method: 'POST',
              headers: {
                ...forwardHeaders,
                'payment-response': paymentResponseHeader,
              },
              body,
              signal: AbortSignal.timeout(30_000),
            })
            upstreamStatus      = retryUpstream.status
            upstreamBody        = await retryUpstream.text()
            upstreamContentType = retryUpstream.headers.get('content-type') ?? 'application/json'
            upstreamPaymentResponse = paymentResponseHeader
            upstreamPaymentRequired = '' // clear — payment is settled
          } catch {
            // Retry failed — still return settlement info
          }
        } else {
          // Settlement failed — return error to caller
          return Response.json(
            { error: 'Payment settlement failed', reason: settlement.errorReason },
            { status: 402, headers: { 'X-OpenAgora-Request-ID': requestId, 'payment-required': upstreamPaymentRequired } },
          )
        }
      } else {
        return Response.json(
          { error: 'Payment verification failed', reason: verification.invalidReason },
          { status: 402, headers: { 'X-OpenAgora-Request-ID': requestId, 'payment-required': upstreamPaymentRequired } },
        )
      }
    }
    // If no CDP keys configured, fall through and return the 402 transparently
  }

  // 8c. Transparent settlement logging (target settled directly, returned 200 + proof)
  if (upstreamStatus === 200 && upstreamPaymentResponse && !paymentSignature) {
    try {
      const decoded = JSON.parse(
        Buffer.from(upstreamPaymentResponse, 'base64').toString()
      ) as { transaction?: string; network?: string }
      await supabaseAdmin.from('payments').insert({
        caller_agent_id: caller.agentId,
        target_agent_id: targetAgent.id,
        network:    decoded.network ?? 'unknown',
        asset:      'unknown',
        amount:     '0',
        pay_to:     '',
        tx_hash:    decoded.transaction ?? null,
        status:     'settled',
        settled_at: new Date().toISOString(),
      })
    } catch {
      // Malformed — still return 200
    }
  }

  // ── 9. Return upstream response with x402 headers ──────────────────────
  const responseHeaders: Record<string, string> = {
    'Content-Type':            upstreamContentType,
    'X-OpenAgora-Request-ID':  requestId,
    'X-OpenAgora-Trust-Level': trustLevel,
    'X-OpenAgora-Latency-Ms':  String(Date.now() - start),
  }
  if (upstreamPaymentRequired) responseHeaders['payment-required'] = upstreamPaymentRequired
  if (upstreamPaymentResponse) responseHeaders['payment-response'] = upstreamPaymentResponse

  return new Response(upstreamBody, {
    status: upstreamStatus,
    headers: responseHeaders,
  })
}
