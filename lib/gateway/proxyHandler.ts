import { randomUUID } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { resolveApiKey, signGatewayHeaders } from '@/lib/gateway/auth'
import { getTrustLevel, checkRateLimit } from '@/lib/gateway/ratelimit'
import { verifyPayment, settlePayment, encodeSettlementHeader, extractPaymentDetails } from '@/lib/gateway/x402'
import { usesSharedPublicKey } from '@/lib/gateway/actor'
import { outboundCredentialFor } from '@/lib/gateway/credentials'
import {
  generationFromVersion,
  generationOf,
  methodFor,
  taskStateIn,
  translateRequest,
  translateResponse,
  versionOf,
  TERMINAL_STATES,
  type A2AGeneration,
  type TaskState,
} from '@/lib/a2a/translate'

/** How long the relay waits for an agent that did not set relay_timeout_seconds. */
const DEFAULT_TIMEOUT_SECONDS = 30

/**
 * JSON-RPC methods the relay forwards. A2A renamed `tasks/send` to
 * `message/send` (v0.2+) and v1.0 adds PascalCase names; agents in the wild
 * speak all three, so all of them pass.
 */
const A2A_METHODS = new Set([
  // A2A ≤ 0.1
  'tasks/send', 'tasks/sendSubscribe', 'tasks/get', 'tasks/cancel', 'tasks/resubscribe',
  'tasks/pushNotification/set', 'tasks/pushNotification/get',
  // A2A 0.2 – 0.3
  'message/send', 'message/stream', 'tasks/list',
  'tasks/pushNotificationConfig/set', 'tasks/pushNotificationConfig/get',
  'tasks/pushNotificationConfig/list', 'tasks/pushNotificationConfig/delete',
  'agent/getAuthenticatedExtendedCard',
  // A2A 1.0
  'SendMessage', 'SendStreamingMessage', 'GetTask', 'ListTasks', 'CancelTask', 'SubscribeToTask',
  'CreateTaskPushNotificationConfig', 'GetTaskPushNotificationConfig',
  'ListTaskPushNotificationConfig', 'DeleteTaskPushNotificationConfig', 'GetExtendedAgentCard',
])

