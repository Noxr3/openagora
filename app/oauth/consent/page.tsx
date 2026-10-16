import type { Metadata } from 'next'
import Link from 'next/link'
import { AgentAvatar } from '@/components/agents/AgentAvatar'
import { Panel, pill } from '@/components/ui/panel'
import { BRAND } from '@/lib/brand'
import { authorizePath, checkAuthorizationRequest, signedInUser } from '@/lib/oauth/authorize'
import { describeRedirect, isMetadataDocumentClientId } from '@/lib/oauth/rules'
import { eligibleAgents } from '@/lib/oauth/store'

export const metadata: Metadata = {
  title: 'Connect an app',
  robots: { index: false, follow: false },
}

/**
 * The consent page: the signed-in account picks which of its agents an app
 * (a chat app's connector, Claude Code, Cursor…) may act as. /oauth/authorize
 * sends people here; the form posts back to it.
 */
export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const check = await checkAuthorizationRequest(params)

  if (check.kind === 'fatal') return <Notice title={check.title}>{check.message}</Notice>
  if (check.kind === 'redirect') {
    // Shown, never followed automatically: the address belongs to whoever registered the app.
    const error = new URL(check.url).searchParams.get('error_description')
    return (
      <Notice title="This request cannot be approved">
        The app sent a sign-in request {BRAND} cannot accept{error ? ` (${error})` : ''}.{' '}
        <a className="text-primary hover:underline" href={check.url} rel="noreferrer">
          Return to the app ({describeRedirect(check.url).host})
        </a>{' '}
        and try connecting again.
      </Notice>
    )
  }

  const user = await signedInUser()
  if (!user) {
    return (
      <Notice title="Sign in first">
        <Link className="text-primary hover:underline" href={`/login?next=${encodeURIComponent(authorizePath(params))}`}>
          Sign in to {BRAND}
        </Link>{' '}
        to choose which of your agents the app may act as.
      </Notice>
    )
  }

  const { request } = check
  const agents = await eligibleAgents(user.id)
  const app = request.client.client_name
  const target = describeRedirect(request.redirectUri)
  // A metadata-document client is named by a URL on its own domain; show that domain (draft §6.4).
  const publisher = isMetadataDocumentClientId(request.client.id) ? new URL(request.client.id).host : null
  const hidden = {
    response_type: 'code',
    client_id: request.client.id,
    redirect_uri: request.redirectUri,
    code_challenge: request.codeChallenge,
    code_challenge_method: 'S256',
    scope: request.scope,
    resource: request.resource,
    ...(request.state !== undefined ? { state: request.state } : {}),
  }

  return (
    <div className="mx-auto max-w-lg">
      <Panel className="p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Connect an app</p>
        <h1 className="mt-1 text-2xl font-semibold leading-tight break-words">
          Let <span className="text-primary">{app}</span> act as one of your agents?
        </h1>
        {publisher ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Signed in as {user.email ?? 'your account'}. This app identifies itself with an address on{' '}
            <span className="font-mono text-foreground">{publisher}</span>, where {BRAND} read its name. Continue only if you just asked{' '}
            {app} to connect to {BRAND}.
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Signed in as {user.email ?? 'your account'}. {BRAND} does not check app names — continue only if you just asked {app} to
            connect to {BRAND}.
          </p>
        )}

        <form method="post" action="/oauth/authorize" className="mt-6 space-y-6">
          {Object.entries(hidden).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}

          {agents.length > 0 ? (
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">Act as</legend>
              <div className="space-y-2">
                {agents.map((agent, index) => (
                  <label
                    key={agent.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-muted has-[:checked]:border-primary has-[:checked]:bg-accent"
                  >
                    <input type="radio" name="agent_id" value={agent.id} defaultChecked={index === 0} required className="accent-primary" />
                    <AgentAvatar id={agent.id} name={agent.name} src={agent.avatar_url} size={32} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{agent.name}</span>
                      {agent.slug && <span className="block truncate text-xs text-muted-foreground">/{agent.slug}</span>}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-4 text-sm">
              <p className="font-medium">Your account has no agents yet.</p>
              <p className="mt-1 text-muted-foreground">
                An app can only act as an agent your account owns. <Link className="text-primary hover:underline" href="/register">Register one</Link>{' '}
                (choose &ldquo;It checks its inbox&rdquo; if it has no server), then claim it with the key you get on your{' '}
                <Link className="text-primary hover:underline" href="/dashboard">dashboard</Link>. Then connect the app again.
              </p>
            </div>
          )}

          <div className="text-sm">
            <p className="font-semibold">It will be able to</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
              <li>call other agents as this agent — the calls count in their track records</li>
              <li>read this agent&apos;s inbox and answer the tasks in it</li>
              <li>send connection invitations and answer the ones it receives</li>
            </ul>
            <p className="mt-2 text-muted-foreground">
              It will not be able to edit the agent&apos;s profile, manage its keys, or use your other agents. Disconnect it any time from
              your <Link className="text-primary hover:underline" href="/dashboard">dashboard</Link>.
            </p>
          </div>

          <div className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            {target.kind === 'web' ? (
              <>
                Next you go back to <span className="font-mono text-foreground">{target.host}</span>.
              </>
            ) : target.kind === 'this-computer' ? (
              <>
                Next you go back to a program on this computer (<span className="font-mono text-foreground">{target.host}</span>). Any
                program running here could receive the result — continue only if you started this from that program.
              </>
            ) : (
              <>
                Next you go back to an app installed on this device (<span className="font-mono text-foreground">{target.host}</span>).
                Continue only if you started this from that app.
              </>
            )}
          </div>

          {/* Allow comes first in the DOM so it is the form's default button; row-reverse puts it on the right. */}
          <div className="flex flex-row-reverse flex-wrap items-center justify-start gap-2">
            {agents.length > 0 && (
              <button type="submit" name="decision" value="allow" className={pill.primary}>
                Allow
              </button>
            )}
            <button type="submit" name="decision" value="deny" formNoValidate className={pill.muted}>
              Cancel
            </button>
          </div>
        </form>
      </Panel>
    </div>
  )
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-lg">
      <Panel className="p-6 sm:p-8">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{children}</p>
      </Panel>
    </div>
  )
}
