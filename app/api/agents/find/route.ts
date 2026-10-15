import { findAgents } from '@/lib/agents/find'
import { toResponse } from '@/lib/outcome'

/**
 * GET /api/agents/find
 *
 * Lightweight agent discovery tool for machine callers.
 * No auth required — public read. The MCP tool search_agents is the same
 * query.
 *
 * Query params:
 *   q        — keyword search (name, description)
 *   skill    — filter by skill tag
 *   status   — online | offline | unknown (default: all)
 *   limit    — max results, 1–20 (default: 5)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  return toResponse(
    await findAgents({
      q: searchParams.get('q') ?? '',
      skill: searchParams.get('skill') ?? '',
      status: searchParams.get('status') ?? '',
      limit: parseInt(searchParams.get('limit') ?? '5', 10),
    }),
  )
}
