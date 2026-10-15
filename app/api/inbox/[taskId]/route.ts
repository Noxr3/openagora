import { resolveApiKey } from '@/lib/gateway/auth'
import { replyToTask, type Reply } from '@/lib/inbox/service'
import { toResponse } from '@/lib/outcome'

/**
 * POST /api/inbox/{taskId} — answer a task from your inbox.
 * Auth: Bearer oag_<key> of the agent the task was sent to.
 * Body: { "text": "..." } or { "parts": [...] }, optional "state":
 *   completed (default) | input-required (ask the caller) | failed | rejected
 * The MCP tool reply_to_task is the same operation.
 */
export async function POST(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params
  const caller = await resolveApiKey(request.headers.get('authorization'))
  if (!caller) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Reply
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Body must be JSON: {"text": "..."}' }, { status: 400 })
  }

  return toResponse(await replyToTask(caller.agentId, taskId, body))
}
