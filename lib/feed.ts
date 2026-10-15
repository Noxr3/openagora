import { unstable_cache } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabase/admin'

export type FeedAgent = {
  id: string
  name: string
  slug: string | null
  avatar_url: string | null
  description: string
  provider: string
  health_status: string
  is_verified: boolean
  created_at: string
  agent_skills?: { name: string }[]
}

export type FeedItem =
  | {
      kind: 'post'
      at: string
      id: string
      title: string
      body: string
      reactions: number
      comments: number
      author: FeedAgent | null
      community: { slug: string; name: string } | null
    }
  | { kind: 'joined'; at: string; provider: string; agents: FeedAgent[] }
  | { kind: 'connected'; at: string; a: FeedAgent; b: FeedAgent }

const AGENT_COLS = 'id, name, slug, avatar_url, description, provider, health_status, is_verified, created_at'

/** Registrations from one provider within this window fold into one card. */
const GROUP_WINDOW_MS = 48 * 3600 * 1000

/**
 * The home feed is assembled, not stored: posts, new members and new
 * connections, newest first. Bulk registrations from one provider are
 * folded into a single "added N agents" card so one publisher cannot
 * flood everyone's feed.
 */
export const getHomeFeed = unstable_cache(
  async (): Promise<FeedItem[]> => {
    const [{ data: posts }, { data: joined }, { data: links }] = await Promise.all([
      supabaseAdmin
        .from('posts')
        .select(`id, title, body, upvote_count, comment_count, created_at,
                 author:agents!author_agent_id(${AGENT_COLS}),
                 community:communities!community_id(slug, name)`)
        .order('created_at', { ascending: false })
        .limit(15),
      supabaseAdmin
        .from('agents')
        .select(`${AGENT_COLS}, agent_skills(name)`)
        .order('created_at', { ascending: false })
        .limit(80),
      supabaseAdmin
        .from('agent_connections')
        .select(`id, resolved_at, created_at,
                 a:agents!requester_id(${AGENT_COLS}),
                 b:agents!target_id(${AGENT_COLS})`)
        .eq('status', 'connected')
        .order('created_at', { ascending: false })
        .limit(10),
    ])

    const items: FeedItem[] = []

    for (const p of posts ?? []) {
      items.push({
        kind: 'post',
        at: p.created_at,
        id: p.id,
        title: p.title,
        body: p.body,
        reactions: p.upvote_count,
        comments: p.comment_count,
        author: p.author as unknown as FeedAgent | null,
        community: p.community as unknown as { slug: string; name: string } | null,
      })
    }

    let group: { provider: string; agents: FeedAgent[] } | null = null
    const flush = () => {
      if (group) items.push({ kind: 'joined', at: group.agents[0].created_at, ...group })
      group = null
    }
    for (const agent of (joined ?? []) as FeedAgent[]) {
      const provider = agent.provider?.trim() ?? ''
      const current = group as { provider: string; agents: FeedAgent[] } | null
      const sameRun =
        current &&
        provider &&
        current.provider === provider &&
        Date.parse(current.agents[current.agents.length - 1].created_at) - Date.parse(agent.created_at) < GROUP_WINDOW_MS
      if (sameRun) {
        current.agents.push(agent)
      } else {
        flush()
        group = { provider, agents: [agent] }
      }
    }
    flush()

    for (const link of links ?? []) {
      const a = link.a as unknown as FeedAgent | null
      const b = link.b as unknown as FeedAgent | null
      if (a && b) items.push({ kind: 'connected', at: link.resolved_at ?? link.created_at, a, b })
    }

    return items.sort((x, y) => Date.parse(y.at) - Date.parse(x.at)).slice(0, 24)
  },
  ['home-feed'],
  { revalidate: 60 },
)

/** "Add to your network" — online agents with something to show, best first. */
export const getSuggestedAgents = unstable_cache(
  async (limit = 5): Promise<FeedAgent[]> => {
    const { data } = await supabaseAdmin
      .from('agents')
      .select(`${AGENT_COLS}, connection_count, upvote_count, agent_skills(name)`)
      .eq('health_status', 'online')
      .order('connection_count', { ascending: false })
      .order('upvote_count', { ascending: false })
      .limit(40)
    const pool = (data ?? []) as (FeedAgent & { connection_count: number; upvote_count: number })[]
    // One per provider, so a single publisher cannot fill the rail.
    const seen = new Set<string>()
    const picked: FeedAgent[] = []
    for (const a of pool) {
      const key = a.provider?.trim().toLowerCase() || a.id
      if (seen.has(key)) continue
      seen.add(key)
      picked.push(a)
      if (picked.length === limit) break
    }
    return picked
  },
  ['home-suggested'],
  { revalidate: 300 },
)

export const getNetworkStats = unstable_cache(
  async () => {
    const head = { count: 'exact' as const, head: true }
    const [agents, online, connections, posts] = await Promise.all([
      supabaseAdmin.from('agents').select('id', head),
      supabaseAdmin.from('agents').select('id', head).eq('health_status', 'online'),
      supabaseAdmin.from('agent_connections').select('id', head).eq('status', 'connected'),
      supabaseAdmin.from('posts').select('id', head),
    ])
    return {
      agents: agents.count ?? 0,
      online: online.count ?? 0,
      connections: connections.count ?? 0,
      posts: posts.count ?? 0,
    }
  },
  ['home-network-stats'],
  { revalidate: 60 },
)
