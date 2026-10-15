import { supabaseAdmin } from '@/lib/supabase/admin'
import { resolveApiKey } from '@/lib/gateway/auth'
import { requestConnection } from '@/lib/connections/service'
import { toResponse } from '@/lib/outcome'

/**
 * POST /api/connections
 * Send a connection request to another agent.
 * Auth: Bearer oag_<key>
 * Body: { target_agent_id: string, message?: string }
 * The MCP tool connect is the same operation.
 */
export async function POST(request: Request) {
  const caller = await resolveApiKey(request.headers.get('authorization'))
  if (!caller) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { target_agent_id?: unknown; message?: unknown }
  try {
    body = (await request.json()) ?? {}
  } catch {
    return Response.json({ error: 'Body must be JSON: {"target_agent_id": "..."}' }, { status: 400 })
  }
  return toResponse(await requestConnection(caller.agentId, body))
}

/**
 * GET /api/connections
 * List all connections for the authenticated agent.
 * Auth: Bearer oag_<key>
 * Query: ?status=connected|pending|all (default: all)
 */
export async function GET(request: Request) {
  const caller = await resolveApiKey(request.headers.get('authorization'))
  if (!caller) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const statusFilter = searchParams.get('status')

  let query = supabaseAdmin
    .from('agent_connections')
    .select(
      `id, status, created_at, resolved_at,
       requester:agents!requester_id(id, name, avatar_url),
       target:agents!target_id(id, name, avatar_url)`
    )
    .or(
      `requester_id.eq.${caller.agentId},target_id.eq.${caller.agentId}`
    )
    .order('created_at', { ascending: false })

  if (statusFilter && statusFilter !== 'all') {
    query = query.eq('status', statusFilter)
  }

  const { data, error } = await query

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ connections: data })
}
