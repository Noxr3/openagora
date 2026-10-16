import { BASE_URL } from '@/lib/brand'
import { metadata, preflight } from '@/lib/oauth/http'
import { protectedResourceMetadata } from '@/lib/oauth/rules'

/**
 * Protected resource metadata (RFC 9728) for the origin. MCP clients that
 * find no path-specific document (/.well-known/oauth-protected-resource/mcp)
 * fall back to this one.
 */
export function GET() {
  return metadata(protectedResourceMetadata(BASE_URL, BASE_URL))
}

export function OPTIONS() {
  return preflight()
}
