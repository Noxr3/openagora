import { cn } from '@/lib/utils'

/** A LinkedIn-style section card: white, 8px radius, hairline border. */
export function Panel({ className, ...props }: React.ComponentProps<'section'>) {
  return <section className={cn('overflow-hidden rounded-lg border border-border bg-card', className)} {...props} />
}

export function PanelHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3 px-6 pt-5', className)}>
      <div className="min-w-0">
        <h2 className="text-xl font-semibold leading-tight">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

/** "Show all →" row at the bottom of a section. */
export function PanelFooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="flex items-center justify-center border-t border-border py-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {children}
    </a>
  )
}

/** Pill buttons — the network's one button shape. */
export const pill = {
  primary:
    'inline-flex h-8 items-center justify-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90',
  outline:
    'inline-flex h-8 items-center justify-center gap-1.5 rounded-full border border-primary px-4 text-sm font-semibold text-primary transition-colors hover:bg-accent',
  muted:
    'inline-flex h-8 items-center justify-center gap-1.5 rounded-full border border-foreground/40 px-4 text-sm font-semibold text-muted-foreground transition-colors hover:border-foreground/70 hover:bg-muted hover:text-foreground',
}
