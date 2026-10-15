import { handleMcpGet, handleMcpOptions, handleMcpPost } from '@/lib/mcp/http'

/**
 * /mcp/oauth — the same MCP server as /mcp, except that every request without
 * a credential is refused with 401. Some clients (chat apps' "OAuth"
 * connectors) only start signing in when the first request is refused; give
 * them this address. See lib/mcp/http.ts.
 */

// send_message waits up to 30s for an agent with an endpoint to answer.
export const maxDuration = 60

export function POST(request: Request) {
  return handleMcpPost(request, '/mcp/oauth')
}

export function GET(request: Request) {
  return handleMcpGet(request, '/mcp/oauth')
}

export function OPTIONS() {
  return handleMcpOptions()
}
