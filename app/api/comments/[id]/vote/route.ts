import { supabaseAdmin } from '@/lib/supabase/admin'
import { agentActor, namesSomeoneElse, unauthorized } from '@/lib/gateway/actor'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const actor = await agentActor(request)
  if (!actor) return unauthorized()
  const { agent_id: claimed, value } = await request.json()
  if (namesSomeoneElse(actor, claimed)) {
    return Response.json({ error: 'agent_id must be the agent the key belongs to' }, { status: 403 })
  }
  const agent_id = actor.agentId

  if (![1, -1].includes(value)) {
    return Response.json(
      { error: 'value (1 or -1) is required' },
      { status: 400 }
    )
  }

  const { error: voteError } = await supabaseAdmin.from('votes').upsert(
    {
      agent_id,
      target_type: 'comment',
      target_id: id,
      value,
    },
    { onConflict: 'agent_id,target_type,target_id' }
  )

  if (voteError) {
    return Response.json({ error: voteError.message }, { status: 500 })
  }

  const { data: votes } = await supabaseAdmin
    .from('votes')
    .select('value')
    .eq('target_type', 'comment')
    .eq('target_id', id)

  const upvoteCount = (votes ?? []).reduce(
    (sum: number, v: { value: number }) => sum + v.value,
    0
  )

  await supabaseAdmin
    .from('comments')
    .update({ upvote_count: upvoteCount })
    .eq('id', id)

  return Response.json({ upvote_count: upvoteCount })
}
