import type { PaymentScheme, X402Scheme, MppScheme } from '@/lib/types/database'

// ─── Network labels ────────────────────────────────────────────────────────────
const NETWORK_LABEL: Record<string, string> = {
  'base': 'Base',
  'base-sepolia': 'Base Sepolia',
  'solana': 'Solana',
}

const METHOD_LABEL: Record<string, string> = {
  'tempo': 'Tempo',
  'stripe': 'Stripe',
  'lightning': 'Lightning',
}

const INTENT_LABEL: Record<string, string> = {
  'charge': 'per-request',
  'session': 'streaming',
}

// ─── Small SVG icons ───────────────────────────────────────────────────────────

function X402Icon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="6.5" stroke="currentColor" strokeWidth="1.2" />
      <text x="7" y="10" textAnchor="middle" fontSize="7" fontWeight="700" fill="currentColor">
        $
      </text>
    </svg>
  )
}

function MppIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="1" y="4" width="12" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4 4V3a3 3 0 016 0v1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function LightningIcon() {
  return (
    <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor" aria-hidden="true">
      <path d="M6 1L1 7h4l-1 4 5-6H5l1-4z" />
    </svg>
  )
}

// ─── Per-scheme card ───────────────────────────────────────────────────────────

function X402Card({ scheme }: { scheme: X402Scheme }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
          <X402Icon />
        </span>
        <span className="text-sm font-semibold">x402</span>
        <span className="ml-auto text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          On-chain · EIP-3009
        </span>
      </div>

      <div className="space-y-2 text-xs text-muted-foreground">
        <div className="flex flex-wrap gap-1.5">
          <span className="font-medium text-foreground">Networks:</span>
          {(scheme.networks ?? []).map((n) => (
            <span
              key={n}
              className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[11px]"
            >
              {NETWORK_LABEL[n] ?? n}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="font-medium text-foreground">Tokens:</span>
          {(scheme.assets ?? []).map((a) => (
            <span
              key={a}
              className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[11px]"
            >
              {a}
            </span>
          ))}
        </div>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        HTTP 402 + <code className="rounded bg-muted px-1">PAYMENT-SIGNATURE</code> header.
        Per-request signed transfer via EIP-712, settled on-chain via Coinbase CDP.
      </p>
    </div>
  )
}

function MppCard({ scheme }: { scheme: MppScheme }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
          <MppIcon />
        </span>
        <span className="text-sm font-semibold">MPP</span>
        <span className="ml-auto text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          IETF draft-httpauth-payment
        </span>
      </div>

      <div className="space-y-2 text-xs text-muted-foreground">
        <div className="flex flex-wrap gap-1.5">
          <span className="font-medium text-foreground">Rails:</span>
          {(scheme.methods ?? []).map((m) => (
            <span
              key={m}
              className="flex items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5"
            >
              {m === 'lightning' && <LightningIcon />}
              <span className="font-mono text-[11px]">{METHOD_LABEL[m] ?? m}</span>
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="font-medium text-foreground">Billing:</span>
          {(scheme.intents ?? []).map((i) => (
            <span
              key={i}
              className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[11px]"
            >
              {INTENT_LABEL[i] ?? i}
            </span>
          ))}
        </div>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        <code className="rounded bg-muted px-1">WWW-Authenticate: Payment</code> challenge.
        Supports per-request charges and pre-authorized streaming sessions (Tempo Labs + Stripe).
      </p>
    </div>
  )
}

// ─── Public export ─────────────────────────────────────────────────────────────

export function PaymentSchemes({ schemes }: { schemes: PaymentScheme[] }) {
  if (!schemes || schemes.length === 0) return null

  return (
    <div className="space-y-3">
      {schemes.map((scheme, i) =>
        scheme.type === 'x402'
          ? <X402Card key={i} scheme={scheme} />
          : <MppCard key={i} scheme={scheme} />
      )}
    </div>
  )
}
