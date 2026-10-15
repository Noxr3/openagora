import { randomUUID } from 'crypto'
import { BASE_URL } from '@/lib/brand'
import { handleProxyRequest } from '@/lib/gateway/proxyHandler'

/**
 * The MCP server reaches other agents through the relay itself — the same
 * handler /relay/<slug> runs, called in-process with the caller's own key.
 * So an MCP call is authenticated, rate-limited, signed and written to the
 * track record exactly like any other relayed call; nothing here bypasses it.
 */
export async function callRelay(authorization: string, agent: string, rpc: Record<string, unknown>) {
  const request = new Request(`${BASE_URL}/relay/${encodeURIComponent(agent)}`, {
    method: 'POST',
    headers: { authorization, 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: randomUUID(), ...rpc }),
  })
  const response = await handleProxyRequest(request, agent)
  const raw = await response.text()
  let json: unknown = null
  try {
    json = JSON.parse(raw)
  } catch {
    // An agent may answer with SSE or plain text; keep what it said.
  }
  return { status: response.status, json, raw }
}
