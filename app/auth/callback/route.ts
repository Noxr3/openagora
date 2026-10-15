import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { safeNextPath } from '@/lib/oauth/rules'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const cookieStore = await cookies()
  // `next` comes from the query or from the cookie the login page set
  // (la_next). Both are attacker-reachable, so only a same-site path is
  // followed: `${origin}@evil.com` or `//evil.com` must never become a redirect.
  const next =
    safeNextPath(searchParams.get('next')) ??
    safeNextPath(cookieStore.get('la_next')?.value) ?? // Next has already URL-decoded it
    '/dashboard'
  cookieStore.delete('la_next')

  if (code) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
