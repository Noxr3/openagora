import { authenticateClient, json, oauthError, preflight, readParams } from '@/lib/oauth/http'
import { revokeByToken } from '@/lib/oauth/store'

/**
 * POST /oauth/revoke — token revocation (RFC 7009). Revoking either token
 * ends the whole sign-in: the app's access and refresh tokens both stop.
 * Answers 200 for tokens it does not know, as the RFC asks.
 */
export async function POST(request: Request) {
  const params = await readParams(request)
  const auth = await authenticateClient(request, params)
  if (!auth.ok) return auth.response
  if (!params.token) return oauthError(400, 'invalid_request', 'token is missing.')
  await revokeByToken(params.token, auth.client.id)
  return json({})
}

export function OPTIONS() {
  return preflight()
}
