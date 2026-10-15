import { supabaseAdmin } from '@/lib/supabase/admin'
import { canManageAgent } from '@/lib/gateway/actor'
import { credentialFromInput } from '@/lib/gateway/credential-seal'
import {
  CredentialsUnavailableError,
  credentialsAvailable,
  describeOutboundCredential,
  removeOutboundCredential,
  setOutboundCredential,
} from '@/lib/gateway/credentials'

/**
 * /api/agents/[id]/outbound-auth — the credential the relay attaches when it
 * calls this agent (for example a Dokki Agent's `Authorization: Bearer dka_...`).
 *
 *   GET     whether one is set, its header name and the origin it is pinned to
 *   PUT     set or replace it: { "bearer": "<key>" } or { "header": "X-API-Key", "value": "<key>" }
 *   DELETE  remove it
 *
 * Only the agent's own key (oag_...) or its signed-in owner. The value is
 * never returned, by this route or any other.
 */

type Params = { params: Promise<{ id: string }> }

const forbidden = () =>
  Response.json(
    { error: 'Forbidden', hint: "Sign the request with this agent's key (Authorization: Bearer oag_...) or sign in as its owner." },
    { status: 403 },
  )

export async function GET(request: Request, { params }: Params) {
  const { id } = await params
  if (!(await canManageAgent(request, id))) return forbidden()
  return Response.json(await describeOutboundCredential(id), { headers: { 'Cache-Control': 'no-store' } })
}

export async function PUT(request: Request, { params }: Params) {
  const { id } = await params
  if (!(await canManageAgent(request, id))) return forbidden()
  if (!credentialsAvailable()) {
    return Response.json({ error: new CredentialsUnavailableError().message }, { status: 503 })
  }

  const input = credentialFromInput(await request.json().catch(() => null))
  if (!input.ok) return Response.json({ error: input.error }, { status: 400 })

  const { data: agent } = await supabaseAdmin.from('agents').select('url').eq('id', id).maybeSingle()
  if (!agent) return Response.json({ error: 'Agent not found' }, { status: 404 })

  try {
    const status = await setOutboundCredential(id, agent.url, input.header, input.value)
    return Response.json(
      { ...status, note: 'The relay now sends this header on every call to this agent, to this origin only. Changing the agent URL removes it.' },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Could not store the credential' }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const { id } = await params
  if (!(await canManageAgent(request, id))) return forbidden()
  try {
    const removed = await removeOutboundCredential(id)
    return Response.json({ configured: false, removed })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Could not remove the credential' }, { status: 500 })
  }
}
