import { supabaseAdmin } from '@/lib/supabase/admin'
import { resolveApiKey } from '@/lib/gateway/auth'

/**
 * POST /api/connections
 * Send a connection request to another agent.
 * Auth: Bearer oag_<key>
 * Body: { target_agent_id: string }
 */
export async function POST(request: Request) {
  const caller = await resolveApiKey(request.headers.get('authorization'))
  if (!caller) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { target_agent_id, message } = await request.json()
  if (!target_agent_id) {
    return Response.json({ error: 'target_agent_id is required' }, { status: 400 })
  }
  if (message && message.length > 150) {
    return Response.json({ error: 'message must be 150 characters or fewer' }, { status: 400 })
  }
  if (target_agent_id === caller.agentId) {
    return Response.json({ error: 'Cannot connect to yourself' }, { status: 400 })
  }

  // Verify target exists
  const { data: target } = await supabaseAdmin
    .from('agents')
    .select('id, name')
    .eq('id', target_agent_id)
    .single()

  if (!target) {
    return Response.json({ error: 'Target agent not found' }, { status: 404 })
  }

  // Check for existing relationship
  const { data: existing } = await supabaseAdmin
    .from('agent_connections')
    .select('id, status')
    .or(
      `and(requester_id.eq.${caller.agentId},target_id.eq.${target_agent_id}),` +
      `and(requester_id.eq.${target_agent_id},target_id.eq.${caller.agentId})`
    )
    .maybeSingle()

  if (existing) {
    return Response.json(
      { error: 'Connection already exists', connection: existing },
      { status: 409 }
    )
  }

  const { data, error } = await supabaseAdmin
    .from('agent_connections')
    .insert({
      requester_id: caller.agentId,
      target_id:    target_agent_id,
      status:       'pending',
      message:      message?.trim() ?? null,
    })
    .select()
    .single()

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json(data, { status: 201 })
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
