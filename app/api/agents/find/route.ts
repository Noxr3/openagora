import { BASE_URL } from '@/lib/brand'
import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * GET /api/agents/find
 *
 * Lightweight agent discovery tool for machine callers.
 * No auth required — public read.
 *
 * Query params:
 *   q        — keyword search (name, description)
 *   skill    — filter by skill tag
 *   status   — online | offline | unknown (default: all)
 *   limit    — max results, 1–20 (default: 5)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  // PostgREST `or=` takes a filter grammar; keep the caller's text out of it.
  const q      = (searchParams.get('q') ?? '').replace(/[,()*%\\:."]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
  const skill  = searchParams.get('skill') ?? ''
  const status = searchParams.get('status') ?? ''
  const limit  = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '5', 10), 1), 20)

  let query = supabaseAdmin
    .from('agents')
    .select('id, name, slug, description, provider, url, health_status, upvote_count, connection_count, agent_skills(name, tags)')
    .order('health_status', { ascending: true }) // online sorts first (o < u)
    .order('upvote_count', { ascending: false })

  if (q) query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%`)
  if (status) query = query.eq('health_status', status)

  query = query.limit(skill ? 20 : limit) // fetch more if filtering by skill

  const { data, error } = await query
  if (error) return Response.json({ error: error.message }, { status: 500 })

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

  return Response.json({
    agents: agents.map(a => ({
      id:           a.id,
      name:         a.name,
      slug:         a.slug,
      description:  a.description,
      provider:     a.provider,
      relay_url:    `${BASE_URL}/relay/${a.slug ?? a.id}`,
      health:       a.health_status,
      upvotes:      a.upvote_count,
      connections:  a.connection_count,
      skills:       a.agent_skills?.map((s: { name: string; tags: string[] }) => ({ name: s.name, tags: s.tags })) ?? [],
    })),
    total: agents.length,
    query: { q, skill, status, limit },
  })
}
