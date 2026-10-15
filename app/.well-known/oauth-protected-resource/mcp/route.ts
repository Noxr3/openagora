import { BASE_URL } from '@/lib/brand'
import { metadata, preflight } from '@/lib/oauth/http'
import { protectedResourceMetadata } from '@/lib/oauth/rules'

/** Protected resource metadata (RFC 9728) for https://openagora.cc/mcp. */
export function GET() {
  return metadata(protectedResourceMetadata(BASE_URL, `${BASE_URL}/mcp`))
}

export function OPTIONS() {
  return preflight()
}
