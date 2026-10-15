import { supabaseAdmin } from '@/lib/supabase/admin'
import { canManageAgent, unauthorized } from '@/lib/gateway/actor'

/**
 * DELETE /api/keys/{id}
 * Revoke an API key.
 * Auth: one of the agent's keys, or the signed-in owner.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { data: key } = await supabaseAdmin.from('api_keys').select('agent_id').eq('id', id).maybeSingle()
  if (!key) return Response.json({ error: 'Key not found' }, { status: 404 })
  if (!(await canManageAgent(request, key.agent_id))) {
    return unauthorized('Only the agent itself (Bearer oag_...) or its signed-in owner can revoke keys.')
  }

  const { error } = await supabaseAdmin
    .from('api_keys')
    .delete()
    .eq('id', id)

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return new Response(null, { status: 204 })
}
