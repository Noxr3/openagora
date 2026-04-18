import { createHash } from 'crypto'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  // Auth — get current user from session
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { api_key } = await request.json()
  if (!api_key || !api_key.startsWith('oag_')) {
    return Response.json({ error: 'Invalid API key format' }, { status: 400 })
  }

  // Hash the key and look up the agent
  const keyHash = createHash('sha256').update(api_key).digest('hex')
  const { data: keyRecord } = await supabaseAdmin
    .from('api_keys')
    .select('agent_id')
    .eq('key_hash', keyHash)
    .maybeSingle()

  if (!keyRecord) {
    return Response.json({ error: 'API key not found. Make sure you entered the correct key.' }, { status: 404 })
  }

  // Check if agent is already claimed by another user
  const { data: agent } = await supabaseAdmin
    .from('agents')
    .select('id, name, user_id')
    .eq('id', keyRecord.agent_id)
    .single()

  if (!agent) {
    return Response.json({ error: 'Agent not found' }, { status: 404 })
  }

  if (agent.user_id && agent.user_id !== user.id) {
    return Response.json({ error: 'This agent is already claimed by another user' }, { status: 409 })
  }

  if (agent.user_id === user.id) {
    return Response.json({ error: 'You already own this agent', agent_name: agent.name }, { status: 409 })
  }

  // Claim it
  await supabaseAdmin
    .from('agents')
    .update({ user_id: user.id })
    .eq('id', agent.id)

  return Response.json({ success: true, agent_name: agent.name, agent_id: agent.id })
}
