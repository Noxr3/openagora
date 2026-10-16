import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  authorizationServerMetadata,
  bearerChallenge,
  bearerToken,
  clientIdUrlProblem,
  clientRedirect,
  describeRedirect,
  isValidCodeChallenge,
  isValidCodeVerifier,
  isMetadataDocumentClientId,
  matchRedirectUri,
  metadataCacheSeconds,
  normalizeResource,
  parseClientMetadataDocument,
  parseClientRegistration,
  protectedResourceMetadata,
  redirectUriProblem,
  resourceIdentifiers,
  s256,
  safeNextPath,
} from '../lib/oauth/rules.ts'

const BASE = 'https://openagora.cc'

test('resource identifiers are the origin and both MCP endpoints', () => {
  assert.deepEqual(resourceIdentifiers(BASE + '/'), [BASE, `${BASE}/mcp`, `${BASE}/mcp/oauth`])
})

test('normalizeResource accepts this server in any reasonable spelling', () => {
  assert.equal(normalizeResource(`${BASE}/mcp`, BASE), `${BASE}/mcp`)
  assert.equal(normalizeResource(`${BASE}/mcp/`, BASE), `${BASE}/mcp`)
  assert.equal(normalizeResource('HTTPS://OpenAgora.CC/mcp', BASE), `${BASE}/mcp`)
  assert.equal(normalizeResource(`${BASE}`, BASE), BASE)
  assert.equal(normalizeResource(`${BASE}/`, BASE), BASE)
  assert.equal(normalizeResource(`${BASE}:443/mcp`, BASE), `${BASE}/mcp`)
  assert.equal(normalizeResource(`${BASE}/mcp/oauth`, BASE), `${BASE}/mcp/oauth`)
})

test('normalizeResource refuses other servers, other paths, fragments and junk', () => {
  for (const value of [
    'https://evil.example/mcp',
    'https://openagora.cc.evil.example/mcp',
    `${BASE}/relay/x`,
    `${BASE}/mcpx`,
    `${BASE}/mcp#frag`,
    `${BASE}/mcp#`,
    `${BASE}/mcp?x=1`,
    'http://openagora.cc/mcp',
    'openagora.cc/mcp',
    '',
  ]) {
    assert.equal(normalizeResource(value, BASE), null, value)
  }
})

test('protected resource metadata names this issuer and the agent scope', () => {
  const doc = protectedResourceMetadata(BASE, `${BASE}/mcp`)
  assert.equal(doc.resource, `${BASE}/mcp`)
  assert.deepEqual(doc.authorization_servers, [BASE])
  assert.deepEqual(doc.scopes_supported, ['agent'])
  assert.ok(!doc.scopes_supported.includes('offline_access'), 'MCP servers should not advertise offline_access')
})

test('authorization server metadata: same-origin endpoints, S256, iss', () => {
  const doc = authorizationServerMetadata(BASE + '/')
  assert.equal(doc.issuer, BASE)
  for (const key of ['authorization_endpoint', 'token_endpoint', 'registration_endpoint', 'revocation_endpoint'] as const) {
    assert.equal(new URL(doc[key]).origin, BASE, key)
  }
  assert.deepEqual(doc.code_challenge_methods_supported, ['S256'])
  assert.equal(doc.authorization_response_iss_parameter_supported, true)
  assert.equal(doc.client_id_metadata_document_supported, true)
  assert.ok(doc.token_endpoint_auth_methods_supported.includes('none'))
})

test('bearerChallenge points at the path-specific metadata and asks for the scope', () => {
  assert.equal(
    bearerChallenge(BASE, '/mcp'),
    `Bearer resource_metadata="${BASE}/.well-known/oauth-protected-resource/mcp", scope="agent"`,
  )
  const withError = bearerChallenge(BASE, '/mcp/oauth', { code: 'invalid_token', description: 'Expired "token"' })
  assert.match(withError, /resource_metadata="https:\/\/openagora\.cc\/\.well-known\/oauth-protected-resource\/mcp\/oauth"/)
  assert.match(withError, /error="invalid_token"/)
  assert.match(withError, /error_description="Expired token"/, 'quotes inside a value are dropped, not left to break the header')
})

test('redirect URIs: https, loopback http and app schemes are allowed', () => {
  for (const uri of [
    'https://claude.ai/api/mcp/auth_callback',
    'https://chatgpt.com/connector_platform_oauth_redirect',
    'http://localhost:6274/oauth/callback',
    'http://127.0.0.1:33418/',
    'http://[::1]:8080/cb',
    'cursor://anysphere.cursor-mcp/oauth/callback',
    'com.example.app:/oauth2redirect',
  ]) {
    assert.equal(redirectUriProblem(uri), null, uri)
  }
})

