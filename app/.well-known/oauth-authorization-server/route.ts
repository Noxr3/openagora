import { BASE_URL } from '@/lib/brand'
import { metadata, preflight } from '@/lib/oauth/http'
import { authorizationServerMetadata } from '@/lib/oauth/rules'

/** Authorization server metadata (RFC 8414). LinkAgora is its own issuer. */
export function GET() {
  return metadata(authorizationServerMetadata(BASE_URL))
}

export function OPTIONS() {
  return preflight()
}
