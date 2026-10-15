import { supabaseAdmin } from '@/lib/supabase/admin'
import type { A2AAgentCard } from '@/lib/types/a2a'
import { BASE_URL } from '@/lib/brand'

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

  const paymentSchemes: unknown[] = agent.payment_schemes ?? []

  // Build capability extensions for payment protocols
  const paymentExtensions = paymentSchemes.map((scheme: unknown) => {
    const s = scheme as { type: string; networks?: string[]; assets?: string[]; methods?: string[]; intents?: string[] }
    if (s.type === 'x402') {
      return {
        uri: 'https://github.com/google-a2a/a2a-x402/v0.1',
        description: `x402 on-chain payments. Networks: ${(s.networks ?? []).join(', ')}. Assets: ${(s.assets ?? []).join(', ')}.`,
        required: false,
      }
    }
    if (s.type === 'mpp') {
      return {
        uri: 'https://mpp.dev/a2a-extension/v1',
        description: `MPP (Machine Payments Protocol). Rails: ${(s.methods ?? []).join(', ')}. Billing: ${(s.intents ?? []).join(', ')}.`,
        required: false,
      }
    }
    return null
  }).filter(Boolean)

  const card: A2AAgentCard & { 'x-payment-schemes'?: unknown[] } = {
    name: agent.name,
    description: agent.description,
    // An inbox agent has no endpoint of its own: callers reach it through the
    // relay, which queues the message and answers with a Task to poll.
    url: agent.delivery === 'pull' || !agent.url ? `${BASE_URL}/relay/${agent.slug ?? agent.id}` : agent.url,
    version: '1.0.0',
    provider: {
      organization: agent.provider || 'Unknown',
    },
    capabilities: {
      streaming: agent.delivery !== 'pull' && (agent.capabilities ?? []).includes('streaming'),
      pushNotifications: (agent.capabilities ?? []).includes('pushNotifications'),
      stateTransitionHistory: (agent.capabilities ?? []).includes('stateTransitionHistory'),
      ...(paymentExtensions.length > 0 ? { extensions: paymentExtensions } : {}),
    },
    authentication: {
      schemes: agent.security_schemes?.schemes ?? ['none'],
      credentials: agent.security_schemes?.credentials,
    },
    defaultInputModes: ['text/plain', 'application/json'],
    defaultOutputModes: ['text/plain', 'application/json'],
    skills: (agent.agent_skills ?? []).map(
      (s: { id: string; name: string; description: string; tags: string[] }) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        tags: s.tags,
      })
    ),
    // Non-standard extension field for payment discovery
    ...(paymentSchemes.length > 0 ? { 'x-payment-schemes': paymentSchemes } : {}),
  }

  return Response.json(card, {
    headers: { 'Cache-Control': 'public, max-age=300' },
  })
}
