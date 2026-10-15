import { supabaseAdmin } from '@/lib/supabase/admin'
import type { TrustLevel } from '@/lib/gateway/ratelimit'
import {
  generationOf,
  normalizeMessage,
  operationOf,
  OPEN_STATES,
  RPC_ERRORS,
  rpcError,
  rpcResult,
  taskFor,
  type StoredTask,
} from './a2a'

const TASK_COLUMNS = 'id, context_id, state, request, response, updated_at, caller_agent_id, target_agent_id'

interface PullRequest {
  body: string
  versionHeader: string | null
  callerId: string
  targetId: string
  trustLevel: TrustLevel
  requestId: string
}

function json(payload: unknown, requestId: string, status = 200) {
  return Response.json(payload, {
    status,
    headers: { 'X-OpenAgora-Request-ID': requestId, 'X-OpenAgora-Delivery': 'inbox' },
  })
}

/**
 * The relay's answer for an agent that checks its inbox. Nothing is
 * forwarded: a send is written to agent_tasks and answered at once with a
 * Task in "submitted"; the caller reads progress with tasks/get. Only the
 * agent that sent a task can read or cancel it.
 */
export async function handlePullRequest(req: PullRequest): Promise<Response> {
  let rpc: { id?: unknown; method?: string; params?: Record<string, unknown> }
  try {
    rpc = JSON.parse(req.body)
  } catch {
    return json(rpcError(null, { code: -32700, message: 'Parse error' }), req.requestId, 400)
  }
  const method = typeof rpc.method === 'string' ? rpc.method : ''
  const op = operationOf(method)
  const generation = generationOf(method, req.versionHeader)
  const params = rpc.params ?? {}

  if (op === 'stream' || op === 'other') {
    return json(rpcError(rpc.id, RPC_ERRORS.unsupported), req.requestId)
  }

  if (op === 'send') {
    const message = params.message
    const normalized = normalizeMessage(message, 'user')
    if (normalized.parts.length === 0) {
      return json(rpcError(rpc.id, RPC_ERRORS.invalidParams, 'params.message.parts is empty'), req.requestId)
    }
    const m = (message ?? {}) as { contextId?: unknown }
    const contextId =
      typeof m.contextId === 'string' && m.contextId
        ? m.contextId
        : typeof params.sessionId === 'string' && params.sessionId
          ? params.sessionId
          : crypto.randomUUID()

    // The call row is written now (unanswered) so rate limits see it; the
    // agent's reply fills in status and latency.
    const { data: call } = await supabaseAdmin
      .from('proxy_calls')
      .insert({ target_agent_id: req.targetId, caller_agent_id: req.callerId, trust_level: req.trustLevel })
      .select('id')
      .single()

    const { data: task, error } = await supabaseAdmin
      .from('agent_tasks')
      .insert({
        target_agent_id: req.targetId,
        caller_agent_id: req.callerId,
        context_id: contextId,
        request: normalized,
        proxy_call_id: call?.id ?? null,
      })
      .select(TASK_COLUMNS)
      .single()
    if (error || !task) {
      return json(rpcError(rpc.id, { code: -32603, message: 'Could not queue the task' }), req.requestId, 500)
    }
    return json(rpcResult(rpc.id, generation, op, taskFor(generation, task as StoredTask)), req.requestId)
  }

  // get / cancel — by task id, only for the agent that sent it
  const taskId = typeof params.id === 'string' ? params.id : typeof params.name === 'string' ? params.name.replace(/^tasks\//, '') : ''
  if (!/^[0-9a-f-]{36}$/i.test(taskId)) {
    return json(rpcError(rpc.id, RPC_ERRORS.taskNotFound), req.requestId)
  }
  const { data: found } = await supabaseAdmin
    .from('agent_tasks')
    .select(TASK_COLUMNS)
    .eq('id', taskId)
    .eq('target_agent_id', req.targetId)
    .eq('caller_agent_id', req.callerId)
    .maybeSingle()
  if (!found) return json(rpcError(rpc.id, RPC_ERRORS.taskNotFound), req.requestId)

  if (op === 'cancel') {
    if (!OPEN_STATES.includes(found.state)) {
      return json(rpcError(rpc.id, RPC_ERRORS.notCancelable), req.requestId)
    }
    const { data: canceled } = await supabaseAdmin
      .from('agent_tasks')
      .update({ state: 'canceled', updated_at: new Date().toISOString(), completed_at: new Date().toISOString() })
      .eq('id', taskId)
      .in('state', OPEN_STATES)
      .select(TASK_COLUMNS)
      .maybeSingle()
    return json(rpcResult(rpc.id, generation, op, taskFor(generation, (canceled ?? found) as StoredTask)), req.requestId)
  }

  return json(rpcResult(rpc.id, generation, op, taskFor(generation, found as StoredTask)), req.requestId)
}
