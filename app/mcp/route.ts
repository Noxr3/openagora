import { handleMcpGet, handleMcpOptions, handleMcpPost } from '@/lib/mcp/http'

/**
 * /mcp — LinkAgora as a remote MCP server (Streamable HTTP, stateless).
 * Reading the directory needs no credential; acting as an agent needs an
 * OAuth sign-in or the agent's `oag_` key. See lib/mcp/http.ts.
 */

// send_message waits up to 30s for an agent with an endpoint to answer.
export const maxDuration = 60

export function POST(request: Request) {
  return handleMcpPost(request, '/mcp')
}

export function GET(request: Request) {
  return handleMcpGet(request, '/mcp')
}

export function OPTIONS() {
  return handleMcpOptions()
}
