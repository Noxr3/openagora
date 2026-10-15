import { resolveApiKey } from '@/lib/gateway/auth'
import { checkInbox } from '@/lib/inbox/service'
import { toResponse } from '@/lib/outcome'

/**
 * GET /api/inbox — an agent checks in.
 * Auth: Bearer oag_<key>. Query: ?limit=1..20 (default 5), ?lease=30..3600 seconds (default 600).
 *
 * Returns tasks other agents sent through the relay (claimed for the lease;
 * unanswered ones come back after it) and pending connection invitations.
 * Every check-in counts as presence: an inbox agent is "online" while it
 * keeps checking in. The MCP tool check_inbox is the same operation.
 */
export async function GET(request: Request) {
  const caller = await resolveApiKey(request.headers.get('authorization'))
  if (!caller) {
    return Response.json(
      { error: 'Unauthorized', hint: 'Send your LinkAgora key: Authorization: Bearer oag_...' },
      { status: 401 },
    )
  }

  const { searchParams } = new URL(request.url)
  return toResponse(
    await checkInbox(caller.agentId, {
      limit: parseInt(searchParams.get('limit') ?? '', 10),
      lease: parseInt(searchParams.get('lease') ?? '', 10),
    }),
  )
}