export async function handleProxyRequest(
  request: Request,
  slugOrId: string,
): Promise<Response> {
  const start = Date.now()

  // ── 1. Authenticate caller ───────────────────────────────────────────────
  const caller = await resolveApiKey(request.headers.get('authorization'))
  if (!caller) {
    return Response.json(
      { error: 'Unauthorized', hint: 'Provide your LinkAgora API key as: Authorization: Bearer oag_...' },
      { status: 401 },
    )
  }

  // ── 2. Resolve target agent (by UUID or slug) ────────────────────────────
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId)
  const { data: targetAgent } = await supabaseAdmin
    .from('agents')
    .select('id, name, url, health_status, payment_address, payment_schemes, a2a_version, relay_timeout_seconds')
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
    if (typeof parsed.method === 'string' && !A2A_METHODS.has(parsed.method)) {
      hints.push(`Unknown method "${parsed.method}". Did you mean "message/send"?`)
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
    // Only an unknown method blocks; the other hints are advisory, as before.
    if (hints.length > 0 && typeof parsed.method === 'string' && !A2A_METHODS.has(parsed.method)) {
      return Response.json(
        {
          error: 'Bad Request',
          hints,
          example: {
            jsonrpc: '2.0',
            method: 'message/send',
            params: {
              message: { role: 'user', messageId: 'msg-1', parts: [{ kind: 'text', text: 'Hello' }] },
            },
          },
        },
        { status: 400, headers: { 'X-OpenAgora-Request-ID': requestId } },
      )
    }
  } catch {
    // Not valid JSON — let it pass through; the target agent will handle the error
  }

  // ── 6b. Speak the target's A2A generation ───────────────────────────────
  // A caller on A2A 0.3 can call an agent on 1.0 (and every other pairing):
  // the relay rewrites send / get / cancel into the target's generation and
  // the answer back into the caller's. Unknown target generation = unchanged.
  let rpc: Record<string, unknown> | null = null
  try {
    const parsed = JSON.parse(body) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) rpc = parsed as Record<string, unknown>
  } catch {
    // not JSON — forwarded as it is
  }
  const callerGeneration: A2AGeneration | null =
    rpc && typeof rpc.method === 'string' ? generationOf(rpc.method, request.headers.get('a2a-version')) : null
  const targetGeneration = generationFromVersion(targetAgent.a2a_version)

  let translation: {
    op: 'send' | 'get' | 'cancel'
    from: A2AGeneration
    to: A2AGeneration
    callerTaskId?: string
    callerContextId?: string
  } | null = null
  if (rpc && callerGeneration && targetGeneration && callerGeneration !== targetGeneration) {
    const ownTaskId = callerGeneration === 'legacy' ? legacyTaskId(rpc) : undefined
    const knownTaskId = ownTaskId ? await taskAlias(caller.agentId, targetAgent.id, ownTaskId) : undefined
    const translated = translateRequest(rpc, callerGeneration, targetGeneration, { newId: randomUUID, knownTaskId })
    if (!translated.ok) {
      return Response.json(
        { jsonrpc: '2.0', id: rpc.id ?? null, error: translated.error },
        { headers: { 'X-OpenAgora-Request-ID': requestId } },
      )
    }
    body = JSON.stringify(translated.body)
    translation = {
      op: translated.op,
      from: callerGeneration,
      to: targetGeneration,
      callerTaskId: translated.callerTaskId,
      callerContextId: translated.callerContextId,
    }
  }

  // ── 6c. The target's own credential ─────────────────────────────────────
  // Set by the agent's owner, held sealed, attached only here and only to the
  // origin it was set for (lib/gateway/credentials.ts).
  const credential = await outboundCredentialFor(targetAgent.id, targetAgent.url)
  if (credential.kind !== 'none' && usesSharedPublicKey(request)) {
    // Every call to this agent spends its owner's key; a key printed in every
    // browser bundle is no one in particular.
    return Response.json(
      {
        error: 'Forbidden',
        hint: "This agent is called with its owner's own key, so the public test key cannot call it. Use your agent's LinkAgora key (oag_...).",
      },
      { status: 403, headers: { 'X-OpenAgora-Request-ID': requestId } },
    )
  }
  if (credential.kind === 'unusable') {
    return Response.json(
      {
        error: 'Service Unavailable',
        hint: "This agent's stored credential cannot be used by this LinkAgora server right now. Its owner should set it again.",
      },
      { status: 503, headers: { 'X-OpenAgora-Request-ID': requestId } },
    )
  }

  // ── x402: Extract PAYMENT-SIGNATURE (never forwarded to target) ──────────
  const paymentSignature = request.headers.get('payment-signature')

  let upstreamStatus = 502
  let upstreamBody = JSON.stringify({ error: 'Target agent unreachable' })
  let upstreamContentType = 'application/json'
  let upstreamPaymentRequired = ''
  let upstreamPaymentResponse = ''

  const forwardHeaders: Record<string, string> = {
    'Content-Type': translation ? 'application/json' : request.headers.get('content-type') ?? 'application/json',
    'X-OpenAgora-Caller-ID':   caller.agentId,
    'X-OpenAgora-Caller-Name': callerAgent?.name ?? 'unknown',
    'X-OpenAgora-Trust-Level': trustLevel,
    'X-OpenAgora-Request-ID':  requestId,
    'X-OpenAgora-Timestamp':   timestamp,
    'X-OpenAgora-Signature':   signature,
  }
  // A2A 1.0 servers read the version from A2A-Version.
  const callerVersion = request.headers.get('a2a-version')?.trim()
  const a2aVersion = translation
    ? translation.to === 'v10' ? '1.0' : null
    : callerVersion || (targetGeneration === 'v10' ? '1.0' : null)
  if (a2aVersion) forwardHeaders['A2A-Version'] = a2aVersion
  if (credential.kind === 'header') forwardHeaders[credential.name] = credential.value
  // NOTE: PAYMENT-SIGNATURE is NOT forwarded to target.
  // Relay settles first, then forwards with PAYMENT-RESPONSE (proof of payment).

  // ── x402 pre-flight: if caller sent PAYMENT-SIGNATURE, settle before forwarding
  if (paymentSignature) {
    const hasFacilitator = process.env.X402_FACILITATOR_URL
      || (process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET)

    if (hasFacilitator) {
      // Verify using the requirements embedded in the caller's signed payload
      const verification = await verifyPayment(paymentSignature)
      if (!verification.isValid) {
        return Response.json(
          { error: 'Payment verification failed', reason: verification.invalidReason },
          { status: 402, headers: { 'X-OpenAgora-Request-ID': requestId } },
        )
      }

      // Settle on-chain via Coinbase facilitator
      const settlement = await settlePayment(paymentSignature)
      if (!settlement.success) {
        return Response.json(
          { error: 'Payment settlement failed', reason: settlement.errorReason },
          { status: 402, headers: { 'X-OpenAgora-Request-ID': requestId } },
        )
      }

      // Settlement successful — inject proof into forward headers
      upstreamPaymentResponse = encodeSettlementHeader(settlement)
      forwardHeaders['payment-response'] = upstreamPaymentResponse

      // Log to payments table
      const details = extractPaymentDetails(paymentSignature)
      await supabaseAdmin.from('payments').insert({
        caller_agent_id: caller.agentId,
        target_agent_id: targetAgent.id,
        network:    settlement.network ?? details.network,
        asset:      details.asset,
        amount:     details.amount,
        pay_to:     details.payTo,
        tx_hash:    settlement.transaction,
        status:     'settled',
        settled_at: new Date().toISOString(),
      })
    }
    // If no CDP keys, fall through — request forwarded without settlement
  }

  const timeoutSeconds = targetAgent.relay_timeout_seconds ?? DEFAULT_TIMEOUT_SECONDS
  try {
    const upstream = await fetch(targetAgent.url, {
      method: 'POST',
      headers: forwardHeaders,
      body,
      signal: AbortSignal.timeout(timeoutSeconds * 1000),
      // A stored credential goes to its own origin only. fetch drops
      // Authorization on a cross-origin redirect but not other headers
      // (X-API-Key …), so with a credential the redirect is handed back instead.
      redirect: credential.kind === 'header' ? 'manual' : 'follow',
    })
    upstreamStatus      = upstream.status
    upstreamBody        = await upstream.text()
    upstreamContentType = upstream.headers.get('content-type') ?? 'application/json'
    upstreamPaymentRequired = upstream.headers.get('payment-required') ?? ''
    upstreamPaymentResponse = upstream.headers.get('payment-response') ?? ''
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      const send = methodFor('send', callerGeneration ?? 'v03')
      upstreamStatus = 504
      upstreamBody = JSON.stringify({
        error: 'Gateway Timeout',
        hint:
          `The agent did not answer within ${timeoutSeconds} s. If it supports it, send ${send} without waiting ` +
          `(A2A 1.0: configuration.returnImmediately = true; 0.3: configuration.blocking = false) and poll ` +
          `${methodFor('get', callerGeneration ?? 'v03')} through the relay.`,
      })
    }
    // anything else: fall through with 502 defaults
  }

  // ── 6d. The answer, in the caller's generation ───────────────────────────
  let taskState: TaskState | null = null
  if (/json/i.test(upstreamContentType)) {
    try {
      const parsed = JSON.parse(upstreamBody) as unknown
      if (translation) {
        const out = translateResponse(parsed, translation.op, translation.to, translation.from, {
          callerTaskId: translation.callerTaskId,
          callerContextId: translation.callerContextId,
        })
        upstreamBody = JSON.stringify(out.body)
        upstreamContentType = 'application/json'
        if (out.task) {
          taskState = out.task.state
          // A legacy caller polls with the id it chose; remember which task that is.
          if (translation.op === 'send' && translation.callerTaskId && out.task.id !== translation.callerTaskId) {
            await rememberTaskAlias(caller.agentId, targetAgent.id, translation.callerTaskId, out.task.id)
          }
        }
      } else {
        taskState = taskStateIn(parsed)
      }
    } catch {
      // not JSON after all — returned as it is
    }
  }

  // ── 7. Log proxy call ──────────────────────────────────────────────────
  await supabaseAdmin.from('proxy_calls').insert({
    target_agent_id: targetAgent.id,
    caller_agent_id: caller.agentId,
    trust_level:     trustLevel,
    status_code:     upstreamStatus,
    latency_ms:      Date.now() - start,
  })

  // ── 8. x402 post-forward logging ─────────────────────────────────────────

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

  // 8b. Transparent settlement logging (target settled directly, returned 200 + proof)
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
  if (translation) {
    responseHeaders['X-OpenAgora-A2A-Translated'] = `${versionOf(translation.from)}->${versionOf(translation.to)}`
  }
  if (taskState) {
    responseHeaders['X-OpenAgora-Task-State'] = taskState
    // Not finished yet: the caller polls the same relay URL for the result.
    if (!TERMINAL_STATES.has(taskState) && callerGeneration) {
      responseHeaders['X-OpenAgora-Poll-Method'] = methodFor('get', callerGeneration)
    }
  }

  return new Response(upstreamBody, {
    status: upstreamStatus,
    headers: responseHeaders,
  })
}

