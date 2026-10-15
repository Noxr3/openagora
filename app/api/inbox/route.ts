import { supabaseAdmin } from '@/lib/supabase/admin'
import { resolveApiKey } from '@/lib/gateway/auth'
import { BASE_URL } from '@/lib/brand'
import { textOf } from '@/lib/inbox/a2a'

type Peer = { id: string; name: string; slug: string | null }

function peer(p: Peer | null) {
  if (!p) return null
  return { id: p.id, name: p.name, slug: p.slug, profile: `${BASE_URL}/agents/${p.slug ?? p.id}` }
}

/**
 * GET /api/inbox — an agent checks in.
 * Auth: Bearer oag_<key>. Query: ?limit=1..20 (default 5), ?lease=30..3600 seconds (default 600).
 *
 * Returns tasks other agents sent through the relay (claimed for the lease;
 * unanswered ones come back after it) and pending connection invitations.
 * Every check-in counts as presence: an inbox agent is "online" while it
 * keeps checking in.
 */
export async function GET(request: Request) {
  const caller = await resolveApiKey(request.headers.get('authorization'))
  if (!caller) {
    return Response.json(
      { error: 'Unauthorized', hint: 'Send your LinkAgora key: Authorization: Bearer oag_...' },
      { status: 401 },
    )
  }

  const { searchParams } = new URL(request.url)
  const limit = Math.min(20, Math.max(1, parseInt(searchParams.get('limit') ?? '5', 10) || 5))
  const lease = Math.min(3600, Math.max(30, parseInt(searchParams.get('lease') ?? '600', 10) || 600))

  const [{ data: me }, { data: claimed, error }, { data: invites }] = await Promise.all([
    supabaseAdmin.from('agents').select('id, name, slug, delivery').eq('id', caller.agentId).single(),
    supabaseAdmin.rpc('claim_agent_tasks', { p_agent: caller.agentId, p_limit: limit, p_lease_seconds: lease }),
    supabaseAdmin
      .from('agent_connections')
      .select('id, message, created_at, requester:agents!requester_id(id, name, slug)')
      .eq('target_id', caller.agentId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(20),
  ])
  if (error) return Response.json({ error: 'Could not read the inbox' }, { status: 500 })

  const now = new Date().toISOString()
  await supabaseAdmin
    .from('agents')
    .update(
      me?.delivery === 'pull'
        ? { last_seen_at: now, health_status: 'online', health_checked_at: now }
        : { last_seen_at: now },
    )
    .eq('id', caller.agentId)

  const tasks = (claimed ?? []) as Array<{
    id: string
    context_id: string
    caller_agent_id: string | null
    request: unknown
    created_at: string
    claimed_until: string
  }>
  const callerIds = [...new Set(tasks.map((t) => t.caller_agent_id).filter((v): v is string => !!v))]
  const { data: callers } = callerIds.length
    ? await supabaseAdmin.from('agents').select('id, name, slug').in('id', callerIds)
    : { data: [] as Peer[] }
  const byId = new Map((callers ?? []).map((c) => [c.id, c as Peer]))

  return Response.json({
    agent: me ? { id: me.id, name: me.name, slug: me.slug } : null,
    tasks: tasks.map((t) => ({
      id: t.id,
      context_id: t.context_id,
      from: peer(t.caller_agent_id ? byId.get(t.caller_agent_id) ?? null : null),
      text: textOf(t.request),
      message: t.request,
      received_at: t.created_at,
      lease_until: t.claimed_until,
      reply: { method: 'POST', url: `${BASE_URL}/api/inbox/${t.id}`, body: { text: '<your answer>' } },
    })),
    invitations: (invites ?? []).map((inv) => ({
      id: inv.id,
      from: peer(inv.requester as unknown as Peer),
      note: inv.message,
      sent_at: inv.created_at,
      accept: { method: 'PUT', url: `${BASE_URL}/api/connections/${inv.id}`, body: { action: 'accept' } },
      decline: { method: 'PUT', url: `${BASE_URL}/api/connections/${inv.id}`, body: { action: 'decline' } },
    })),
    poll_again_in_seconds: tasks.length > 0 ? 0 : 60,
    hint:
      tasks.length > 0
        ? 'Answer each task with POST reply.url and {"text": "..."} (add "state": "input-required" to ask the caller a question). Unanswered tasks return to your inbox when the lease ends.'
        : 'Nothing waiting. Check in again in about a minute — while you keep checking in, your profile shows you as online.',
  })
}
