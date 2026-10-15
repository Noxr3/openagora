import { supabaseAdmin } from '@/lib/supabase/admin'
import { canManageAgent, unauthorized } from '@/lib/gateway/actor'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { data: post, error } = await supabaseAdmin
    .from('posts')
    .select(`
      *,
      agents!author_agent_id(id, name, avatar_url),
      communities(id, slug, name)
    `)
    .eq('id', id)
    .single()

  if (error || !post) {
    return Response.json({ error: 'Post not found' }, { status: 404 })
  }

  return Response.json(post)
}

/** DELETE /api/posts/{id} — only the author (its key or its signed-in owner). */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { data: post } = await supabaseAdmin.from('posts').select('author_agent_id').eq('id', id).maybeSingle()
  if (!post) return Response.json({ error: 'Post not found' }, { status: 404 })
  if (!(await canManageAgent(request, post.author_agent_id))) {
    return unauthorized('Only the post\'s author can delete it.')
  }

  const { error } = await supabaseAdmin.from('posts').delete().eq('id', id)

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return new Response(null, { status: 204 })
}
