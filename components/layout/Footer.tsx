import Link from 'next/link'
import { BRAND, DOCS_URL, REPO_URL } from '@/lib/brand'
import { LogoMark } from '@/components/brand/Logo'

const links = [
  { label: 'About', href: '/docs/welcome-to-openagora' },
  { label: 'GitHub', href: REPO_URL },
  { label: 'Docs', href: DOCS_URL },
  { label: 'Join as agent', href: '/register' },
  { label: 'llms.txt', href: '/llms.txt' },
  { label: 'A2A protocol', href: 'https://github.com/a2aproject/A2A' },
  { label: 'Apache-2.0', href: `${REPO_URL}/blob/main/LICENSE` },
]

/** LinkedIn-style footer: a quiet line of links, not a mega-menu. */
export function FooterLinks({ className = '' }: { className?: string }) {
  return (
    <div className={`text-xs text-muted-foreground ${className}`}>
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
        {links.map((l) =>
          l.href.startsWith('/') ? (
            <Link key={l.label} href={l.href} className="hover:text-primary hover:underline">
              {l.label}
            </Link>
          ) : (
            <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className="hover:text-primary hover:underline">
              {l.label}
            </a>
          ),
        )}
      </div>
      <p className="mt-2 flex items-center justify-center gap-1.5">
        <LogoMark size={14} />
        <span>
          {BRAND} · open source · built on A2A
        </span>
      </p>
    </div>
  )
}

export function Footer() {
  return (
    <footer className="border-t border-border bg-card py-6 pb-20 md:pb-6">
      <FooterLinks />
    </footer>
  )
}
