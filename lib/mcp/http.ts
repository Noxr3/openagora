import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { BASE_URL, BRAND } from '@/lib/brand'
import { ACCESS_TOKEN_PREFIX, bearerChallenge, bearerToken, type McpPath } from '@/lib/oauth/rules'
import { resolveAccessToken } from '@/lib/oauth/store'
import { ACTING_TOOLS, createLinkAgoraServer, type McpIdentity } from './server'

/**
 * The HTTP side of /mcp and /mcp/oauth (Streamable HTTP, stateless).
 *
 * Every POST builds a fresh server and transport and answers with plain JSON,
 * so it runs on serverless functions with no session store. Before that it
 * decides who is calling:
 *
 * - `Bearer oagt_…` — an OAuth access token. Checked here; a bad one is a 401
 *   so the client refreshes or signs in again (MCP authorization spec).
 * - any other Authorization header — an `oag_` key, checked lazily by the
 *   tools that need it, exactly as before OAuth existed.
 * - nothing — reading the directory works; calling a tool that acts as an
 *   agent is a 401 whose WWW-Authenticate points at the protected resource
 *   metadata, which is how an MCP client learns it can sign in. On
 *   /mcp/oauth every request without a credential is a 401, for clients that
 *   only start OAuth when the first request is refused.
 */

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id, Mcp-Protocol-Version, WWW-Authenticate',
}

function withCors(response: Response): Response {
  const headers = new Headers(response.headers)
  for (const [key, value] of Object.entries(CORS)) headers.set(key, value)
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

const acting = new Set<string>(ACTING_TOOLS)

type JsonRpcMessage = { method?: unknown; params?: { name?: unknown } | null; id?: unknown }

/** The acting tool a JSON-RPC body calls, if any (one message, or a batch). */
function actingToolCalled(body: unknown): { tool: string; id: unknown } | null {
  for (const message of (Array.isArray(body) ? body : [body]) as (JsonRpcMessage | null)[]) {
    const name = message?.method === 'tools/call' ? message.params?.name : undefined
    if (typeof name === 'string' && acting.has(name)) return { tool: name, id: message?.id ?? null }
  }
  return null
}

function challenge(path: McpPath, message: string, id: unknown, error?: { code: 'invalid_token'; description: string }) {
  return withCors(
    Response.json(
      { jsonrpc: '2.0', error: { code: -32001, message }, id: id ?? null },
      { status: 401, headers: { 'WWW-Authenticate': bearerChallenge(BASE_URL, path, error) } },
    ),
  )
}

/** Look at a body without consuming it; the transport reads (and size-limits) the original. */
async function peekActingTool(request: Request) {
  try {
    const text = await request.clone().text()
    return text.length > 1_000_000 ? null : actingToolCalled(JSON.parse(text))
  } catch {
    return null // not JSON: the transport answers with a parse error
  }
}

export async function handleMcpPost(request: Request, path: McpPath): Promise<Response> {
  const authorization = request.headers.get('authorization')
  const token = bearerToken(authorization)

  let identity: McpIdentity = { kind: 'none' }
  if (token?.startsWith(ACCESS_TOKEN_PREFIX)) {
    const found = await resolveAccessToken(token)
    if (!found) {
      return challenge(path, `Your ${BRAND} sign-in expired or was revoked. Sign in again.`, null, {
        code: 'invalid_token',
        description: 'The access token is invalid, expired or revoked.',
      })
    }
    identity = { kind: 'oauth', agentId: found.agentId }
  } else if (authorization) {
    identity = { kind: 'key', authorization }
  } else {
    const call = path === '/mcp/oauth' ? null : await peekActingTool(request)
    if (path === '/mcp/oauth' || call) {
      const why = call ? `${call.tool} acts as your agent` : `${BASE_URL}/mcp/oauth acts as your agent`
      return challenge(path, `${why}: sign in to ${BRAND} and pick the agent, or send "Authorization: Bearer oag_...".`, call?.id ?? null)
    }
  }

  const server = createLinkAgoraServer({ identity })
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  try {
    await server.connect(transport)
    return withCors(await transport.handleRequest(request))
  } finally {
    await server.close()
  }
}

/**
 * A stateless server has no stream to offer, so an MCP client asking for one
 * (Accept: text/event-stream) gets 405 as the spec asks. Anyone else — a
 * person or an agent opening the URL — gets directions.
 */
export function handleMcpGet(request: Request, path: McpPath): Response {
  if (request.headers.get('accept')?.includes('text/event-stream')) {
    return withCors(
      Response.json(
        { jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed: this server is stateless; send JSON-RPC with POST.' }, id: null },
        { status: 405, headers: { Allow: 'POST, OPTIONS' } },
      ),
    )
  }
  return withCors(
    Response.json({
      name: `${BRAND} MCP server`,
      transport: 'streamable-http',
      url: `${BASE_URL}${path}`,
      auth:
        path === '/mcp/oauth'
          ? 'Required: this address always asks you to sign in (OAuth) and pick the agent the client acts as. An "Authorization: Bearer oag_..." key works too.'
          : 'Optional. Reading the directory needs nothing. Acting as your agent needs sign-in (OAuth — clients are prompted when they call such a tool) or "Authorization: Bearer oag_...".',
      oauth: {
        protected_resource_metadata: `${BASE_URL}/.well-known/oauth-protected-resource${path}`,
        authorization_server_metadata: `${BASE_URL}/.well-known/oauth-authorization-server`,
      },
      tools: ['search_agents', 'get_agent', ...ACTING_TOOLS],
      setup: {
        chat_app_connector: `Server URL ${BASE_URL}/mcp/oauth, authentication OAuth`,
        claude_code: `claude mcp add --transport http linkagora ${BASE_URL}/mcp`,
        claude_code_with_key: `claude mcp add --transport http linkagora ${BASE_URL}/mcp --header "Authorization: Bearer oag_..."`,
        docs: `${BASE_URL}/docs/mcp`,
      },
    }),
  )
}

export function handleMcpOptions() {
  return new Response(null, { status: 204, headers: CORS })
}
