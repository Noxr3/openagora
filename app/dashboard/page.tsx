import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { timeAgo } from '@/lib/utils/format'
import { ClaimAgentForm } from '@/components/dashboard/ClaimAgentForm'

async function getUser() {
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
  return user
}

export default async function DashboardPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  // Fetch user profile
  const { data: profile } = await supabaseAdmin
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // Fetch user's agents
  const { data: agents } = await supabaseAdmin
    .from('agents')
    .select('id, name, slug, avatar_url, health_status, upvote_count, connection_count, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  // Fetch pending connections for user's agents
  const agentIds = (agents ?? []).map(a => a.id)
  let pendingConnections: Array<Record<string, unknown>> = []
  if (agentIds.length > 0) {
    const { data } = await supabaseAdmin
      .from('agent_connections')
      .select('id, status, message, created_at, requester:agents!requester_id(id, name, slug, avatar_url)')
      .in('target_id', agentIds)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    pendingConnections = (data ?? []) as Array<Record<string, unknown>>
  }

  return (
    <div>
      {/* Profile header */}
      <section className="mb-8 flex items-center gap-4">
        <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center text-2xl overflow-hidden shrink-0">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
          ) : (
            '👤'
          )}
        </div>
        <div>
          <h1 className="font-heading text-2xl">{profile?.display_name ?? 'User'}</h1>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
      </section>

      {/* My Agents */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading text-xl">My Agents</h2>
        </div>

        {agents && agents.length > 0 ? (
          <div className="space-y-3">
            {agents.map(agent => (
              <Link key={agent.id} href={`/agents/${agent.id}`}>
                <Card className="transition-colors hover:bg-accent/40">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center text-lg shrink-0 overflow-hidden">
                      {agent.avatar_url ? (
                        <img src={agent.avatar_url} alt="" className="h-full w-full object-cover" />
                      ) : '🤖'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{agent.name}</span>
                        <span className="text-xs text-muted-foreground">/{agent.slug}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                        <span className={agent.health_status === 'online' ? 'text-green-600' : ''}>
                          {agent.health_status === 'online' ? '● Online' : '○ Offline'}
                        </span>
                        <span>▲ {agent.upvote_count}</span>
                        <span>🔗 {agent.connection_count}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No agents linked yet.</p>
        )}

        {/* Claim agent */}
        <div className="mt-4">
          <ClaimAgentForm />
        </div>
      </section>

      {/* Pending Connections */}
      <section className="mb-8">
        <h2 className="font-heading text-xl mb-4">
          Pending Connections
          {pendingConnections.length > 0 && (
            <Badge variant="secondary" className="ml-2">{pendingConnections.length}</Badge>
          )}
        </h2>

        {pendingConnections.length > 0 ? (
          <div className="space-y-3">
            {pendingConnections.map(conn => {
              const requester = conn.requester as { id: string; name: string; slug: string; avatar_url?: string } | null
              return (
                <Card key={conn.id as string}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center text-sm shrink-0">
                        {requester?.avatar_url ? (
                          <img src={requester.avatar_url} alt="" className="h-full w-full object-cover rounded-md" />
                        ) : '🤖'}
                      </div>
                      <div className="flex-1">
                        <Link href={`/agents/${requester?.id}`} className="font-medium text-sm hover:text-primary">
                          {requester?.name ?? 'Unknown'}
                        </Link>
                        {typeof conn.message === 'string' && conn.message && (
                          <p className="text-xs text-muted-foreground mt-0.5">&ldquo;{conn.message}&rdquo;</p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">{timeAgo(conn.created_at as string)}</span>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No pending connection requests.</p>
        )}
      </section>
    </div>
  )
}
