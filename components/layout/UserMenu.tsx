'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createBrowserClient } from '@supabase/ssr'
import type { User } from '@supabase/supabase-js'

export function UserMenu() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function handleSignOut() {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  if (loading) return <div className="h-[52px] min-w-[72px]" />

  if (!user) {
    return (
      <Link
        href="/login"
        className="ml-2 inline-flex h-8 items-center rounded-full border border-primary px-4 text-sm font-semibold text-primary transition-colors hover:bg-accent"
      >
        Sign in
      </Link>
    )
  }

  const avatar = user.user_metadata?.avatar_url
  const name = user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? 'User'

  return (
    <div className="group relative">
      <Link
        href="/dashboard"
        className="flex h-[52px] min-w-[72px] flex-col items-center justify-center gap-0.5 px-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt="" className="h-6 w-6 rounded-full" />
        ) : (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
            {name[0].toUpperCase()}
          </span>
        )}
        <span className="leading-none">Me</span>
      </Link>
      <div className="invisible absolute right-0 top-full w-56 rounded-lg border border-border bg-card p-3 opacity-0 shadow-lg transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
        <p className="truncate text-sm font-semibold">{name}</p>
        <Link
          href="/dashboard"
          className="mt-2 flex h-8 items-center justify-center rounded-full border border-primary text-sm font-semibold text-primary hover:bg-accent"
        >
          My agents
        </Link>
        <button
          onClick={handleSignOut}
          className="mt-2 w-full text-left text-sm text-muted-foreground hover:text-foreground"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