test('redirect URIs: plain http elsewhere, fragments and dangerous schemes are refused', () => {
  for (const uri of [
    'http://example.com/cb',
    'http://localhost.evil.example/cb',
    'https://example.com/cb#x',
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'data:text/html,hi',
    'file:///etc/passwd',
    'vbscript:x',
    '/relative',
    '',
    42,
    'https://' + 'a'.repeat(2001),
  ]) {
    assert.notEqual(redirectUriProblem(uri), null, String(uri).slice(0, 40))
  }
})

test('matchRedirectUri is exact, except loopback ports', () => {
  const registered = ['https://app.example/cb', 'http://127.0.0.1/callback', 'http://localhost:3000/cb?x=1']
  assert.ok(matchRedirectUri(registered, 'https://app.example/cb'))
  assert.ok(!matchRedirectUri(registered, 'https://app.example/cb/'))
  assert.ok(!matchRedirectUri(registered, 'https://app.example/cb?extra=1'))
  assert.ok(!matchRedirectUri(registered, 'https://APP.example/cb'), 'non-loopback must match byte for byte')
  assert.ok(matchRedirectUri(registered, 'http://127.0.0.1:54321/callback'))
  assert.ok(!matchRedirectUri(registered, 'http://127.0.0.1:54321/other'))
  assert.ok(matchRedirectUri(registered, 'http://localhost:4000/cb?x=1'))
  assert.ok(!matchRedirectUri(registered, 'http://localhost:4000/cb?x=2'))
  assert.ok(!matchRedirectUri(registered, 'http://[::1]:4000/callback'), 'a different loopback host is a different URI')
  assert.ok(!matchRedirectUri(registered, 'https://127.0.0.1:54321/callback'))
  assert.ok(!matchRedirectUri(['https://app.example:8443/cb'], 'https://app.example:9443/cb'), 'only loopback http gets port freedom')
})

test('describeRedirect tells web, this computer and installed apps apart', () => {
  assert.deepEqual(describeRedirect('https://claude.ai/api/mcp/auth_callback'), { host: 'claude.ai', kind: 'web' })
  assert.deepEqual(describeRedirect('http://127.0.0.1:33418/'), { host: '127.0.0.1:33418', kind: 'this-computer' })
  assert.deepEqual(describeRedirect('cursor://anysphere.cursor-mcp/oauth/callback'), { host: 'cursor://anysphere.cursor-mcp', kind: 'app' })
})

test('clientRedirect keeps the client query, adds the result and iss', () => {
  const url = new URL(clientRedirect('https://app.example/cb?tenant=7', BASE + '/', { code: 'abc', state: 's t&u', error: undefined }))
  assert.equal(url.searchParams.get('tenant'), '7')
  assert.equal(url.searchParams.get('code'), 'abc')
  assert.equal(url.searchParams.get('state'), 's t&u')
  assert.equal(url.searchParams.get('iss'), BASE)
  assert.equal(url.searchParams.has('error'), false)
})

