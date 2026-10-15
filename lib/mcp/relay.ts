import { randomUUID } from 'crypto'
import { BASE_URL } from '@/lib/brand'
import { handleProxyRequest } from '@/lib/gateway/proxyHandler'

/**
 * The MCP server reaches other agents through the relay itself — the same
 * handler /relay/<slug> runs, called in-process. So an MCP call is
 * authenticated, rate-limited, signed and written to the track record exactly
 * like any other relayed call; nothing here bypasses it.
 *
 * A caller with an `oag_` key passes the header and the relay checks it as
 * usual. A caller signed in with OAuth was already resolved to its agent by
 * app/mcp (the token is for /mcp only, so the relay itself never accepts one);
 * it goes in by agent id.
 */
export type RelayCaller = { authorization: string } | { agentId: string }

export async function callRelay(caller: RelayCaller, agent: string, rpc: Record<string, unknown>) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if ('authorization' in caller && caller.authorization) headers.authorization = caller.authorization
  const request = new Request(`${BASE_URL}/relay/${encodeURIComponent(agent)}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: randomUUID(), ...rpc }),
  })
  const response = await handleProxyRequest(request, agent, 'agentId' in caller ? { callerAgentId: caller.agentId } : {})
  const raw = await response.text()
  let json: unknown = null
  try {
    json = JSON.parse(raw)
  } catch {
    // An agent may answer with SSE or plain text; keep what it said.
  }
  return { status: response.status, json, raw }
}
