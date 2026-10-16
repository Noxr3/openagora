'use client'

import { useId } from 'react'
import { Segmented } from '@/components/ui/segmented'

/**
 * Form pieces for how the relay calls an agent, shared by the dashboard's
 * Relay access panel and registration from an Agent Card.
 *
 * The key is write-only: it lives in the input until it is sent, and nothing
 * on LinkAgora ever returns it, so no page can show it again.
 */

export const fieldClass =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50'

export type A2AVersion = '1.0' | '0.3' | 'legacy'

export const A2A_VERSIONS: readonly { value: A2AVersion; label: string; short: string }[] = [
  { value: '1.0', label: 'A2A 1.0 (SendMessage)', short: 'A2A 1.0' },
  { value: '0.3', label: 'A2A 0.2–0.3 (message/send)', short: 'A2A 0.3' },
  { value: 'legacy', label: 'Legacy, 0.1 and older (tasks/send)', short: 'Legacy A2A' },
]

export function a2aVersionShort(version: A2AVersion | null | undefined): string | null {
  return A2A_VERSIONS.find((v) => v.value === version)?.short ?? null
}

export const MIN_WAIT_SECONDS = 5
export const MAX_WAIT_SECONDS = 280
export const DEFAULT_WAIT_SECONDS = 30

export type RelayKeyMode = 'bearer' | 'header'

export interface RelayKeyInput {
  mode: RelayKeyMode
  header: string
  value: string
}

export const EMPTY_RELAY_KEY: RelayKeyInput = { mode: 'bearer', header: '', value: '' }

/** The outbound-auth body for what was typed, or null when no key was typed. */
export function relayKeyBody(input: RelayKeyInput): { bearer: string } | { header: string; value: string } | null {
  const value = input.value.trim()
  if (!value) return null
  // People paste "Bearer dka_..." as often as the key alone; the API wants the key alone.
  if (input.mode === 'bearer') return { bearer: value.replace(/^bearer\s+/i, '') }
  return { header: input.header.trim(), value }
}

/** Why what was typed cannot be sent, in words for this form; null when it can. */
export function relayKeyProblem(input: RelayKeyInput): string | null {
  const body = relayKeyBody(input)
  if (body && 'bearer' in body && /\s/.test(body.bearer)) {
    return 'A bearer key has no spaces. Paste the key alone, or choose Other header.'
  }
  return null
}

const KEY_MODES = [
  { value: 'bearer', label: 'Bearer token' },
  { value: 'header', label: 'Other header' },
] as const

/** A masked input that password managers neither fill nor offer to save. */
function SecretInput(props: Omit<React.ComponentProps<'input'>, 'type'>) {
  return (
    <input
      type="password"
      autoComplete="off"
      spellCheck={false}
      data-1p-ignore="true"
      data-lpignore="true"
      data-form-type="other"
      {...props}
    />
  )
}

export function RelayKeyFields({
  value,
  onChange,
  disabled,
  autoFocus,
}: {
  value: RelayKeyInput
  onChange: (next: RelayKeyInput) => void
  disabled?: boolean
  autoFocus?: boolean
}) {
  const id = useId()
  return (
    <div className="space-y-3">
      <Segmented
        name={`${id}-mode`}
        legend="How the agent reads its key"
        value={value.mode}
        options={KEY_MODES}
        onChange={(mode) => onChange({ ...value, mode })}
      />
      {value.mode === 'bearer' ? (
        <div>
          <label htmlFor={`${id}-bearer`} className="mb-1.5 block text-sm font-medium">
            Key
          </label>
          <SecretInput
            id={`${id}-bearer`}
            required
            autoFocus={autoFocus}
            disabled={disabled}
            placeholder="dka_…"
            className={`${fieldClass} font-mono`}
            value={value.value}
            onChange={(e) => onChange({ ...value, value: e.target.value })}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Sent as <code className="font-mono">Authorization: Bearer &lt;key&gt;</code>. Paste the key alone.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div>
            <label htmlFor={`${id}-header`} className="mb-1.5 block text-sm font-medium">
              Header name
            </label>
            <input
              id={`${id}-header`}
              required
              disabled={disabled}
              autoComplete="off"
              spellCheck={false}
              placeholder="X-API-Key"
              className={`${fieldClass} font-mono`}
              value={value.header}
              onChange={(e) => onChange({ ...value, header: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor={`${id}-value`} className="mb-1.5 block text-sm font-medium">
              Value
            </label>
            <SecretInput
              id={`${id}-value`}
              required
              autoFocus={autoFocus}
              disabled={disabled}
              className={`${fieldClass} font-mono`}
              value={value.value}
              onChange={(e) => onChange({ ...value, value: e.target.value })}
            />
          </div>
        </div>
      )}
    </div>
  )
}
