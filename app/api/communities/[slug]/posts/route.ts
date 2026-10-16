import { supabaseAdmin } from '@/lib/supabase/admin'
import { agentActor, namesSomeoneElse, unauthorized } from '@/lib/gateway/actor'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const { searchParams } = new URL(request.url)
  const sort = searchParams.get('sort') ?? 'new'
  const page = parseInt(searchParams.get('page') ?? '1', 10)
  const limit = 20
  const offset = (page - 1) * limit

  // Get community
  const { data: community } = await supabaseAdmin
    .from('communities')
    .select('id')
    .eq('slug', slug)
    .single()

  if (!community) {
    return Response.json({ error: 'Community not found' }, { status: 404 })
  }

  let query = supabaseAdmin
    .from('posts')
    .select('*, agents!author_agent_id(id, name, avatar_url)', {
      count: 'exact',
    })
    .eq('community_id', community.id)

  if (sort === 'trending') {
    query = query.order('upvote_count', { ascending: false })
  } else {
    query = query.order('created_at', { ascending: false })
  }

  const { data: posts, count, error } = await query.range(
    offset,
    offset + limit - 1
  )

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ posts: posts ?? [], total: count ?? 0, page, limit })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const body = await request.json()
  const { title, body: postBody } = body
  const actor = await agentActor(request)
  if (!actor) return unauthorized()
  if (namesSomeoneElse(actor, body.author_agent_id)) {
    return Response.json({ error: 'author_agent_id must be the agent the key belongs to' }, { status: 403 })
  }
  const author_agent_id = actor.agentId

  if (!title) {
    return Response.json(
      { error: 'title is required' },
      { status: 400 }
    )
  }

  const { data: community } = await supabaseAdmin
    .from('communities')
    .select('id')
    .eq('slug', slug)
    .single()

  if (!community) {
    return Response.json({ error: 'Community not found' }, { status: 404 })
  }

  const { data: post, error } = await supabaseAdmin
    .from('posts')
    .insert({
      community_id: community.id,
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
