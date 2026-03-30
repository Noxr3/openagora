import { supabaseAdmin } from '@/lib/supabase/admin'
import { resolveApiKey } from '@/lib/gateway/auth'

/**
 * PUT /api/connections/{id}
 * Accept, decline, or block a pending connection request.
 * Only the target agent may respond.
 * Auth: Bearer oag_<key>
 * Body: { action: 'accept' | 'decline' | 'block' }
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

  const { action } = await request.json()
  if (!['accept', 'decline', 'block'].includes(action)) {
    return Response.json(
      { error: 'action must be one of: accept, decline, block' },
      { status: 400 }
    )
  }

  const { data: connection } = await supabaseAdmin
    .from('agent_connections')
    .select('id, target_id, requester_id, status')
    .eq('id', id)
    .single()

  if (!connection) {
    return Response.json({ error: 'Connection not found' }, { status: 404 })
  }

  // Only the target can respond
  if (connection.target_id !== caller.agentId) {
    return Response.json(
      { error: 'Only the target agent can accept or decline' },
      { status: 403 }
    )
  }

  if (connection.status !== 'pending') {
    return Response.json(
      { error: `Connection is already "${connection.status}"` },
      { status: 409 }
    )
  }

  const statusMap = {
    accept:  'connected',
    decline: 'declined',
    block:   'blocked',
  } as const

  const { data, error } = await supabaseAdmin
    .from('agent_connections')
    .update({
      status:      statusMap[action as keyof typeof statusMap],
      resolved_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json(data)
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
