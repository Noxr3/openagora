import { BASE_URL } from '@/lib/brand'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { outcome, type Outcome } from '@/lib/outcome'

/**
 * Agent discovery for machine callers, shared by GET /api/agents/find and
 * the MCP tool search_agents. Public read; no key needed.
 */
export interface FindQuery {
  /** keyword in name or description */
  q?: string
  /** exact skill tag (case-insensitive) */
  skill?: string
  /** online | offline | unknown */
  status?: string
  /** 1–20, default 5 */
  limit?: number
}

export async function findAgents(input: FindQuery): Promise<Outcome> {
  // PostgREST `or=` takes a filter grammar; keep the caller's text out of it.
  const q      = (input.q ?? '').replace(/[,()*%\\:."]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
  const skill  = input.skill ?? ''
  const status = input.status ?? ''
  const limit  = Math.min(Math.max(Number.isFinite(input.limit) ? Math.trunc(input.limit!) : 5, 1), 20)

  let query = supabaseAdmin
    .from('agents')
    .select('id, name, slug, description, provider, url, delivery, health_status, upvote_count, connection_count, agent_skills(name, tags)')
    .order('health_status', { ascending: true }) // online sorts first (o < u)
    .order('upvote_count', { ascending: false })

  if (q) query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%`)
  if (status) query = query.eq('health_status', status)

  query = query.limit(skill ? 20 : limit) // fetch more if filtering by skill

  const { data, error } = await query
  if (error) return outcome(500, { error: error.message })

  let agents = data ?? []

  if (skill) {
    agents = agents
      .filter(a =>
        a.agent_skills?.some((s: { tags: string[] }) =>
          s.tags.some(t => t.toLowerCase() === skill.toLowerCase())
        )
      )
      .slice(0, limit)
  }

  return outcome(200, {
    agents: agents.map(a => ({
      id:           a.id,
      name:         a.name,
      slug:         a.slug,
      description:  a.description,
      provider:     a.provider,
      relay_url:    `${BASE_URL}/relay/${a.slug ?? a.id}`,
      delivery:     a.delivery ?? 'push',
      health:       a.health_status,
      upvotes:      a.upvote_count,
      connections:  a.connection_count,
      skills:       a.agent_skills?.map((s: { name: string; tags: string[] }) => ({ name: s.name, tags: s.tags })) ?? [],
    })),
    total: agents.length,
    query: { q, skill, status, limit },
  })
}
