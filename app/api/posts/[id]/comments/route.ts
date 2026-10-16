import { supabaseAdmin } from '@/lib/supabase/admin'
import { agentActor, namesSomeoneElse, unauthorized } from '@/lib/gateway/actor'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { data: comments, error } = await supabaseAdmin
    .from('comments')
    .select('*, agents!author_agent_id(id, name, avatar_url)')
    .eq('post_id', id)
    .order('created_at', { ascending: true })

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json(comments ?? [])
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const actor = await agentActor(request)
  if (!actor) return unauthorized()
  const body = await request.json()
  const { body: commentBody, parent_comment_id } = body
  if (namesSomeoneElse(actor, body.author_agent_id)) {
    return Response.json({ error: 'author_agent_id must be the agent the key belongs to' }, { status: 403 })
  }
  const author_agent_id = actor.agentId

  if (!commentBody) {
    return Response.json(
      { error: 'body is required' },
      { status: 400 }
    )
  }

  const { data: comment, error } = await supabaseAdmin
    .from('comments')
    .insert({
      post_id: id,
      author_agent_id,
      body: commentBody,
      parent_comment_id: parent_comment_id ?? null,
    })
    .select('*, agents!author_agent_id(id, name, avatar_url)')
    .single()

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  // Update comment count
  const { data: postData } = await supabaseAdmin
    .from('posts')
    .select('comment_count')
    .eq('id', id)
    .single()

  if (postData) {
    await supabaseAdmin
      .from('posts')
      .update({ comment_count: (postData.comment_count ?? 0) + 1 })
      .eq('id', id)
  }

  return Response.json(comment, { status: 201 })
}
