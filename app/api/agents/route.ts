import { randomBytes } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { generateApiKey } from '@/lib/gateway/auth'
import { slugFromName, versionOf } from '@/lib/a2a/translate'
import { parseA2AVersion, parseRelayTimeout, readCardFromUrl } from '@/lib/agents/relay-settings'
import { credentialFromInput } from '@/lib/gateway/credential-seal'
import { CredentialsUnavailableError, credentialsAvailable, setOutboundCredential, type CredentialStatus } from '@/lib/gateway/credentials'

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

type SkillInput = { name: string; description?: string; tags?: string[] }

/**
 * POST /api/agents — register an agent.
 *
 * Either type the profile (name, url, slug, …) or give `card_url`, the https
 * URL of its A2A Agent Card: the server reads the card and fills name,
 * description, skills, provider, endpoint and A2A version. Fields in the body
 * win over the card. Optional:
 *   a2a_version            "1.0" | "0.3" | "legacy" — the relay translates for callers on other versions
 *   relay_timeout_seconds  5–280, how long the relay waits (default 30)
 *   outbound_auth          { bearer } or { header, value } — the credential the relay sends this agent
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body !== 'object') {
    return Response.json({ error: 'Send a JSON object' }, { status: 400 })
  }

  // ── From an Agent Card ──────────────────────────────────────────────────
  let card: Awaited<ReturnType<typeof readCardFromUrl>> | null = null
  if (body.card_url !== undefined && body.card_url !== null) {
    card = await readCardFromUrl(body.card_url)
    if (!card.ok) return Response.json({ error: card.error }, { status: card.status })
  }
  const facts = card?.ok ? card.facts : null

  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : facts?.name
  const url = typeof body.url === 'string' && body.url.trim() ? body.url.trim() : facts?.url
  const description = typeof body.description === 'string' ? body.description : facts?.description ?? ''
  const provider = typeof body.provider === 'string' ? body.provider : facts?.provider ?? ''
  const capabilities = Array.isArray(body.capabilities) ? body.capabilities : facts?.capabilities ?? []
  const skills = (Array.isArray(body.skills) ? body.skills : facts?.skills ?? []) as SkillInput[]
  const { avatar_url, payment_schemes, payment_address } = body

  if (!name || !url || (!body.slug && !facts)) {
    return Response.json(
      { error: 'name, url, and slug are required — or give card_url and the card fills them' },
      { status: 400 },
    )
  }

  const version = parseA2AVersion(body.a2a_version ?? (facts?.generation ? versionOf(facts.generation) : null))
  if (!version.ok) return Response.json({ error: version.error }, { status: 400 })
  const timeout = parseRelayTimeout(body.relay_timeout_seconds ?? null)
  if (!timeout.ok) return Response.json({ error: timeout.error }, { status: 400 })

  let outbound: { header: string; value: string } | null = null
  if (body.outbound_auth !== undefined && body.outbound_auth !== null) {
    const parsed = credentialFromInput(body.outbound_auth)
    if (!parsed.ok) return Response.json({ error: `outbound_auth: ${parsed.error}` }, { status: 400 })
    if (!credentialsAvailable()) {
      return Response.json({ error: new CredentialsUnavailableError().message }, { status: 503 })
    }
    outbound = { header: parsed.header, value: parsed.value }
  }

  // ── Slug ────────────────────────────────────────────────────────────────
  const explicitSlug = body.slug !== undefined && body.slug !== null && body.slug !== ''
  let slug = explicitSlug ? String(body.slug).toLowerCase().trim() : slugFromName(name)
  if (!slug || !SLUG_RE.test(slug)) {
    return Response.json(
      {
        error: explicitSlug
          ? 'slug must be 3–50 lowercase alphanumeric characters or hyphens, no leading/trailing hyphens'
          : 'Could not make a slug from the card\'s name; send one (3–50 of a-z, 0-9, -)',
      },
      { status: 400 }
    )
  }

  const [{ data: existingSlug }, { data: existingUrl }] = await Promise.all([
    supabaseAdmin.from('agents').select('id').eq('slug', slug).maybeSingle(),
    supabaseAdmin.from('agents').select('id').eq('url', url).maybeSingle(),
  ])
  if (existingUrl) {
    return Response.json({ error: 'An agent with this endpoint URL is already registered' }, { status: 409 })
  }
  if (existingSlug) {
    if (explicitSlug) return Response.json({ error: `Slug "${slug}" is already taken` }, { status: 409 })
    // A slug made from the card's name: add a short suffix rather than refuse.
    slug = `${slug.slice(0, 45).replace(/-+$/, '')}-${randomBytes(2).toString('hex')}`
  }

  const { data: agent, error: agentError } = await supabaseAdmin
    .from('agents')
    .insert({
      name,
      url,
      slug,
      description,
      provider,
      capabilities,
      avatar_url: avatar_url ?? null,
      payment_schemes: payment_schemes ?? [],
      payment_address: payment_address ?? null,
      a2a_version: version.value,
      relay_timeout_seconds: timeout.value,
      card_url: card?.ok ? card.cardUrl : null,
    })
    .select()
    .single()

  if (agentError) {
    const status = agentError.code === '23505' ? 409 : 500
    const message = agentError.code === '23505' ? `Slug "${slug}" is already taken` : agentError.message
    return Response.json({ error: message }, { status })
  }

  // Insert skills if provided
  if (skills.length > 0) {
    const skillRows = skills.map((s) => ({
      agent_id: agent.id,
      name: s.name,
      description: s.description ?? '',
      tags: s.tags ?? [],
    }))

    await supabaseAdmin.from('agent_skills').insert(skillRows)
  }

  // Auto-generate an API key for the agent
  const { key, hash } = generateApiKey()
  await supabaseAdmin
    .from('api_keys')
    .insert({ agent_id: agent.id, key_hash: hash, name: 'default' })

  // The credential the relay sends this agent, when given
  let outboundStatus: CredentialStatus | { configured: false; error: string } | undefined
  if (outbound) {
    try {
      outboundStatus = await setOutboundCredential(agent.id, agent.url, outbound.header, outbound.value)
    } catch (err) {
      outboundStatus = { configured: false, error: err instanceof Error ? err.message : 'Could not store the credential' }
    }
  }

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
      ...(outboundStatus ? { outbound_auth: outboundStatus } : {}),
      ...(facts?.requiresAuth && !outbound
        ? {
            hint: `This agent's card asks callers for a credential. Store it with PUT /api/agents/${agent.id}/outbound-auth so the relay can call it.`,
          }
        : {}),
    },
    { status: 201 }
  )
}
