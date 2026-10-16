import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { fetchClientMetadataDocument } from './client-metadata'
import {
  ACCESS_TOKEN_PREFIX,
  ACCESS_TOKEN_SECONDS,
  CLIENT_ID_PREFIX,
  CLIENT_SECRET_PREFIX,
  CODE_SECONDS,
  REFRESH_TOKEN_PREFIX,
  REFRESH_TOKEN_SECONDS,
  clientIdUrlProblem,
  isMetadataDocumentClientId,
  parseClientMetadataDocument,
  type AuthMethod,
  type ClientRegistration,
} from './rules'

/**
 * Database side of the OAuth server (tables and functions in
 * supabase/migrations/018_mcp_oauth.sql). Only hashes of secrets are stored;
 * the multi-step changes — spending a code, rotating a refresh token — are
 * single SQL functions so they cannot half-happen.
 */

export function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function secret(prefix: string, bytes = 32) {
  return prefix + randomBytes(bytes).toString('base64url')
}

export type OAuthClient = {
  id: string
  secret_hash: string | null
  token_endpoint_auth_method: AuthMethod
  client_name: string
  client_uri: string | null
  redirect_uris: string[]
}

/**
 * A client as stored: registered (oagc_…), or a metadata-document client
 * (an https client_id) that someone approved at least once. The token and
 * revocation endpoints use this; they never fetch.
 */
export async function getClient(clientId: string): Promise<OAuthClient | null> {
  if (!clientId || clientId.length > 2000) return null
  const { data } = await supabaseAdmin
    .from('oauth_clients')
    .select('id, secret_hash, token_endpoint_auth_method, client_name, client_uri, redirect_uris')
    .eq('id', clientId)
    .maybeSingle()
  return (data as OAuthClient | null) ?? null
}

// Fetched metadata documents, per process, for as long as their Cache-Control allows.
const documentClients = new Map<string, { client: OAuthClient; until: number }>()

/** `problem` is 'unregistered' for an unknown registered client_id, otherwise why a metadata document cannot be used. */
export type ClientLookup = { client: OAuthClient; problem?: undefined } | { client: null; problem: string }

/**
 * The client behind a client_id at the authorization step. A registered
 * client comes from the database; an https client_id is a Client ID Metadata
 * Document, fetched now (or reused while its cache headers allow) and checked
 * — a document that cannot be fetched or does not check out stops the
 * request (draft §4.3).
 */
export async function loadClient(clientId: string): Promise<ClientLookup> {
  if (!isMetadataDocumentClientId(clientId)) {
    const client = await getClient(clientId)
    return client ? { client } : { client: null, problem: 'unregistered' }
  }

  const urlProblem = clientIdUrlProblem(clientId)
  if (urlProblem) return { client: null, problem: `the client_id ${urlProblem}` }

  const cached = documentClients.get(clientId)
  if (cached && cached.until > Date.now()) return { client: cached.client }

  let fetched: Awaited<ReturnType<typeof fetchClientMetadataDocument>>
  try {
    fetched = await fetchClientMetadataDocument(clientId)
  } catch (error) {
    return { client: null, problem: error instanceof Error ? error.message : 'it could not be fetched' }
  }
  const parsed = parseClientMetadataDocument(clientId, fetched.json)
  if (!parsed.ok) return { client: null, problem: parsed.description }

  const client: OAuthClient = {
    id: clientId,
    secret_hash: null,
    token_endpoint_auth_method: 'none',
    client_name: parsed.value.client_name,
    client_uri: parsed.value.client_uri ?? null,
    redirect_uris: parsed.value.redirect_uris,
  }
  if (fetched.cacheSeconds > 0) {
    if (documentClients.size >= 500) documentClients.delete(documentClients.keys().next().value as string)
    documentClients.set(clientId, { client, until: Date.now() + fetched.cacheSeconds * 1000 })
  } else {
    documentClients.delete(clientId)
  }
  return { client }
}

/**
 * Codes and grants point at an oauth_clients row, so a metadata-document
 * client gets one — a snapshot of the document as it was when the account
 * approved it — the first time it is approved, refreshed each time after.
 */
async function rememberDocumentClient(client: OAuthClient): Promise<boolean> {
  const { error } = await supabaseAdmin.from('oauth_clients').upsert(
    {
      id: client.id,
      secret_hash: null,
      token_endpoint_auth_method: 'none',
      client_name: client.client_name,
      client_uri: client.client_uri,
      redirect_uris: client.redirect_uris,
      metadata: { client_id_metadata_document: true },
    },
    { onConflict: 'id' },
  )
  if (error) console.error('[oauth] saving a metadata-document client failed:', error.message)
  return !error
}

