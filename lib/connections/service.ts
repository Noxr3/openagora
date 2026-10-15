import { supabaseAdmin } from '@/lib/supabase/admin'
import { outcome, type Outcome } from '@/lib/outcome'

/**
 * Connections between agents, shared by the REST API (POST /api/connections,
 * PUT /api/connections/<id>) and the MCP server (connect,
 * respond_to_invitation). `agentId` is always the agent behind a verified
 * `oag_` key.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Invite another agent to connect. Agents that auto-accept connect at once. */
export async function requestConnection(
  agentId: string,
  input: { target_agent_id?: unknown; message?: unknown },
): Promise<Outcome> {
  const { target_agent_id } = input
  const message = typeof input.message === 'string' ? input.message : undefined
  if (!target_agent_id) {
    return outcome(400, { error: 'target_agent_id is required' })
  }
  // It is interpolated into a PostgREST filter below: accept only a UUID.
  if (!UUID_RE.test(String(target_agent_id))) {
    return outcome(400, { error: 'target_agent_id must be an agent UUID' })
  }
  if (message && message.length > 150) {
    return outcome(400, { error: 'message must be 150 characters or fewer' })
  }
  if (target_agent_id === agentId) {
    return outcome(400, { error: 'Cannot connect to yourself' })
  }

  // Verify target exists
  const { data: target } = await supabaseAdmin
    .from('agents')
    .select('id, name, auto_accept_connections')
    .eq('id', target_agent_id)
    .single()

  if (!target) {
    return outcome(404, { error: 'Target agent not found' })
  }

  // Check for existing relationship
  const { data: existing } = await supabaseAdmin
    .from('agent_connections')
    .select('id, status')
    .or(
      `and(requester_id.eq.${agentId},target_id.eq.${target_agent_id}),` +
      `and(requester_id.eq.${target_agent_id},target_id.eq.${agentId})`
    )
    .maybeSingle()

  if (existing) {
    return outcome(409, { error: 'Connection already exists', connection: existing })
  }

  const autoAccept = target.auto_accept_connections === true
  const { data, error } = await supabaseAdmin
    .from('agent_connections')
    .insert({
      requester_id: agentId,
      target_id:    target_agent_id,
      status:       autoAccept ? 'connected' : 'pending',
      resolved_at:  autoAccept ? new Date().toISOString() : null,
      message:      message?.trim() ?? null,
    })
    .select()
    .single()

  if (error) {
    return outcome(500, { error: error.message })
  }

  return outcome(201, { ...data, auto_accepted: autoAccept })
}

export const INVITATION_ACTIONS = ['accept', 'decline', 'block'] as const
export type InvitationAction = (typeof INVITATION_ACTIONS)[number]

/** Accept, decline or block a pending invitation. Only the invited agent may answer. */
export async function respondToConnection(agentId: string, id: string, action: unknown): Promise<Outcome> {
  if (!INVITATION_ACTIONS.includes(action as InvitationAction)) {
    return outcome(400, { error: 'action must be one of: accept, decline, block' })
  }
  if (!UUID_RE.test(id)) {
    return outcome(404, { error: 'Connection not found' })
  }

  const { data: connection } = await supabaseAdmin
    .from('agent_connections')
    .select('id, target_id, requester_id, status')
    .eq('id', id)
    .single()

  if (!connection) {
    return outcome(404, { error: 'Connection not found' })
  }

  // Only the target can respond
  if (connection.target_id !== agentId) {
    return outcome(403, { error: 'Only the target agent can accept or decline' })
  }

  if (connection.status !== 'pending') {
    return outcome(409, { error: `Connection is already "${connection.status}"` })
  }

  const statusMap = {
    accept:  'connected',
    decline: 'declined',
    block:   'blocked',
  } as const

  const { data, error } = await supabaseAdmin
    .from('agent_connections')
    .update({
      status:      statusMap[action as InvitationAction],
      resolved_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return outcome(500, { error: error.message })
  }

  return outcome(200, data)
}
