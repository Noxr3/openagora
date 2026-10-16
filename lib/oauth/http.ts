import { clientSecretMatches, getClient, type OAuthClient } from './store'

/**
 * HTTP plumbing shared by the OAuth endpoints: CORS for browser-based MCP
 * clients, OAuth's error shape, form bodies, client authentication.
 */

export const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Mcp-Protocol-Version',
  'Access-Control-Max-Age': '86400',
}

const NO_STORE = { 'Cache-Control': 'no-store', Pragma: 'no-cache' }

export function preflight() {
  return new Response(null, { status: 204, headers: CORS })
}

/** Public metadata: cacheable for a little while, readable from any origin. */
export function metadata(body: unknown) {
  return Response.json(body, { headers: { ...CORS, 'Cache-Control': 'public, max-age=300' } })
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { ...CORS, ...NO_STORE, ...headers } })
}

export function oauthError(status: number, error: string, description: string, headers: Record<string, string> = {}) {
  return json({ error, error_description: description }, status, headers)
}

/** Token and revocation requests are form-encoded (RFC 6749); JSON is accepted too. */
export async function readParams(request: Request): Promise<Record<string, string>> {
  const type = request.headers.get('content-type') ?? ''
  const out: Record<string, string> = {}
  try {
    if (type.includes('application/json')) {
      const body = await request.json()
      if (body && typeof body === 'object') {
        for (const [key, value] of Object.entries(body)) if (typeof value === 'string') out[key] = value
      }
      return out
    }
    const form = new URLSearchParams(await request.text())
    for (const [key, value] of form) if (!(key in out)) out[key] = value
  } catch {
    // An unreadable body is a body without parameters; the handler says what is missing.
  }
  return out
}

type ClientAuth = { ok: true; client: OAuthClient } | { ok: false; response: Response }

/**
 * Who is calling the token or revocation endpoint. Confidential clients prove
 * it with their secret, in an HTTP Basic header or the body — whichever they
 * use; public clients name themselves and rely on PKCE.
 */
export async function authenticateClient(request: Request, params: Record<string, string>): Promise<ClientAuth> {
  let clientId = params.client_id ?? ''
  let presented = params.client_secret ?? ''
  let usedBasic = false

  const header = request.headers.get('authorization') ?? ''
  if (/^Basic\s+/i.test(header)) {
    usedBasic = true
    try {
      const decoded = Buffer.from(header.replace(/^Basic\s+/i, ''), 'base64').toString('utf8')
      const split = decoded.indexOf(':')
      if (split < 0) throw new Error('no colon')
      // RFC 6749 §2.3.1: both halves are form-urlencoded before base64.
      const id = decodeURIComponent(decoded.slice(0, split).replace(/\+/g, ' '))
      if (clientId && clientId !== id) throw new Error('two different client ids')
      clientId = id
      presented = decodeURIComponent(decoded.slice(split + 1).replace(/\+/g, ' '))
    } catch {
      return { ok: false, response: invalidClient('The Basic authorization header is malformed.', true) }
    }
  }

  if (!clientId) return { ok: false, response: invalidClient('client_id is missing.', usedBasic) }
  const client = await getClient(clientId)
  if (!client) {
    return { ok: false, response: invalidClient('Unknown client_id. Register again at the registration_endpoint.', usedBasic) }
  }
  if (client.token_endpoint_auth_method !== 'none') {
    if (!presented) return { ok: false, response: invalidClient('This client must authenticate with its client_secret.', usedBasic) }
    if (!clientSecretMatches(client, presented)) return { ok: false, response: invalidClient('Wrong client_secret.', usedBasic) }
  }
  return { ok: true, client }
}

function invalidClient(description: string, basic: boolean) {
  return oauthError(401, 'invalid_client', description, basic ? { 'WWW-Authenticate': 'Basic realm="LinkAgora"' } : {})
}
