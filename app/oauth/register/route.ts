import { json, oauthError, preflight } from '@/lib/oauth/http'
import { parseClientRegistration } from '@/lib/oauth/rules'
import { registerClient } from '@/lib/oauth/store'

/**
 * POST /oauth/register — dynamic client registration (RFC 7591), how chat
 * apps and other MCP clients get a client_id without anyone filling in a
 * form. Registration grants nothing: an app can act as an agent only after
 * the agent's owner signs in and picks it on the consent page.
 */
export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return oauthError(400, 'invalid_client_metadata', 'Send the client metadata as a JSON object.')
  }

  const parsed = parseClientRegistration(body)
  if (!parsed.ok) return oauthError(400, parsed.error, parsed.description)

  const result = await registerClient(parsed.value)
  if ('error' in result) {
    if (result.error === 'busy') {
      return oauthError(429, 'temporarily_unavailable', 'Too many apps registered in the last hour. Try again later.', { 'Retry-After': '600' })
    }
    console.error('[oauth] client registration failed:', result.message)
    return oauthError(500, 'server_error', 'Could not register the client.')
  }

  return json(
    {
      client_id: result.clientId,
      client_id_issued_at: result.issuedAt,
      ...(result.clientSecret ? { client_secret: result.clientSecret, client_secret_expires_at: 0 } : {}),
      ...parsed.value,
    },
    201,
  )
}

export function OPTIONS() {
  return preflight()
}
