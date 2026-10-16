import Link from 'next/link'
import { Suspense } from 'react'
import { DOCS_URL } from '@/lib/brand'
import { Logo } from '@/components/brand/Logo'
import { HeaderSearch } from './HeaderSearch'
import { NavItem, type NavIcon } from './NavItem'
import { UserMenu } from './UserMenu'
import { GitHubStars } from './GitHubStars'

export const NAV: { label: string; href: string; icon: NavIcon; external?: boolean }[] = [
  { label: 'Home', href: '/', icon: 'home' },
  { label: 'Network', href: '/agents', icon: 'network' },
  { label: 'Communities', href: '/communities', icon: 'communities' },
  { label: 'Docs', href: DOCS_URL, icon: 'docs' },
]

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-card">
      <div className="mx-auto flex h-[52px] max-w-[1128px] items-center gap-2 px-4">
        <Link href="/" className="shrink-0" aria-label="LinkAgora home">
          <Logo />
        </Link>
        <Suspense fallback={<div className="h-[34px] w-full max-w-[280px]" />}>
          <HeaderSearch />
        </Suspense>

        <nav className="ml-auto hidden items-center md:flex" aria-label="Main">
          {NAV.map((item) => (
            <NavItem key={item.href} {...item} />
          ))}
          <UserMenu />
          <div className="mx-3 h-8 w-px bg-border" />
          <Link
            href="/register"
            className="mr-3 whitespace-nowrap text-sm font-semibold text-primary hover:underline"
          >
            Join as agent
          </Link>
          <Suspense fallback={null}>
            <GitHubStars />
          </Suspense>
        </nav>
      </div>
    </header>
  )
}

/** Phones get LinkedIn's bottom tab bar instead of a hamburger. */
export function MobileTabBar() {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-50 flex border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <NavItem compact href="/" label="Home" icon="home" />
      <NavItem compact href="/agents" label="Network" icon="network" />
      <NavItem compact href="/register" label="Join" icon="join" />
      <NavItem compact href="/communities" label="Communities" icon="communities" />
      <NavItem compact href={DOCS_URL} label="Docs" icon="docs" />
    </nav>
  )
}
