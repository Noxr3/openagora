import { BASE_URL } from '@/lib/brand'
import { authenticateClient, json, oauthError, preflight, readParams } from '@/lib/oauth/http'
import { isValidCodeVerifier, normalizeResource, s256 } from '@/lib/oauth/rules'
import { exchangeCode, rotateRefreshToken } from '@/lib/oauth/store'

/**
 * POST /oauth/token — trades an authorization code (with its PKCE verifier)
 * or a refresh token for an access token that acts as one agent at /mcp.
 * Refresh tokens rotate: each works once and comes back replaced.
 */
export async function POST(request: Request) {
  const params = await readParams(request)
  const auth = await authenticateClient(request, params)
  if (!auth.ok) return auth.response
  const client = auth.client

  // RFC 8707: a resource, when named, must be this server.
  if (params.resource && !normalizeResource(params.resource, BASE_URL)) {
    return oauthError(400, 'invalid_target', `Tokens from this server are only for ${BASE_URL}/mcp.`)
  }

  if (params.grant_type === 'authorization_code') {
    if (!params.code) return oauthError(400, 'invalid_request', 'code is missing.')
    if (!isValidCodeVerifier(params.code_verifier)) {
      return oauthError(400, 'invalid_request', 'code_verifier is missing or malformed (PKCE is required).')
    }
    const result = await exchangeCode({
      code: params.code,
      clientId: client.id,
      redirectUri: params.redirect_uri || null,
      codeChallenge: s256(params.code_verifier),
    })
    if (!result.ok) return refused(result.reason)
    return json({ token_type: 'Bearer', ...result.tokens })
  }

  if (params.grant_type === 'refresh_token') {
    if (!params.refresh_token) return oauthError(400, 'invalid_request', 'refresh_token is missing.')
    const result = await rotateRefreshToken({ refreshToken: params.refresh_token, clientId: client.id })
    if (!result.ok) return refused(result.reason)
    return json({ token_type: 'Bearer', ...result.tokens })
  }

  return oauthError(400, 'unsupported_grant_type', 'Use grant_type authorization_code or refresh_token.')
}

const REASONS: Record<string, string> = {
  unknown_code: 'The authorization code is not valid.',
  code_reused: 'The authorization code was already used; tokens issued from it are revoked.',
  code_expired: 'The authorization code expired. Sign in again.',
  client_mismatch: 'This was issued to a different client.',
  redirect_uri_mismatch: 'redirect_uri does not match the authorization request.',
  pkce_mismatch: 'code_verifier does not match the code_challenge.',
  agent_not_owned: 'The agent no longer belongs to the account that approved this app. Sign in again.',
  unknown_token: 'The refresh token is not valid.',
  grant_revoked: 'Access was revoked. Sign in again.',
  token_reused: 'The refresh token was already used; access is revoked. Sign in again.',
  token_already_rotated: 'The refresh token was just used. Use the newest refresh token.',
  token_expired: 'The refresh token expired. Sign in again.',
}

function refused(reason: string) {
  if (reason.startsWith('database:')) {
    console.error('[oauth] token endpoint:', reason)
    return oauthError(500, 'server_error', 'Could not issue tokens.')
  }
  return oauthError(400, 'invalid_grant', REASONS[reason] ?? 'The grant is not valid.')
}

export function OPTIONS() {
  return preflight()
}
