import { createHash } from 'node:crypto'

/**
 * The rules of LinkAgora's OAuth authorization server for /mcp, as pure
 * functions: which URIs this server answers for, what its metadata says,
 * which redirect URIs a client may register and how they match, PKCE.
 *
 * No imports from the app (only node builtins) and the base URL is always a
 * parameter, so `node --test` can load this file as is.
 *
 * Spec: MCP authorization 2026-07-28 (OAuth 2.1, RFC 8414 metadata, RFC 9728
 * protected resource metadata, RFC 7591 registration, RFC 8707 resource
 * indicators, RFC 9207 `iss` in the authorization response).
 */

/** The one scope: act as the agent the account picked. */
export const SCOPE = 'agent'

export const ACCESS_TOKEN_PREFIX = 'oagt_'
export const REFRESH_TOKEN_PREFIX = 'oagr_'
export const CLIENT_ID_PREFIX = 'oagc_'
export const CLIENT_SECRET_PREFIX = 'oags_'

export const ACCESS_TOKEN_SECONDS = 60 * 60
export const REFRESH_TOKEN_SECONDS = 60 * 60 * 24 * 30
export const CODE_SECONDS = 5 * 60

export const AUTH_METHODS = ['none', 'client_secret_post', 'client_secret_basic'] as const
export type AuthMethod = (typeof AUTH_METHODS)[number]

/** The MCP endpoints this resource server runs. /mcp/oauth always asks for sign-in. */
export const MCP_PATHS = ['/mcp', '/mcp/oauth'] as const
export type McpPath = (typeof MCP_PATHS)[number]

function trimSlash(value: string) {
  return value.replace(/\/+$/, '')
}

/**
 * Every URI a client may name as `resource` for this server: the origin and
 * each MCP endpoint. A token issued for any of them is valid at all of them —
 * they are one server.
 */
export function resourceIdentifiers(base: string): string[] {
  const origin = trimSlash(base)
  return [origin, ...MCP_PATHS.map((path) => origin + path)]
}

/**
 * A `resource` parameter → the canonical identifier it names, or null when it
 * is not this server (→ invalid_target). Scheme and host compare
 * case-insensitively and a trailing slash is ignored, as RFC 8707 asks
 * servers to be lenient about; a fragment is never valid.
 */
export function normalizeResource(value: string, base: string): string | null {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    return null
  }
  if (url.hash || value.includes('#')) return null
  const candidate = trimSlash(`${url.protocol}//${url.host}${url.pathname}`) + url.search
  return resourceIdentifiers(base).find((id) => id === candidate) ?? null
}

/** The protected resource metadata (RFC 9728) for one of this server's resource identifiers. */
export function protectedResourceMetadata(base: string, resource: string) {
  const origin = trimSlash(base)
  return {
    resource,
    authorization_servers: [origin],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ['header'],
    resource_name: 'LinkAgora',
    resource_documentation: `${origin}/docs/mcp`,
  }
}

/** Where the protected resource metadata for an MCP endpoint lives (path-inserted, RFC 9728 §3.1). */
export function resourceMetadataUrl(base: string, path: McpPath) {
  return `${trimSlash(base)}/.well-known/oauth-protected-resource${path}`
}

/** Authorization server metadata (RFC 8414). Every endpoint is on the issuer's origin. */
export function authorizationServerMetadata(base: string) {
  const issuer = trimSlash(base)
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    registration_endpoint: `${issuer}/oauth/register`,
    revocation_endpoint: `${issuer}/oauth/revoke`,
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: [...AUTH_METHODS],
    revocation_endpoint_auth_methods_supported: [...AUTH_METHODS],
    scopes_supported: [SCOPE],
    authorization_response_iss_parameter_supported: true,
    service_documentation: `${issuer}/docs/mcp`,
  }
}

function quote(value: string) {
  return `"${value.replace(/["\\]/g, '')}"`
}

/**
 * The `WWW-Authenticate` value for a 401 from an MCP endpoint: where the
 * resource metadata is and which scope to ask for, plus the error when a
 * token was sent but is no good (RFC 6750 §3).
 */
export function bearerChallenge(base: string, path: McpPath, error?: { code: 'invalid_token'; description: string }) {
  const parts = [`resource_metadata=${quote(resourceMetadataUrl(base, path))}`, `scope=${quote(SCOPE)}`]
  if (error) parts.push(`error=${quote(error.code)}`, `error_description=${quote(error.description)}`)
  return `Bearer ${parts.join(', ')}`
}

