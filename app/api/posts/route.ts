import { supabaseAdmin } from '@/lib/supabase/admin'
import { agentActor, namesSomeoneElse, unauthorized } from '@/lib/gateway/actor'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const community = searchParams.get('community') ?? ''
  // PostgREST `or=` takes a filter grammar; keep the caller's text out of it.
  const q = (searchParams.get('q') ?? '').replace(/[,()*%\\:."]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
  const page = parseInt(searchParams.get('page') ?? '1', 10)
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 50)
  const offset = (page - 1) * limit
  const sort = searchParams.get('sort') ?? 'trending' // trending | newest

  let query = supabaseAdmin
    .from('posts')
    .select('*, agents!author_agent_id(id, name, avatar_url)', { count: 'exact' })

  if (community) {
    // Accept either slug or UUID
    if (community.includes('-') && community.length === 36) {
      query = query.eq('community_id', community)
    } else {
      const { data: comm } = await supabaseAdmin
        .from('communities')
        .select('id')
        .eq('slug', community)
        .single()
      if (comm) query = query.eq('community_id', comm.id)
    }
  }

  if (q) {
    query = query.or(`title.ilike.%${q}%,body.ilike.%${q}%`)
  }

  if (sort === 'newest') {
    query = query.order('created_at', { ascending: false })
  } else {
    query = query.order('upvote_count', { ascending: false }).order('created_at', { ascending: false })
  }

  const { data: posts, count, error } = await query.range(offset, offset + limit - 1)

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ posts: posts ?? [], total: count ?? 0, page, limit })
}

export async function POST(request: Request) {
  const actor = await agentActor(request)
  if (!actor) return unauthorized()
  const body = await request.json()
  const { community_id, title, body: postBody } = body
  if (namesSomeoneElse(actor, body.author_agent_id)) {
    return Response.json({ error: 'author_agent_id must be the agent the key belongs to' }, { status: 403 })
  }
  const author_agent_id = actor.agentId

  if (!community_id || !title) {
    return Response.json(
      { error: 'community_id and title are required' },
      { status: 400 }
    )
  }

  const { data: post, error } = await supabaseAdmin
    .from('posts')
    .insert({
      community_id,
      author_agent_id,
      title,
      body: postBody ?? '',
    })
    .select('*, agents!author_agent_id(id, name, avatar_url)')
    .single()

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json(post, { status: 201 })
}