test('PKCE S256 matches RFC 7636 appendix B', () => {
  assert.equal(s256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  assert.ok(isValidCodeChallenge('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'))
  assert.ok(!isValidCodeChallenge('short'))
  assert.ok(!isValidCodeChallenge('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-c='))
  assert.ok(isValidCodeVerifier('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'))
  assert.ok(!isValidCodeVerifier('a'.repeat(42)))
  assert.ok(!isValidCodeVerifier('a'.repeat(129)))
  assert.ok(!isValidCodeVerifier('a'.repeat(42) + '+'))
  // Same digest Node gives directly.
  assert.equal(s256('x'.repeat(43)), createHash('sha256').update('x'.repeat(43)).digest('base64url'))
})

test('client registration: defaults per RFC 7591 and only what is supported', () => {
  const ok = parseClientRegistration({ redirect_uris: ['https://claude.ai/api/mcp/auth_callback'], client_name: 'Claude' })
  assert.ok(ok.ok)
  if (!ok.ok) return
  assert.equal(ok.value.token_endpoint_auth_method, 'client_secret_basic')
  assert.deepEqual(ok.value.grant_types, ['authorization_code', 'refresh_token'])
  assert.deepEqual(ok.value.response_types, ['code'])
  assert.equal(ok.value.scope, 'agent')
  assert.equal(ok.value.client_name, 'Claude')

  const pub = parseClientRegistration({
    redirect_uris: ['http://localhost:6274/oauth/callback'],
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code'],
    client_name: ' Inspector‮\u0007 ',
    client_uri: 'javascript:alert(1)',
    logo_uri: 'https://tracker.example/pixel.png',
    application_type: 'native',
  })
  assert.ok(pub.ok)
  if (!pub.ok) return
  assert.equal(pub.value.token_endpoint_auth_method, 'none')
  assert.equal(pub.value.client_name, 'Inspector', 'control and bidi characters are stripped')
  assert.equal(pub.value.client_uri, undefined, 'non-https client_uri is dropped')
  assert.equal('logo_uri' in pub.value, false, 'unsupported fields are not echoed')
  assert.equal(pub.value.application_type, 'native')

  assert.equal(parseClientRegistration({ redirect_uris: ['https://x.example/cb'] }).ok, true)
  assert.equal(parseClientRegistration({}).ok, false)
  assert.equal(parseClientRegistration(null).ok, false)
  assert.equal(parseClientRegistration([]).ok, false)

  const bad = [
    { redirect_uris: [] },
    { redirect_uris: ['http://example.com/cb'] },
    { redirect_uris: Array.from({ length: 11 }, (_, i) => `https://x.example/${i}`) },
    { redirect_uris: ['https://x.example/cb'], token_endpoint_auth_method: 'private_key_jwt' },
    { redirect_uris: ['https://x.example/cb'], grant_types: ['client_credentials'] },
    { redirect_uris: ['https://x.example/cb'], grant_types: ['refresh_token'] },
    { redirect_uris: ['https://x.example/cb'], grant_types: 'authorization_code' },
    { redirect_uris: ['https://x.example/cb'], response_types: ['token'] },
    { redirect_uris: ['https://x.example/cb'], application_type: 'service' },
  ]
  for (const body of bad) assert.equal(parseClientRegistration(body).ok, false, JSON.stringify(body).slice(0, 80))
  // Grant and response types this server does not use are dropped, not refused.
  const extra = parseClientRegistration({ redirect_uris: ['https://x.example/cb'], grant_types: ['authorization_code', 'urn:ietf:params:oauth:grant-type:device_code'], response_types: ['code', 'token'] })
  assert.ok(extra.ok)
  if (extra.ok) {
    assert.deepEqual(extra.value.grant_types, ['authorization_code', 'refresh_token'])
    assert.deepEqual(extra.value.response_types, ['code'])
  }
  const redirectError = parseClientRegistration({ redirect_uris: ['http://example.com/cb'] })
  assert.equal(redirectError.ok === false && redirectError.error, 'invalid_redirect_uri')
})

test('safeNextPath only follows same-site paths', () => {
  assert.equal(safeNextPath('/oauth/authorize?client_id=x&state=a%26b'), '/oauth/authorize?client_id=x&state=a%26b')
  assert.equal(safeNextPath('/dashboard'), '/dashboard')
  for (const value of ['//evil.example', '/\\evil.example', 'https://evil.example', '@evil.example', 'evil', '', null, undefined, '/\tx', '/a\\b']) {
    assert.equal(safeNextPath(value), null, String(value))
  }
})

test('bearerToken reads the token from an Authorization header', () => {
  assert.equal(bearerToken('Bearer oagt_abc'), 'oagt_abc')
  assert.equal(bearerToken('bearer   oag_x_y '), 'oag_x_y')
  assert.equal(bearerToken('Basic abc'), null)
  assert.equal(bearerToken('Bearer'), null)
  assert.equal(bearerToken('Bearer a b'), null)
  assert.equal(bearerToken(null), null)
})

// The documents Claude Code and VS Code publish, as fetched on 2026-10-16.
const CLAUDE_CODE = 'https://claude.ai/oauth/claude-code-client-metadata'
const CLAUDE_CODE_DOC = {
  client_id: CLAUDE_CODE,
  client_name: 'Claude Code',
  client_uri: 'https://claude.ai',
  redirect_uris: ['http://localhost/callback', 'http://127.0.0.1/callback'],
  grant_types: ['authorization_code', 'refresh_token'],
  response_types: ['code'],
  token_endpoint_auth_method: 'none',
}
const VSCODE = 'https://vscode.dev/oauth/client-metadata.json'
const VSCODE_DOC = {
  client_name: 'Visual Studio Code',
  logo_uri: 'https://code.visualstudio.com/assets/branding/code-stable.png',
  grant_types: ['authorization_code', 'refresh_token', 'urn:ietf:params:oauth:grant-type:device_code'],
  response_types: ['code'],
  token_endpoint_auth_method: 'none',
  application_type: 'native',
  client_id: VSCODE,
  client_uri: 'https://vscode.dev/product',
  redirect_uris: ['http://127.0.0.1:33418/', 'https://vscode.dev/redirect'],
}

test('client metadata documents: the real Claude Code and VS Code documents are accepted', () => {
  assert.ok(isMetadataDocumentClientId(CLAUDE_CODE))
  assert.ok(!isMetadataDocumentClientId('oagc_abc'))
  assert.equal(clientIdUrlProblem(CLAUDE_CODE), null)
  assert.equal(clientIdUrlProblem(VSCODE), null)

  const claude = parseClientMetadataDocument(CLAUDE_CODE, CLAUDE_CODE_DOC)
  assert.ok(claude.ok)
  if (!claude.ok) return
  assert.equal(claude.value.client_name, 'Claude Code')
  assert.equal(claude.value.token_endpoint_auth_method, 'none')
  // Claude Code listens on a port it picks at run time; its registered URIs have none.
  assert.ok(matchRedirectUri(claude.value.redirect_uris, 'http://localhost:61234/callback'))
  assert.ok(!matchRedirectUri(claude.value.redirect_uris, 'https://localhost:61234/callback'))

  const vscode = parseClientMetadataDocument(VSCODE, VSCODE_DOC)
  assert.ok(vscode.ok, vscode.ok ? '' : vscode.description)
  if (!vscode.ok) return
  assert.deepEqual(vscode.value.grant_types, ['authorization_code', 'refresh_token'], 'the device-code grant is dropped')
  assert.equal(vscode.value.application_type, 'native')
  assert.ok(matchRedirectUri(vscode.value.redirect_uris, 'https://vscode.dev/redirect'))
})

test('client metadata documents: what makes one unusable', () => {
  const bad: Array<[string, unknown]> = [
    ['client_id is another URL', { ...CLAUDE_CODE_DOC, client_id: 'https://evil.example/doc' }],
    ['client_id differs only by a trailing slash', { ...CLAUDE_CODE_DOC, client_id: CLAUDE_CODE + '/' }],
    ['no client_id', { ...CLAUDE_CODE_DOC, client_id: undefined }],
    ['a shared secret', { ...CLAUDE_CODE_DOC, client_secret: 'x' }],
    ['a secret expiry', { ...CLAUDE_CODE_DOC, client_secret_expires_at: 0 }],
    ['secret-based auth', { ...CLAUDE_CODE_DOC, token_endpoint_auth_method: 'client_secret_basic' }],
    ['private_key_jwt (not supported here)', { ...CLAUDE_CODE_DOC, token_endpoint_auth_method: 'private_key_jwt' }],
    ['no client_name', { ...CLAUDE_CODE_DOC, client_name: '  ' }],
    ['no redirect_uris', { ...CLAUDE_CODE_DOC, redirect_uris: [] }],
    ['plain-http redirect elsewhere', { ...CLAUDE_CODE_DOC, redirect_uris: ['http://evil.example/cb'] }],
    ['no authorization_code grant', { ...CLAUDE_CODE_DOC, grant_types: ['refresh_token'] }],
    ['not an object', ['client_id', CLAUDE_CODE]],
  ]
  for (const [why, doc] of bad) assert.equal(parseClientMetadataDocument(CLAUDE_CODE, doc).ok, false, why)
})

test('client_id URLs: https, a path, no fragments, credentials or dot segments, canonical', () => {
  for (const [url, why] of [
    ['http://claude.ai/oauth/x', 'http'],
    ['https://claude.ai', 'no path'],
    ['https://claude.ai/', 'root path'],
    ['https://claude.ai/x#frag', 'fragment'],
    ['https://user:pw@claude.ai/x', 'credentials'],
    ['https://claude.ai/a/../x', 'dot-dot segment'],
    ['https://claude.ai/a/./x', 'dot segment'],
    ['https://claude.ai/a/%2e%2e/x', 'encoded dot-dot'],
    ['https://Claude.AI/x', 'not canonical (case)'],
    ['https://claude.ai:443/x', 'not canonical (default port)'],
    ['not a url', 'not a URL'],
    ['https://claude.ai/' + 'a'.repeat(2000), 'too long'],
  ]) {
    assert.notEqual(clientIdUrlProblem(url), null, why)
  }
  assert.equal(clientIdUrlProblem('https://app.example:8443/oauth/client.json?v=2'), null, 'a port and a query are allowed')
})

test('metadataCacheSeconds follows Cache-Control within bounds', () => {
  assert.equal(metadataCacheSeconds('public, max-age=300'), 300) // Claude Code's
  assert.equal(metadataCacheSeconds('no-store,no-cache,max-age=0'), 0) // VS Code's
  assert.equal(metadataCacheSeconds('private, max-age=600'), 0)
  assert.equal(metadataCacheSeconds('max-age=86400'), 3600, 'capped at an hour')
  assert.equal(metadataCacheSeconds('max-age=abc'), 0)
  assert.equal(metadataCacheSeconds(undefined), 300)
  assert.equal(metadataCacheSeconds('public'), 300)
})
