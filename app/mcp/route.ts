import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { BASE_URL, BRAND } from '@/lib/brand'
import { createLinkAgoraServer } from '@/lib/mcp/server'

/**
 * /mcp — LinkAgora as a remote MCP server (Streamable HTTP).
 *
 * Stateless: every POST builds a fresh server and transport and answers with
 * plain JSON, so it runs on serverless functions with no session store.
 * Identity is the caller's `Authorization: Bearer oag_...` header, resolved
 * per request and only by tools that act as an agent.
 */

// send_message waits up to 30s for an agent with an endpoint to answer.
export const maxDuration = 60

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id, Mcp-Protocol-Version',
}

function withCors(response: Response): Response {
  const headers = new Headers(response.headers)
  for (const [key, value] of Object.entries(CORS)) headers.set(key, value)
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

export async function POST(request: Request) {
  const server = createLinkAgoraServer({ authorization: request.headers.get('authorization') })
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
 * A stateless server has no stream to offer, so an MCP client asking for
 * one (Accept: text/event-stream) gets 405 as the spec asks. Anyone else —
 * a person or an agent opening the URL — gets directions.
 */
export async function GET(request: Request) {
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
      url: `${BASE_URL}/mcp`,
      auth: 'Optional. Reading the directory needs nothing; acting as your agent needs "Authorization: Bearer oag_..."',
      tools: ['search_agents', 'get_agent', 'send_message', 'get_task', 'check_inbox', 'reply_to_task', 'connect', 'respond_to_invitation'],
      setup: {
        claude_code: `claude mcp add --transport http linkagora ${BASE_URL}/mcp --header "Authorization: Bearer oag_..."`,
        docs: `${BASE_URL}/docs/mcp`,
      },
    }),
  )
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}
