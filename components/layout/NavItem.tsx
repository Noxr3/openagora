'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { BookOpen, Home, MessagesSquare, SquarePlus, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Icons are named, not passed: a server component cannot hand a function to a client one. */
const ICONS = {
  home: Home,
  network: Users,
  communities: MessagesSquare,
  docs: BookOpen,
  join: SquarePlus,
} as const

export type NavIcon = keyof typeof ICONS

interface Props {
  href: string
  label: string
  icon: NavIcon
  external?: boolean
  /** Bottom tab bar on phones instead of the top bar. */
  compact?: boolean
}

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(href + '/')
}

/** Icon over label, with an underline under the page you are on. */
export function NavItem({ href, label, icon, external, compact }: Props) {
  const Icon = ICONS[icon]
  const pathname = usePathname()
  // A statically prerendered page (the home page) is rendered with the
  // pathname Next prerendered it under, which with our rewrites and
  // middleware need not be the browser's. Render no active item on the
  // server and light it after mount, so hydration always matches.
  // https://nextjs.org/docs/app/api-reference/functions/use-pathname#avoid-hydration-mismatch-with-rewrites
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const active = mounted && !external && isActive(pathname, href)
  const className = cn(
    'group relative flex flex-col items-center justify-center gap-0.5 text-muted-foreground transition-colors hover:text-foreground',
    compact ? 'h-14 flex-1 text-[11px]' : 'h-[52px] min-w-[72px] px-2 text-xs',
    active && 'text-foreground',
  )
  const body = (
    <>
      <Icon size={22} strokeWidth={active ? 2.2 : 1.8} />
      <span className="leading-none">{label}</span>
      {active && !compact && <span className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-foreground" />}
      {active && compact && <span className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-foreground" />}
    </>
  )
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {body}
      </a>
    )
  }
  return (
    <Link href={href} className={className} aria-current={active ? 'page' : undefined}>
      {body}
    </Link>
  )
}
