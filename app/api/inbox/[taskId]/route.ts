import { supabaseAdmin } from '@/lib/supabase/admin'
import { resolveApiKey } from '@/lib/gateway/auth'
import { messageFromText, normalizeMessage, OPEN_STATES } from '@/lib/inbox/a2a'

const REPLY_STATES = ['completed', 'input-required', 'failed', 'rejected'] as const
type ReplyState = (typeof REPLY_STATES)[number]

/** What the caller's track record row records for each answer. */
const STATUS_CODE: Record<ReplyState, number> = {
  completed: 200,
  'input-required': 200,
  failed: 500,
  rejected: 403,
}

/**
 * POST /api/inbox/{taskId} — answer a task from your inbox.
 * Auth: Bearer oag_<key> of the agent the task was sent to.
 * Body: { "text": "..." } or { "parts": [...] }, optional "state":
 *   completed (default) | input-required (ask the caller) | failed | rejected
 */
export async function POST(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params
  const caller = await resolveApiKey(request.headers.get('authorization'))
  if (!caller) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { text?: unknown; parts?: unknown; message?: unknown; state?: unknown }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Body must be JSON: {"text": "..."}' }, { status: 400 })
  }

  const state: ReplyState = REPLY_STATES.includes(body.state as ReplyState) ? (body.state as ReplyState) : 'completed'
  const message =
    typeof body.text === 'string' && body.text.trim()
      ? messageFromText(body.text, 'agent')
      : normalizeMessage(body.message ?? { parts: body.parts }, 'agent')
  if (message.parts.length === 0 && state !== 'failed' && state !== 'rejected') {
    return Response.json({ error: 'Nothing to send: give "text" or "parts"' }, { status: 400 })
  }

  const { data: task } = await supabaseAdmin
    .from('agent_tasks')
    .select('id, state, created_at, proxy_call_id')
    .eq('id', /^[0-9a-f-]{36}$/i.test(taskId) ? taskId : '00000000-0000-0000-0000-000000000000')
    .eq('target_agent_id', caller.agentId)
    .maybeSingle()
  if (!task) return Response.json({ error: 'Task not found in your inbox' }, { status: 404 })
  if (!OPEN_STATES.includes(task.state)) {
    return Response.json({ error: `Task is already "${task.state}"` }, { status: 409 })
  }

  const now = new Date()
  const terminal = state !== 'input-required'
  const { data: updated } = await supabaseAdmin
    .from('agent_tasks')
    .update({
      state,
      response: message,
      claimed_until: null,
      updated_at: now.toISOString(),
      completed_at: terminal ? now.toISOString() : null,
    })
    .eq('id', task.id)
    .in('state', OPEN_STATES)
    .select('id, state')
    .maybeSingle()
  if (!updated) return Response.json({ error: 'Task changed while you answered — check your inbox again' }, { status: 409 })

  await Promise.all([
    task.proxy_call_id
      ? supabaseAdmin
          .from('proxy_calls')
          .update({ status_code: STATUS_CODE[state], latency_ms: now.getTime() - Date.parse(task.created_at) })
          .eq('id', task.proxy_call_id)
      : Promise.resolve(),
    supabaseAdmin.from('agents').update({ last_seen_at: now.toISOString() }).eq('id', caller.agentId),
  ])

  return Response.json({ ok: true, task: updated })
}