/** A legacy request names its own task id in params.id. */
function legacyTaskId(rpc: Record<string, unknown>): string | undefined {
  const params = rpc.params as Record<string, unknown> | undefined
  return typeof params?.id === 'string' && params.id !== '' && params.id.length <= 200 ? params.id : undefined
}

async function taskAlias(callerId: string, targetId: string, callerTaskId: string): Promise<string | undefined> {
  const { data } = await supabaseAdmin
    .from('relay_task_aliases')
    .select('target_task_id')
    .eq('caller_agent_id', callerId)
    .eq('target_agent_id', targetId)
    .eq('caller_task_id', callerTaskId)
    .maybeSingle()
  return data?.target_task_id ?? undefined
}

async function rememberTaskAlias(callerId: string, targetId: string, callerTaskId: string, targetTaskId: string) {
  if (targetTaskId.length > 200) return
  await supabaseAdmin.from('relay_task_aliases').upsert({
    caller_agent_id: callerId,
    target_agent_id: targetId,
    caller_task_id: callerTaskId,
    target_task_id: targetTaskId,
  })
  // Polling a week-old task by its legacy id is not a thing; keep the table small.
  supabaseAdmin
    .from('relay_task_aliases')
    .delete()
    .eq('caller_agent_id', callerId)
    .lt('created_at', new Date(Date.now() - 7 * 86_400_000).toISOString())
    .then(() => {})
}
