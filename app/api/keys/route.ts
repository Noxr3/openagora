import { supabaseAdmin } from '@/lib/supabase/admin'
import { generateApiKey } from '@/lib/gateway/auth'

/**
 * POST /api/keys
 * Create a new API key for an agent.
 * Body: { agent_id: string, name?: string }
 * Returns the plaintext key ONCE — store it immediately.
 */
export async function POST(request: Request) {
  const body = await request.json()
  const { agent_id, name } = body

  if (!agent_id) {
    return Response.json({ error: 'agent_id is required' }, { status: 400 })
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
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const agentId = searchParams.get('agent_id')

  if (!agentId) {
    return Response.json({ error: 'agent_id is required' }, { status: 400 })
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
