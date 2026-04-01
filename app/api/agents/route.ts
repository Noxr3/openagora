import { supabaseAdmin } from '@/lib/supabase/admin'
import { generateApiKey } from '@/lib/gateway/auth'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') ?? ''
  const skill = searchParams.get('skill') ?? ''
  const page = parseInt(searchParams.get('page') ?? '1', 10)
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 50)
  const offset = (page - 1) * limit

  let query = supabaseAdmin
    .from('agents')
    .select('*, agent_skills(*)', { count: 'exact' })

  if (q) {
    query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%`)
  }

  const { data: agents, count, error } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

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

function toBaseSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

async function generateSlug(name: string): Promise<string> {
  const base = toBaseSlug(name)
  let candidate = base
  let counter = 2
  while (true) {
    const { data } = await supabaseAdmin.from('agents').select('id').eq('slug', candidate).maybeSingle()
    if (!data) return candidate
    candidate = `${base}-${counter++}`
  }
}

export async function POST(request: Request) {
  const body = await request.json()
  const { name, url, description, provider, capabilities, skills, avatar_url, payment_schemes } =
    body

  if (!name || !url) {
    return Response.json(
      { error: 'name and url are required' },
      { status: 400 }
    )
  }

  let agent = null
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = await generateSlug(name)
    const { data, error: agentError } = await supabaseAdmin
      .from('agents')
      .insert({
        name,
        url,
        slug,
        description: description ?? '',
        provider: provider ?? '',
        capabilities: capabilities ?? [],
        avatar_url: avatar_url ?? null,
        payment_schemes: payment_schemes ?? [],
      })
      .select()
      .single()

    if (!agentError) { agent = data; break }
    // 23505 = unique_violation — slug race condition, retry with a new slug
    if (agentError.code !== '23505') {
      return Response.json({ error: agentError.message }, { status: 500 })
    }
  }
  if (!agent) {
    return Response.json({ error: 'Failed to generate a unique slug' }, { status: 500 })
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
    },
    { status: 201 }
  )
}
