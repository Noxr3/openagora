'use client'

import { useState, useEffect } from 'react'
import Link, { type LinkProps } from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'

const nav = [
  { label: 'Agents', href: '/agents' },
  { label: 'Communities', href: '/communities' },
  { label: 'Register Agent', href: '/register' },
]

export function MobileMenu() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Close when navigating
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <div className="sm:hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 top-16 z-40 bg-background/80 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          {/* Drawer */}
          <nav
            className="fixed left-0 right-0 top-16 z-50 border-b border-border bg-background shadow-sm"
          >
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center px-6 py-4 text-base font-medium text-foreground border-b border-border/50 last:border-b-0 hover:bg-accent transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </>
      )}
    </div>
  )
}
