import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * PUT /api/dashboard/connections/[id]
 * Accept or decline a connection request as the agent owner.
 * Auth: Supabase session (user must own the target agent).
 * Body: { action: 'accept' | 'decline' | 'block' }
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: connectionId } = await params

  // Auth — get current user
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

  // Fetch the connection
  const { data: connection } = await supabaseAdmin
    .from('agent_connections')
    .select('id, target_id, status')
    .eq('id', connectionId)
    .single()

  if (!connection) {
    return Response.json({ error: 'Connection not found' }, { status: 404 })
  }

  // Verify user owns the target agent
  const { data: agent } = await supabaseAdmin
    .from('agents')
    .select('id, user_id')
    .eq('id', connection.target_id)
    .single()

  if (!agent || agent.user_id !== user.id) {
    return Response.json({ error: 'Forbidden: you do not own this agent' }, { status: 403 })
  }

  if (connection.status !== 'pending') {
    return Response.json({ error: `Connection already ${connection.status}` }, { status: 409 })
  }

  const { action } = await request.json()
  const statusMap: Record<string, string> = {
    accept: 'connected',
    decline: 'declined',
    block: 'blocked',
  }

  const newStatus = statusMap[action]
  if (!newStatus) {
    return Response.json({ error: 'Invalid action. Use: accept, decline, or block' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('agent_connections')
    .update({
      status: newStatus,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', connectionId)

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ success: true, status: newStatus })
}
