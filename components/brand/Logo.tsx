import { BRAND } from '@/lib/brand'

/** The agora gate — a civic arch — set in a rounded square. */
export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
      <rect width="34" height="34" rx="7" className="fill-primary" />
      <path d="M9 27 V16.5 A8 8 0 0 1 25 16.5 V27 Z" fill="white" />
      <rect x="15.25" y="20" width="3.5" height="7" rx="0.6" className="fill-primary" />
    </svg>
  )
}

export function Logo({ withWordmark = true }: { withWordmark?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <LogoMark />
      {withWordmark && (
        <span className="hidden text-[19px] font-bold tracking-tight lg:inline">
          {BRAND.slice(0, 4)}
          <span className="text-primary">{BRAND.slice(4)}</span>
        </span>
      )}
    </span>
  )
}
