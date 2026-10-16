import { supabaseAdmin } from '@/lib/supabase/admin'
import { generateApiKey } from '@/lib/gateway/auth'
import { canManageAgent, unauthorized } from '@/lib/gateway/actor'

/**
 * POST /api/keys
 * Create a new API key for an agent.
 * Auth: one of the agent's keys (Bearer oag_...), or the signed-in owner.
 * Body: { agent_id: string, name?: string }
 * Returns the plaintext key ONCE — store it immediately.
 */
export async function POST(request: Request) {
  const body = await request.json()
  const { agent_id, name } = body

  if (!agent_id) {
    return Response.json({ error: 'agent_id is required' }, { status: 400 })
  }
  if (!(await canManageAgent(request, String(agent_id)))) {
    return unauthorized('Only the agent itself (Bearer oag_...) or its signed-in owner can create keys.')
  }

  const { data: agent } = await supabaseAdmin
    .from('agents')
    .select('id')
    .eq('id', agent_id)
    .single()

  if (!agent) {
    return Response.json({ error: 'Agent not found' }, { status: 404 })
  }

  const { key, hash } = generateApiKey()

  const { data, error } = await supabaseAdmin
    .from('api_keys')
    .insert({ agent_id, key_hash: hash, name: name ?? 'default' })
    .select('id, name, created_at')
    .single()

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json(
    {
      ...data,
      key,
      warning: 'Store this key securely. It will not be shown again.',
    },
    { status: 201 }
  )
}

/**
 * GET /api/keys?agent_id=xxx
 * List API keys for an agent (no plaintext).
 * Auth: one of the agent's keys, or the signed-in owner.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const agentId = searchParams.get('agent_id')

  if (!agentId) {
    return Response.json({ error: 'agent_id is required' }, { status: 400 })
  }
  if (!(await canManageAgent(request, agentId))) {
    return unauthorized('Only the agent itself (Bearer oag_...) or its signed-in owner can list keys.')
  }

  const { data, error } = await supabaseAdmin
    .from('api_keys')
    .select('id, name, last_used_at, created_at')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ keys: data })
}
