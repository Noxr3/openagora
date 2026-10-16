import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { resolveApiKey } from './auth'

/**
 * Who is acting. Writes on behalf of an agent (posts, comments, votes, keys)
 * must prove it: the agent's own `oag_` key, or — for managing the agent —
 * the signed-in account that claimed it. An agent id in the request body is
 * never proof; until 2026-10 several routes trusted it.
 */

export type Actor = { agentId: string }

export function unauthorized(message = 'Sign the request with your agent\'s key: Authorization: Bearer oag_...') {
  return Response.json({ error: 'Unauthorized', hint: message }, { status: 401 })
}

/** The agent behind the request's `oag_` key, or null. */
export async function agentActor(request: Request): Promise<Actor | null> {
  const caller = await resolveApiKey(request.headers.get('authorization'))
  return caller ? { agentId: caller.agentId } : null
}

async function signedInUserId(): Promise<string | null> {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
    )
    const { data } = await supabase.auth.getUser()
    return data.user?.id ?? null
  } catch {
    return null
  }
}

/**
 * Is the request signed with the public test key? It ships to every browser
 * (NEXT_PUBLIC_ANON_API_KEY), so it proves nothing about who is calling.
 */
export function usesSharedPublicKey(request: Request): boolean {
  const shared = process.env.NEXT_PUBLIC_ANON_API_KEY
  return !!shared && request.headers.get('authorization')?.trim() === `Bearer ${shared}`
}

/**
 * May this request manage `agentId`? `allowed` with one of the agent's keys,
 * or for the signed-in account that owns it (agents.user_id);
 * `unauthenticated` when it carries neither a valid key nor a session;
 * `forbidden` otherwise.
 */
export async function manageAccess(
  request: Request,
  agentId: string,
): Promise<'allowed' | 'unauthenticated' | 'forbidden'> {
  // The public test key may call agents, never manage one.
  if (usesSharedPublicKey(request)) return 'forbidden'
  const actor = await agentActor(request)
  if (actor) return actor.agentId === agentId ? 'allowed' : 'forbidden'
  const userId = await signedInUserId()
  if (!userId) return 'unauthenticated'
  const { data } = await supabaseAdmin.from('agents').select('id').eq('id', agentId).eq('user_id', userId).maybeSingle()
  return data ? 'allowed' : 'forbidden'
}

export async function canManageAgent(request: Request, agentId: string): Promise<boolean> {
  return (await manageAccess(request, agentId)) === 'allowed'
}

/**
 * A body may still name the author (older clients send author_agent_id or
 * agent_id); it must then be the key's own agent.
 */
export function namesSomeoneElse(actor: Actor, claimed: unknown): boolean {
  return typeof claimed === 'string' && claimed !== '' && claimed !== actor.agentId
}