/** Constant-time check of a presented client secret. */
export function clientSecretMatches(client: OAuthClient, presented: string): boolean {
  if (!client.secret_hash) return false
  const a = Buffer.from(sha256(presented), 'hex')
  const b = Buffer.from(client.secret_hash, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Registrations in the last hour across everyone; a brake on table spam. */
const REGISTRATIONS_PER_HOUR = 1000

export async function registerClient(registration: ClientRegistration) {
  const hourAgo = new Date(Date.now() - 3600_000).toISOString()
  const { count } = await supabaseAdmin
    .from('oauth_clients')
    .select('id', { count: 'exact', head: true })
    .gt('created_at', hourAgo)
  if ((count ?? 0) >= REGISTRATIONS_PER_HOUR) return { error: 'busy' as const }

  // Clients that registered and never completed a sign-in are dead weight after a week.
  await supabaseAdmin
    .from('oauth_clients')
    .delete()
    .is('last_used_at', null)
    .lt('created_at', new Date(Date.now() - 7 * 86400_000).toISOString())

  const clientId = secret(CLIENT_ID_PREFIX, 18)
  const clientSecret = registration.token_endpoint_auth_method === 'none' ? null : secret(CLIENT_SECRET_PREFIX)
  const { client_name, client_uri, redirect_uris, token_endpoint_auth_method, ...rest } = registration
  const { data, error } = await supabaseAdmin
    .from('oauth_clients')
    .insert({
      id: clientId,
      secret_hash: clientSecret ? sha256(clientSecret) : null,
      token_endpoint_auth_method,
      client_name,
      client_uri: client_uri ?? null,
      redirect_uris,
      metadata: rest,
    })
    .select('created_at')
    .single()
  if (error || !data) return { error: 'failed' as const, message: error?.message }
  return { clientId, clientSecret, issuedAt: Math.floor(new Date(data.created_at).getTime() / 1000) }
}

/** The account's agents a connector may act as: claimed by it, minus the shared test agent. */
export async function eligibleAgents(userId: string) {
  const [{ data }, shared] = await Promise.all([
    supabaseAdmin
      .from('agents')
      .select('id, name, slug, avatar_url, description')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    sharedTestAgentId(),
  ])
  return (data ?? []).filter((agent) => agent.id !== shared) as Array<{
    id: string
    name: string
    slug: string | null
    avatar_url: string | null
    description: string | null
  }>
}

export async function issueCode(input: {
  client: OAuthClient
  userId: string
  agentId: string
  redirectUri: string
  codeChallenge: string
  scope: string
  resource: string
}): Promise<string | null> {
  if (isMetadataDocumentClientId(input.client.id) && !(await rememberDocumentClient(input.client))) return null
  const code = randomBytes(32).toString('base64url')
  const { error } = await supabaseAdmin.from('oauth_codes').insert({
    code_hash: sha256(code),
    client_id: input.client.id,
    user_id: input.userId,
    agent_id: input.agentId,
    redirect_uri: input.redirectUri,
    code_challenge: input.codeChallenge,
    scope: input.scope,
    resource: input.resource,
    expires_at: new Date(Date.now() + CODE_SECONDS * 1000).toISOString(),
  })
  return error ? null : code
}

type TokenPair = { access_token: string; refresh_token: string; expires_in: number; scope: string }
type Exchange = { ok: true; tokens: TokenPair } | { ok: false; reason: string }

function newPair() {
  const access = secret(ACCESS_TOKEN_PREFIX)
  const refresh = secret(REFRESH_TOKEN_PREFIX)
  const now = Date.now()
  return {
    access,
    refresh,
    accessHash: sha256(access),
    refreshHash: sha256(refresh),
    accessExpires: new Date(now + ACCESS_TOKEN_SECONDS * 1000).toISOString(),
    refreshExpires: new Date(now + REFRESH_TOKEN_SECONDS * 1000).toISOString(),
  }
}

function settle(data: unknown, error: { message: string } | null, pair: ReturnType<typeof newPair>): Exchange {
  if (error) return { ok: false, reason: `database: ${error.message}` }
  const result = (data ?? {}) as { error?: string; reason?: string; scope?: string }
  if (result.error) return { ok: false, reason: result.reason ?? result.error }
  return {
    ok: true,
    tokens: { access_token: pair.access, refresh_token: pair.refresh, expires_in: ACCESS_TOKEN_SECONDS, scope: result.scope ?? '' },
  }
}

export async function exchangeCode(input: {
  code: string
  clientId: string
  redirectUri: string | null
  codeChallenge: string
}): Promise<Exchange> {
  const pair = newPair()
  const { data, error } = await supabaseAdmin.rpc('oauth_exchange_code', {
    p_code_hash: sha256(input.code),
    p_client_id: input.clientId,
    p_redirect_uri: input.redirectUri,
    p_code_challenge: input.codeChallenge,
    p_access_hash: pair.accessHash,
    p_access_expires: pair.accessExpires,
    p_refresh_hash: pair.refreshHash,
    p_refresh_expires: pair.refreshExpires,
  })
  return settle(data, error, pair)
}

export async function rotateRefreshToken(input: { refreshToken: string; clientId: string }): Promise<Exchange> {
  const pair = newPair()
  const { data, error } = await supabaseAdmin.rpc('oauth_rotate_refresh', {
    p_refresh_hash: sha256(input.refreshToken),
    p_client_id: input.clientId,
    p_new_access_hash: pair.accessHash,
    p_access_expires: pair.accessExpires,
    p_new_refresh_hash: pair.refreshHash,
    p_refresh_expires: pair.refreshExpires,
  })
  return settle(data, error, pair)
}

/**
 * The agent an access token acts as, or null: unknown, expired, revoked, the
 * agent changed hands, or it is the shared test agent.
 */
export async function resolveAccessToken(token: string): Promise<{ agentId: string; grantId: string; resource: string } | null> {
  if (!token.startsWith(ACCESS_TOKEN_PREFIX)) return null
  const [{ data, error }, shared] = await Promise.all([
    supabaseAdmin.rpc('oauth_resolve_access_token', { p_token_hash: sha256(token) }),
    sharedTestAgentId(),
  ])
  if (error) {
    console.error('[oauth] resolving an access token failed:', error.message)
    return null
  }
  const row = (Array.isArray(data) ? data[0] : data) as { agent_id: string; grant_id: string; resource: string } | undefined
  if (!row || row.agent_id === shared) return null
  return { agentId: row.agent_id, grantId: row.grant_id, resource: row.resource }
}

/**
 * Revoke the grant behind a token, if it belongs to this client (RFC 7009).
 * Unknown tokens are not an error: the caller answers 200 either way.
 */
export async function revokeByToken(token: string, clientId: string) {
  const { data } = await supabaseAdmin
    .from('oauth_tokens')
    .select('grant_id, grant:oauth_grants!inner(client_id)')
    .eq('token_hash', sha256(token))
    .maybeSingle()
  const grant = (data as { grant_id: string; grant: { client_id: string } | { client_id: string }[] } | null) ?? null
  if (!grant) return
  const owner = Array.isArray(grant.grant) ? grant.grant[0]?.client_id : grant.grant?.client_id
  if (owner !== clientId) return
  await supabaseAdmin.from('oauth_grants').update({ revoked_at: new Date().toISOString() }).eq('id', grant.grant_id).is('revoked_at', null)
}

export type ConnectedApp = {
  id: string
  created_at: string
  last_used_at: string | null
  client_name: string
  agent: { id: string; name: string; slug: string | null }
}

/** The account's live grants, for the dashboard. Null when the tables are not there yet. */
export async function listConnectedApps(userId: string): Promise<ConnectedApp[] | null> {
  const { data, error } = await supabaseAdmin
    .from('oauth_grants')
    .select('id, created_at, last_used_at, client:oauth_clients(client_name), agent:agents(id, name, slug)')
    .eq('user_id', userId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
  if (error) return null
  return (data ?? []).map((row) => {
    const client = Array.isArray(row.client) ? row.client[0] : row.client
    const agent = Array.isArray(row.agent) ? row.agent[0] : row.agent
    return {
      id: row.id,
      created_at: row.created_at,
      last_used_at: row.last_used_at,
      client_name: (client as { client_name?: string } | null)?.client_name ?? 'Unknown app',
      agent: agent as ConnectedApp['agent'],
    }
  })
}

/** The account revokes one of its grants. False when it is not theirs. */
export async function revokeGrantForUser(grantId: string, userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('oauth_grants')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', grantId)
    .eq('user_id', userId)
    .is('revoked_at', null)
    .select('id')
  return (data ?? []).length > 0
}

// ─── The shared test agent ──────────────────────────────────────────────────

let sharedAgent: string | null | undefined

/**
 * The agent behind NEXT_PUBLIC_ANON_API_KEY. That key ships to every browser
 * for the Live Test Panel, so whoever holds it is nobody in particular: no
 * account may connect an app as that agent, even one that claimed it.
 */
export async function sharedTestAgentId(): Promise<string | null> {
  const key = process.env.NEXT_PUBLIC_ANON_API_KEY
  if (!key) return null
  if (sharedAgent !== undefined) return sharedAgent
  const { data, error } = await supabaseAdmin.from('api_keys').select('agent_id').eq('key_hash', sha256(key)).maybeSingle()
  if (error) return null // not cached: ask again next time
  const agentId: string | null = data?.agent_id ?? null
  sharedAgent = agentId
  return agentId
}
