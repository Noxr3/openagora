import { BASE_URL } from '@/lib/brand'
import { createClient } from '@/lib/supabase/server'
import { clientRedirect, isValidCodeChallenge, matchRedirectUri, normalizeResource, SCOPE } from './rules'
import { loadClient, type OAuthClient } from './store'

/**
 * Checking an authorization request (/oauth/authorize). The consent page runs
 * it to decide what to show and the consent form's POST runs it again on the
 * submitted fields, so nothing the page showed is trusted on the way back.
 */

export type AuthorizeParams = Record<string, string | string[] | undefined>

export type AuthorizationRequest = {
  client: OAuthClient
  redirectUri: string
  codeChallenge: string
  state: string | undefined
  scope: string
  resource: string
}

export type AuthorizeCheck =
  /** The client or redirect_uri cannot be trusted: say so here, never redirect. */
  | { kind: 'fatal'; title: string; message: string }
  /** A valid client and redirect_uri but a bad request: the error is for the client — offered as a link, never auto-followed. */
  | { kind: 'redirect'; url: string }
  | { kind: 'ok'; request: AuthorizationRequest }

function values(params: AuthorizeParams, key: string): string[] {
  const value = params[key]
  if (value === undefined) return []
  return (Array.isArray(value) ? value : [value]).filter((v) => v !== '')
}

/** One value, or undefined; a parameter sent twice with different values is `null` (RFC 6749 §3.1). */
function single(params: AuthorizeParams, key: string): string | undefined | null {
  const all = [...new Set(values(params, key))]
  if (all.length > 1) return null
  return all[0]
}

export async function checkAuthorizationRequest(params: AuthorizeParams): Promise<AuthorizeCheck> {
  const clientId = single(params, 'client_id')
  if (!clientId) {
    return { kind: 'fatal', title: 'Incomplete request', message: 'The app that sent you here did not say who it is (client_id is missing).' }
  }
  const lookup = await loadClient(clientId)
  if (lookup.client === null) {
    const problem: string = lookup.problem
    if (problem === 'unregistered') {
      return {
        kind: 'fatal',
        title: 'Unknown app',
        message: 'The app that sent you here is not registered with LinkAgora, or its registration expired. Remove the connector in the app and add it again.',
      }
    }
    // An https client_id names the app's own metadata document; say whose and what went wrong.
    let where = 'the address it gave'
    try {
      where = new URL(clientId).host
    } catch {
      // keep the generic wording
    }
    // Reasons come from several places; make each read as the end of this sentence.
    const reason = problem.replace(/\.+$/, '').replace(/^([A-Z])(?=[a-z])/, (c) => c.toLowerCase())
    return {
      kind: 'fatal',
      title: 'Cannot read this app\'s details',
      message: `The app identifies itself with a document on ${where}, and LinkAgora cannot use it: ${reason}.`,
    }
  }
  const client = lookup.client

  const presented = single(params, 'redirect_uri')
  let redirectUri: string
  if (presented === null) {
    return { kind: 'fatal', title: 'Invalid request', message: 'redirect_uri was sent more than once.' }
  } else if (presented === undefined) {
    if (client.redirect_uris.length !== 1) {
      return { kind: 'fatal', title: 'Invalid request', message: 'The app did not say where to send you back (redirect_uri is missing).' }
    }
    redirectUri = client.redirect_uris[0]
  } else if (matchRedirectUri(client.redirect_uris, presented)) {
    redirectUri = presented
  } else {
    return {
      kind: 'fatal',
      title: 'Unexpected return address',
      message: 'The app asked to send you back to an address it did not register. For your safety LinkAgora will not send you there.',
    }
  }

  // From here the redirect target is the client's own, so errors are addressed to it.
  const state = single(params, 'state') ?? undefined
  const back = (error: string, description: string): AuthorizeCheck => ({
    kind: 'redirect',
    url: clientRedirect(redirectUri, BASE_URL, { error, error_description: description, state }),
  })

  if (single(params, 'response_type') !== 'code') {
    return back('unsupported_response_type', 'Only response_type=code is supported.')
  }
  if (single(params, 'code_challenge_method') !== 'S256') {
    return back('invalid_request', 'PKCE is required: send code_challenge_method=S256.')
  }
  const codeChallenge = single(params, 'code_challenge')
  if (!isValidCodeChallenge(codeChallenge)) {
    return back('invalid_request', 'PKCE is required: code_challenge must be the base64url SHA-256 of the code_verifier.')
  }

  // RFC 8707: the token is for this MCP server; anything else is refused.
  const named = values(params, 'resource').map((value) => normalizeResource(value, BASE_URL))
  if (named.some((value) => value === null) || new Set(named).size > 1) {
    return back('invalid_target', `This server issues tokens only for ${BASE_URL}/mcp.`)
  }
  const resource = named[0] ?? `${BASE_URL}/mcp`

  return { kind: 'ok', request: { client, redirectUri, codeChallenge, state, scope: SCOPE, resource } }
}

/** /oauth/authorize with the same parameters, to come back to after signing in. */
export function authorizePath(params: AuthorizeParams): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (key === 'decision' || key === 'agent_id') continue
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, v)
  }
  return `/oauth/authorize?${query.toString()}`
}

/** The signed-in LinkAgora account, from the Supabase session cookie. */
export async function signedInUser(): Promise<{ id: string; email: string | null } | null> {
  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    return data.user ? { id: data.user.id, email: data.user.email ?? null } : null
  } catch {
    return null
  }
}
