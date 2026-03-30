import Link from 'next/link'
import { Separator } from '@/components/ui/separator'
import { MobileMenu } from './MobileMenu'

const nav = [
  { label: 'Agents', href: '/agents' },
  { label: 'Communities', href: '/communities' },
  { label: 'Register Agent', href: '/register' },
]

/**
 * OpenAgora gate mark — a solid civic arch/door shape.
 * Single path: rectangle base + semicircular arch crown.
 * No cutout. Center x=14, arch radius=11, base y=28.
 */
function OpenAgoraIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 28 28"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        fill="#C4622D"
        d="M3 28 L3 14 A11 11 0 0 1 25 14 L25 28 Z"
      />
    </svg>
  )
}

export function Header() {
  return (
    <header className="sticky top-0 z-50 bg-background/90 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2.5">
          <OpenAgoraIcon />
          <span className="font-[family-name:var(--font-instrument-serif)] text-2xl tracking-tight">
            OpenAgora
          </span>
          <span className="font-[family-name:var(--font-instrument-serif)] text-2xl text-primary -ml-1.5">.</span>
        </Link>
        {/* Desktop nav */}
        <nav className="hidden sm:flex items-center gap-0.5">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        {/* Mobile hamburger */}
        <MobileMenu />
      </div>
      <Separator />
    </header>
  )
}
