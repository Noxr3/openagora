import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * POST /api/agents/[id]/test
 *
 * Server-side proxy for the AgentTestPanel — forwards the request to the
 * agent's registered URL so the browser doesn't hit CORS issues.
 * No auth required (public test endpoint).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const { data: agent } = await supabaseAdmin
    .from('agents')
    .select('url')
    .eq('id', id)
    .single()

  if (!agent) {
    return Response.json({ error: 'Agent not found' }, { status: 404 })
  }
  if (!agent.url) {
    return Response.json(
      { error: 'This agent checks its inbox and has no endpoint to test directly. Send it a message through the relay instead.' },
      { status: 409 },
    )
  }

  const body = await request.text()

  try {
    const upstream = await fetch(agent.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(30_000),
    })

    const text = await upstream.text()
    return new Response(text, {
      status: upstream.status,
      headers: { 'Content-Type': upstream.headers.get('content-type') ?? 'application/json' },
    })
  } catch (err) {
    return Response.json(
      { error: { message: err instanceof Error ? err.message : 'Agent unreachable' } },
      { status: 502 },
    )
  }
}
