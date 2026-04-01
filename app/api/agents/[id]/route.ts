import { supabaseAdmin } from '@/lib/supabase/admin'
import { resolveApiKey } from '@/lib/gateway/auth'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { data: agent, error } = await supabaseAdmin
    .from('agents')
    .select('*, agent_skills(*)')
    .eq('id', id)
    .single()

  if (error || !agent) {
    return Response.json({ error: 'Agent not found' }, { status: 404 })
  }

  return Response.json(agent)
}

/**
 * PUT /api/agents/[id]
 * Update an agent's info. Auth required — caller must own this agent.
 *
 * Updatable fields: name, description, provider, url, avatar_url,
 * capabilities, payment_schemes, skills (full replace)
 */
const UPDATABLE = ['name', 'description', 'provider', 'url', 'avatar_url', 'capabilities', 'payment_schemes'] as const

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Auth — must own this agent
  const caller = await resolveApiKey(request.headers.get('authorization'))
  if (!caller) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (caller.agentId !== id) {
    return Response.json({ error: 'Forbidden: you can only update your own agent' }, { status: 403 })
  }

  const body = await request.json()

  // Build update object from allowed fields
  const updates: Record<string, unknown> = {}
  for (const key of UPDATABLE) {
    if (key in body) updates[key] = body[key]
  }

  // URL uniqueness check
  if (updates.url) {
    const { data: existing } = await supabaseAdmin
      .from('agents')
      .select('id')
      .eq('url', updates.url as string)
      .neq('id', id)
      .maybeSingle()
    if (existing) {
      return Response.json({ error: 'An agent with this endpoint URL is already registered' }, { status: 409 })
    }
  }

  if (Object.keys(updates).length === 0 && !body.skills) {
    return Response.json({ error: 'No updatable fields provided' }, { status: 400 })
  }

  // Update agent fields
  if (Object.keys(updates).length > 0) {
    updates.updated_at = new Date().toISOString()
    const { error } = await supabaseAdmin
      .from('agents')
      .update(updates)
      .eq('id', id)
    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }
  }

  // Replace skills if provided
  if (body.skills && Array.isArray(body.skills)) {
    await supabaseAdmin.from('agent_skills').delete().eq('agent_id', id)
    if (body.skills.length > 0) {
      const rows = body.skills.map(
        (s: { name: string; description?: string; tags?: string[] }) => ({
          agent_id: id,
          name: s.name,
          description: s.description ?? '',
          tags: s.tags ?? [],
        })
      )
      await supabaseAdmin.from('agent_skills').insert(rows)
    }
  }

  // Return updated agent
  const { data: updated } = await supabaseAdmin
    .from('agents')
    .select('*, agent_skills(*)')
    .eq('id', id)
    .single()

  return Response.json(updated)
}
