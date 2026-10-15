import { supabaseAdmin } from '@/lib/supabase/admin'
import { generateApiKey } from '@/lib/gateway/auth'
import { BASE_URL } from '@/lib/brand'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  // PostgREST `or=` takes a filter grammar; keep the caller's text out of it.
  const q = (searchParams.get('q') ?? '').replace(/[,()*%\\:."]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
  const skill = searchParams.get('skill') ?? ''
  const status = searchParams.get('status') ?? ''   // online | offline | unknown
  const provider = searchParams.get('provider') ?? ''
  const page = parseInt(searchParams.get('page') ?? '1', 10)
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 50)
  const offset = (page - 1) * limit

  let query = supabaseAdmin
    .from('agents')
    .select('*, agent_skills(*)', { count: 'exact' })

  if (q) {
    query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%,slug.ilike.%${q}%`)
  }
  if (status) {
    query = query.eq('health_status', status)
  }
  if (provider) {
    query = query.ilike('provider', `%${provider}%`)
  }

  // Also fetch exact name/slug matches separately to guarantee they appear
  let exactQuery = q
    ? supabaseAdmin
        .from('agents')
        .select('*, agent_skills(*)')
        .or(`name.ilike.${q},slug.eq.${q.toLowerCase()}`)
    : null
  if (exactQuery && status) exactQuery = exactQuery.eq('health_status', status)
  if (exactQuery && provider) exactQuery = exactQuery.ilike('provider', `%${provider}%`)
  const exactPromise = exactQuery?.limit(3) ?? null

  const mainResult = await query.order('created_at', { ascending: false }).range(offset, offset + limit - 1)
  const { data: agents, count, error } = mainResult
  const exactResult = exactPromise ? await exactPromise : { data: [] as typeof agents }

  // Merge exact matches to the front, deduplicating by id
  const exactMatches = (exactResult?.data ?? []) as NonNullable<typeof agents>
  if (q && agents && exactMatches.length > 0) {
    const existingIds = new Set(agents.map(a => a.id))
    const toInsert = exactMatches.filter(a => !existingIds.has(a.id))
    agents.unshift(...toInsert)

    // Sort: exact name > prefix name > the rest
    const lower = q.toLowerCase()
    agents.sort((a, b) => {
      const aName = (a.name ?? '').toLowerCase()
      const bName = (b.name ?? '').toLowerCase()
      const aExact = aName === lower ? 0 : aName.startsWith(lower) ? 1 : 2
      const bExact = bName === lower ? 0 : bName.startsWith(lower) ? 1 : 2
      return aExact - bExact
    })
  }

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  // Filter by skill tag client-side if needed (simpler than join filter)
  let filtered = agents ?? []
  if (skill) {
    filtered = filtered.filter((agent: Record<string, unknown>) =>
      (agent.agent_skills as Array<{ tags: string[] }>)?.some((s) =>
        s.tags.some((t) => t.toLowerCase() === skill.toLowerCase())
      )
    )
  }

  return Response.json({ agents: filtered, total: count ?? 0, page, limit })
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/

export async function POST(request: Request) {
  const body = await request.json()
  const { name, url, description, provider, capabilities, skills, avatar_url, payment_schemes, payment_address, slug: rawSlug } =
    body

  // push: the relay forwards calls to `url`. pull: the agent has no public
  // endpoint and checks GET /api/inbox instead.
  const delivery = body.delivery === 'pull' ? 'pull' : 'push'
  if (!name || !rawSlug || (delivery === 'push' && !url)) {
    return Response.json(
      { error: 'name and slug are required, and url too unless "delivery": "pull"' },
      { status: 400 },
    )
  }

  const slug = String(rawSlug).toLowerCase().trim()
  if (!SLUG_RE.test(slug)) {
    return Response.json(
      { error: 'slug must be 3–50 lowercase alphanumeric characters or hyphens, no leading/trailing hyphens' },
      { status: 400 }
    )
  }

  const [{ data: existingSlug }, { data: existingUrl }] = await Promise.all([
    supabaseAdmin.from('agents').select('id').eq('slug', slug).maybeSingle(),
    delivery === 'push'
      ? supabaseAdmin.from('agents').select('id').eq('url', url).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  if (existingSlug) {
    return Response.json({ error: `Slug "${slug}" is already taken` }, { status: 409 })
  }
  if (existingUrl) {
    return Response.json({ error: 'An agent with this endpoint URL is already registered' }, { status: 409 })
  }

  const { data: agent, error: agentError } = await supabaseAdmin
    .from('agents')
    .insert({
      name,
      url: delivery === 'push' ? url : null,
      delivery,
      slug,
      description: description ?? '',
      provider: provider ?? '',
      capabilities: capabilities ?? [],
      avatar_url: avatar_url ?? null,
      payment_schemes: payment_schemes ?? [],
      payment_address: payment_address ?? null,
    })
    .select()
    .single()

  if (agentError) {
    const status = agentError.code === '23505' ? 409 : 500
    const message = agentError.code === '23505' ? `Slug "${slug}" is already taken` : agentError.message
    return Response.json({ error: message }, { status })
  }

  // Insert skills if provided
  if (skills?.length > 0) {
    const skillRows = skills.map(
      (s: { name: string; description?: string; tags?: string[] }) => ({
        agent_id: agent.id,
        name: s.name,
        description: s.description ?? '',
        tags: s.tags ?? [],
      })
    )

    await supabaseAdmin.from('agent_skills').insert(skillRows)
  }

  // Auto-generate an API key for the agent
  const { key, hash } = generateApiKey()
  await supabaseAdmin
    .from('api_keys')
    .insert({ agent_id: agent.id, key_hash: hash, name: 'default' })

  // Re-fetch with skills
  const { data: fullAgent } = await supabaseAdmin
    .from('agents')
    .select('*, agent_skills(*)')
    .eq('id', agent.id)
    .single()

  return Response.json(
    {
      ...fullAgent,
      api_key: key,
      warning: 'Store this key securely. It will not be shown again.',
      profile: `${BASE_URL}/agents/${slug}`,
      ...(delivery === 'pull'
        ? {
            inbox: {
              url: `${BASE_URL}/api/inbox`,
              how: 'Check in with GET inbox.url and Authorization: Bearer <api_key> about once a minute. Answer each task with POST to its reply.url. While you keep checking in, your profile shows you as online.',
            },
          }
        : {}),
    },
    { status: 201 }
  )
}
