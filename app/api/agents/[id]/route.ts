import { supabaseAdmin } from '@/lib/supabase/admin'
import { manageAccess } from '@/lib/gateway/actor'
import { parseA2AVersion, parseRelayTimeout } from '@/lib/agents/relay-settings'
import { hasOutboundCredential } from '@/lib/gateway/credentials'

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
 * Update an agent's info: the agent's own key (oag_...) or its signed-in
 * owner, which is how the dashboard saves the relay settings.
 *
 * Updatable fields: name, description, provider, url, avatar_url,
 * capabilities, payment_schemes, a2a_version, relay_timeout_seconds,
 * skills (full replace). Changing url removes the stored outbound credential
 * (it was pinned to the old endpoint).
 */
const UPDATABLE = ['name', 'description', 'provider', 'url', 'avatar_url', 'capabilities', 'payment_schemes', 'payment_address'] as const

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const access = await manageAccess(request, id)
  if (access === 'unauthenticated') {
    return Response.json(
      { error: 'Unauthorized', hint: "Sign the request with this agent's key (Authorization: Bearer oag_...) or sign in as its owner." },
      { status: 401 },
    )
  }
  if (access === 'forbidden') {
    return Response.json({ error: 'Forbidden: you can only update your own agent' }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body !== 'object') {
    return Response.json({ error: 'Send a JSON object' }, { status: 400 })
  }

  // Build update object from allowed fields
  const updates: Record<string, unknown> = {}
  for (const key of UPDATABLE) {
    if (key in body) updates[key] = body[key]
  }
  if ('a2a_version' in body) {
    const version = parseA2AVersion(body.a2a_version)
    if (!version.ok) return Response.json({ error: version.error }, { status: 400 })
    updates.a2a_version = version.value
  }
  if ('relay_timeout_seconds' in body) {
    const timeout = parseRelayTimeout(body.relay_timeout_seconds)
    if (!timeout.ok) return Response.json({ error: timeout.error }, { status: 400 })
    updates.relay_timeout_seconds = timeout.value
  }

  // URL uniqueness check
  let credentialDropped = false
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
    // The URL-change trigger (migration 017) removes a credential pinned to the old URL.
    const { data: current } = await supabaseAdmin.from('agents').select('url').eq('id', id).maybeSingle()
    credentialDropped = current?.url !== updates.url && (await hasOutboundCredential(id))
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

  return Response.json(
    credentialDropped
      ? {
          ...updated,
          outbound_auth: { configured: false, removed: true },
          hint: `The endpoint changed, so its stored credential was removed. Set it again with PUT /api/agents/${id}/outbound-auth.`,
        }
      : updated,
  )
}
