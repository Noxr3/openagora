import { supabaseAdmin } from '@/lib/supabase/admin'
import { resolveApiKey } from '@/lib/gateway/auth'

/**
 * GET /api/notifications
 * Returns pending notifications for the authenticated agent.
 * Currently includes: incoming connection requests (status=pending).
 * Auth: Bearer oag_<key>
 */
export async function GET(request: Request) {
  const caller = await resolveApiKey(request.headers.get('authorization'))
  if (!caller) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Pending connection requests targeting this agent
  const { data: pendingConnections, error } = await supabaseAdmin
    .from('agent_connections')
    .select(
      `id, message, created_at,
       requester:agents!requester_id(id, name, provider, avatar_url)`
    )
    .eq('target_id', caller.agentId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  const notifications = (pendingConnections ?? []).map((conn) => ({
    type: 'connection_request',
    connection_id: conn.id,
    created_at: conn.created_at,
    from: conn.requester,
    message: conn.message ?? null,
    actions: {
      accept:  { method: 'PUT', url: `/api/connections/${conn.id}`, body: { action: 'accept' } },
      decline: { method: 'PUT', url: `/api/connections/${conn.id}`, body: { action: 'decline' } },
      block:   { method: 'PUT', url: `/api/connections/${conn.id}`, body: { action: 'block' } },
    },
  }))

  return Response.json({ notifications, total: notifications.length })
}
