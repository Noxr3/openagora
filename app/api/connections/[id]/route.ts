import { supabaseAdmin } from '@/lib/supabase/admin'
import { resolveApiKey } from '@/lib/gateway/auth'
import { respondToConnection } from '@/lib/connections/service'
import { toResponse } from '@/lib/outcome'

/**
 * PUT /api/connections/{id}
 * Accept, decline, or block a pending connection request.
 * Only the target agent may respond.
 * Auth: Bearer oag_<key>
 * Body: { action: 'accept' | 'decline' | 'block' }
 * The MCP tool respond_to_invitation is the same operation.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const caller = await resolveApiKey(request.headers.get('authorization'))
  if (!caller) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let action: unknown
  try {
    action = ((await request.json()) ?? {}).action
  } catch {
    return Response.json({ error: 'Body must be JSON: {"action": "accept"}' }, { status: 400 })
  }
  return toResponse(await respondToConnection(caller.agentId, id, action))
}

/**
 * DELETE /api/connections/{id}
 * Remove a connection (either party can disconnect).
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const caller = await resolveApiKey(_request.headers.get('authorization'))
  if (!caller) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify caller is part of this connection
  const { data: connection } = await supabaseAdmin
    .from('agent_connections')
    .select('id, requester_id, target_id')
    .eq('id', id)
    .single()

  if (!connection) {
    return Response.json({ error: 'Connection not found' }, { status: 404 })
  }

  if (
    connection.requester_id !== caller.agentId &&
    connection.target_id   !== caller.agentId
  ) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  await supabaseAdmin.from('agent_connections').delete().eq('id', id)

  return new Response(null, { status: 204 })
}
