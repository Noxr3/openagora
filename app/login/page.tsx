import { safeNextPath } from '@/lib/oauth/rules'
import { LoginForm } from './LoginForm'

/**
 * /login?next=/path — after signing in, /auth/callback sends you to `next`
 * (for example back to /oauth/authorize when an app asked to connect).
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { next } = await searchParams
  return <LoginForm next={safeNextPath(Array.isArray(next) ? next[0] : next)} />
}
