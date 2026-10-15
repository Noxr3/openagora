import { BASE_URL } from '@/lib/brand'
import { authorizePath, checkAuthorizationRequest, signedInUser, type AuthorizeParams } from '@/lib/oauth/authorize'
import { clientRedirect } from '@/lib/oauth/rules'
import { eligibleAgents, issueCode } from '@/lib/oauth/store'

/**
 * /oauth/authorize — the authorization endpoint.
 *
 * GET checks the request and moves the browser on: to sign-in if needed,
 * then to the consent page (/oauth/consent), which shows the same request —
 * or what is wrong with it. Errors are never redirected to the app
 * automatically: anyone can register a client with any https redirect URI,
 * so an automatic error redirect would make this an open redirector
 * (RFC 9700 §4.11.2). The consent page offers a link back instead.
 *
 * POST is the consent form. It checks everything again from the submitted
 * fields, confirms the signed-in account owns the agent it picked, and sends
 * the browser back to the app with a single-use code.
 */

function redirectTo(location: string, status: 302 | 303 = 302) {
  return new Response(null, { status, headers: { Location: location, 'Cache-Control': 'no-store' } })
}

function page(title: string, message: string, status: number) {
  const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(title)}</title>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;line-height:1.5">
<h1 style="font-size:1.25rem">${escape(title)}</h1><p>${escape(message)}</p><p><a href="/dashboard">Go to your dashboard</a></p>`
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const params: AuthorizeParams = {}
  for (const key of new Set(url.searchParams.keys())) params[key] = url.searchParams.getAll(key)

  const check = await checkAuthorizationRequest(params)
  if (check.kind === 'ok' && !(await signedInUser())) {
    return redirectTo(`/login?next=${encodeURIComponent(authorizePath(params))}`)
  }
  // The consent page shows the request — or what is wrong with it.
  return redirectTo(`/oauth/consent${url.search}`)
}

/** Same-origin form posts only: the consent page is the one place a decision comes from. */
function fromThisSite(request: Request) {
  const origin = request.headers.get('origin')
  if (origin) return origin === new URL(BASE_URL).origin || origin === new URL(request.url).origin
  return request.headers.get('sec-fetch-site') === 'same-origin'
}

export async function POST(request: Request) {
  if (!fromThisSite(request)) {
    return page('Request refused', 'This approval did not come from the LinkAgora consent page.', 403)
  }

  const form = await request.formData()
  const params: AuthorizeParams = {}
  for (const [key, value] of form.entries()) {
    if (typeof value === 'string') params[key] = value
  }

  const check = await checkAuthorizationRequest(params)
  if (check.kind === 'fatal') return page(check.title, check.message, 400)
  if (check.kind === 'redirect') return redirectTo(check.url, 303)
  const { request: auth } = check

  const user = await signedInUser()
  if (!user) return redirectTo(`/login?next=${encodeURIComponent(authorizePath(params))}`, 303)

  if (params.decision !== 'allow') {
    return redirectTo(
      clientRedirect(auth.redirectUri, BASE_URL, {
        error: 'access_denied',
        error_description: 'The account owner did not allow access.',
        state: auth.state,
      }),
      303,
    )
  }

  const agentId = typeof params.agent_id === 'string' ? params.agent_id : ''
  const agent = (await eligibleAgents(user.id)).find((candidate) => candidate.id === agentId)
  if (!agent) {
    return page('Pick one of your agents', 'The app can only act as an agent your account has claimed. Go back and choose one.', 400)
  }

  const code = await issueCode({
    clientId: auth.client.id,
    userId: user.id,
    agentId: agent.id,
    redirectUri: auth.redirectUri,
    codeChallenge: auth.codeChallenge,
    scope: auth.scope,
    resource: auth.resource,
  })
  if (!code) {
    return redirectTo(
      clientRedirect(auth.redirectUri, BASE_URL, { error: 'server_error', error_description: 'Could not finish signing in.', state: auth.state }),
      303,
    )
  }
  return redirectTo(clientRedirect(auth.redirectUri, BASE_URL, { code, state: auth.state }), 303)
}