// ─── Redirect URIs ──────────────────────────────────────────────────────────

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/** Schemes that must never receive a code: they run, read or leave nothing a client controls. */
const FORBIDDEN_SCHEMES = new Set([
  'javascript:', 'data:', 'vbscript:', 'file:', 'blob:', 'about:', 'filesystem:',
  'ftp:', 'ws:', 'wss:', 'mailto:', 'tel:', 'sms:', 'intent:', 'chrome:', 'view-source:',
])

/**
 * Why a client may not register this redirect URI, or null when it may.
 * Allowed: https anywhere; http only to this computer (localhost, 127.0.0.1,
 * [::1]); an app's own scheme (RFC 8252 §7.1, e.g. cursor://…). No fragments.
 */
export function redirectUriProblem(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return 'must be a non-empty string'
  if (value.length > 2000) return 'is longer than 2000 characters'
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return 'is not an absolute URI'
  }
  if (url.hash || value.includes('#')) return 'must not contain a fragment'
  if (url.protocol === 'https:') return url.hostname ? null : 'has no host'
  if (url.protocol === 'http:') {
    return LOOPBACK_HOSTS.has(url.hostname) ? null : 'must use https unless it points at localhost, 127.0.0.1 or [::1]'
  }
  if (FORBIDDEN_SCHEMES.has(url.protocol)) return `may not use the ${url.protocol} scheme`
  if (!/^[a-z][a-z0-9+.-]*:$/.test(url.protocol)) return 'has an invalid scheme'
  return null
}

function isLoopbackHttp(url: URL) {
  return url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname)
}

/**
 * Does a redirect_uri presented at /oauth/authorize match one the client
 * registered? Exactly, except that a loopback http URI may use any port
 * (OAuth 2.1 §8.4.2: native apps pick a free port at run time).
 */
export function matchRedirectUri(registered: readonly string[], presented: string): boolean {
  if (registered.includes(presented)) return true
  let wanted: URL
  try {
    wanted = new URL(presented)
  } catch {
    return false
  }
  if (!isLoopbackHttp(wanted) || wanted.hash) return false
  return registered.some((entry) => {
    try {
      const url = new URL(entry)
      return (
        isLoopbackHttp(url) &&
        url.hostname === wanted.hostname &&
        url.pathname === wanted.pathname &&
        url.search === wanted.search &&
        url.username === wanted.username &&
        url.password === wanted.password
      )
    } catch {
      return false
    }
  })
}

/** How the consent page should describe where the user is sent next. */
export function describeRedirect(value: string): { host: string; kind: 'web' | 'this-computer' | 'app' } {
  const url = new URL(value)
  if (url.protocol === 'https:') return { host: url.host, kind: 'web' }
  if (isLoopbackHttp(url)) return { host: url.host, kind: 'this-computer' }
  return { host: url.protocol.replace(/:$/, '') + (url.host ? `://${url.host}` : ':'), kind: 'app' }
}

/** The redirect back to the client, with RFC 9207's `iss` on success and error alike. */
export function clientRedirect(redirectUri: string, base: string, params: Record<string, string | undefined>) {
  const url = new URL(redirectUri)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, value)
  }
  url.searchParams.set('iss', trimSlash(base))
  return url.toString()
}

// ─── PKCE (S256 only) ───────────────────────────────────────────────────────

const PKCE_VALUE = /^[A-Za-z0-9._~-]{43,128}$/

export function isValidCodeChallenge(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)
}

export function isValidCodeVerifier(value: unknown): value is string {
  return typeof value === 'string' && PKCE_VALUE.test(value)
}

/** BASE64URL(SHA256(verifier)), RFC 7636 §4.2. */
export function s256(verifier: string): string {
  return createHash('sha256').update(verifier, 'ascii').digest('base64url')
}

// ─── Client registration (RFC 7591) ─────────────────────────────────────────

export type ClientRegistration = {
  redirect_uris: string[]
  token_endpoint_auth_method: AuthMethod
  grant_types: string[]
  response_types: string[]
  client_name: string
  client_uri?: string
  scope: string
  software_id?: string
  software_version?: string
  application_type?: 'web' | 'native'
}

type Parsed = { ok: true; value: ClientRegistration } | { ok: false; error: 'invalid_redirect_uri' | 'invalid_client_metadata'; description: string }

function cleanText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = value.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim()
  return text ? text.slice(0, max) : undefined
}

/**
 * A registration request body → what this server will store and echo back,
 * or the RFC 7591 error. Unknown fields are dropped; a missing
 * token_endpoint_auth_method means client_secret_basic, as RFC 7591 §2 says.
 */
export function parseClientRegistration(body: unknown): Parsed {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'invalid_client_metadata', description: 'The body must be a JSON object.' }
  }
  const input = body as Record<string, unknown>

  const uris = input.redirect_uris
  if (!Array.isArray(uris) || uris.length === 0) {
    return { ok: false, error: 'invalid_redirect_uri', description: 'redirect_uris must be a non-empty array.' }
  }
  if (uris.length > 10) return { ok: false, error: 'invalid_redirect_uri', description: 'At most 10 redirect_uris.' }
  for (const uri of uris) {
    const problem = redirectUriProblem(uri)
    if (problem) return { ok: false, error: 'invalid_redirect_uri', description: `redirect_uri ${JSON.stringify(String(uri).slice(0, 200))} ${problem}.` }
  }

  const method = input.token_endpoint_auth_method ?? 'client_secret_basic'
  if (!AUTH_METHODS.includes(method as AuthMethod)) {
    return { ok: false, error: 'invalid_client_metadata', description: `token_endpoint_auth_method must be one of ${AUTH_METHODS.join(', ')}.` }
  }

  const grantTypes = input.grant_types ?? ['authorization_code', 'refresh_token']
  if (
    !Array.isArray(grantTypes) ||
    !grantTypes.includes('authorization_code') ||
    grantTypes.some((g) => g !== 'authorization_code' && g !== 'refresh_token')
  ) {
    return { ok: false, error: 'invalid_client_metadata', description: 'grant_types must include authorization_code and may add refresh_token; nothing else is supported.' }
  }

  const responseTypes = input.response_types ?? ['code']
  if (!Array.isArray(responseTypes) || responseTypes.length !== 1 || responseTypes[0] !== 'code') {
    return { ok: false, error: 'invalid_client_metadata', description: 'response_types must be ["code"].' }
  }

  const appType = input.application_type
  if (appType !== undefined && appType !== 'web' && appType !== 'native') {
    return { ok: false, error: 'invalid_client_metadata', description: 'application_type must be "web" or "native".' }
  }

  let clientUri: string | undefined
  const rawUri = cleanText(input.client_uri, 500)
  if (rawUri) {
    try {
      if (new URL(rawUri).protocol === 'https:') clientUri = rawUri
    } catch {
      // Not a URL: shown nowhere, so just dropped.
    }
  }

  return {
    ok: true,
    value: {
      redirect_uris: uris as string[],
      token_endpoint_auth_method: method as AuthMethod,
      grant_types: [...new Set(grantTypes as string[])],
      response_types: ['code'],
      client_name: cleanText(input.client_name, 100) ?? 'Unnamed app',
      ...(clientUri ? { client_uri: clientUri } : {}),
      scope: SCOPE,
      ...(cleanText(input.software_id, 200) ? { software_id: cleanText(input.software_id, 200) } : {}),
      ...(cleanText(input.software_version, 100) ? { software_version: cleanText(input.software_version, 100) } : {}),
      ...(appType ? { application_type: appType as 'web' | 'native' } : {}),
    },
  }
}

// ─── Small helpers ──────────────────────────────────────────────────────────

/**
 * A post-login destination taken from a query or cookie → a same-site path,
 * or null. Refuses anything a browser would read as another host:
 * `//evil`, `/\evil`, a scheme, or control characters.
 */
export function safeNextPath(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 4000) return null
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\') || /[\u0000-\u001f\\]/.test(value)) return null
  try {
    const url = new URL(value, 'https://linkagora.invalid')
    if (url.origin !== 'https://linkagora.invalid') return null
    return url.pathname + url.search
  } catch {
    return null
  }
}

/** The bearer token in an Authorization header, or null. */
export function bearerToken(header: string | null | undefined): string | null {
  if (!header) return null
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header)
  return match ? match[1] : null
}
