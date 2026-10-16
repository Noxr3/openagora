'use client'

import { useId, useState } from 'react'
import { KeyRound } from 'lucide-react'
import { pill } from '@/components/ui/panel'
import { cn } from '@/lib/utils'
import { timeAgo } from '@/lib/utils/format'
import {
  A2A_VERSIONS,
  DEFAULT_WAIT_SECONDS,
  EMPTY_RELAY_KEY,
  MAX_WAIT_SECONDS,
  MIN_WAIT_SECONDS,
  RelayKeyFields,
  a2aVersionShort,
  fieldClass,
  relayKeyBody,
  relayKeyProblem,
  type A2AVersion,
  type RelayKeyInput,
} from '@/components/agents/RelayFields'

/**
 * Relay access, on each of the owner's agents on the dashboard: the key the
 * relay sends the agent (write-only), its A2A version and how long the relay
 * waits. Calls the same API an agent would (outbound-auth and PUT /api/agents),
 * authorised by the owner's session.
 */

export interface CredentialStatus {
  configured: boolean
  header?: string
  origin?: string
  updated_at?: string
}

type Notice = { kind: 'ok' | 'error'; text: string } | null

/** The version and wait as the form holds them: '' means not set. */
type RelaySettings = { version: A2AVersion | ''; wait: string }

const destructivePill =
  'inline-flex h-8 items-center justify-center rounded-full bg-destructive px-4 text-sm font-semibold text-white transition-colors hover:bg-destructive/90 disabled:opacity-50'

function NoticeLine({ notice }: { notice: Notice }) {
  return (
    <p
      aria-live="polite"
      className={cn('text-xs', notice?.kind === 'error' ? 'text-destructive' : 'text-success', !notice && 'sr-only')}
    >
      {notice?.text ?? ''}
    </p>
  )
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>
}

function errorText(data: Record<string, unknown>, fallback: string): string {
  return typeof data.error === 'string' ? data.error : fallback
}

export function RelayAccessPanel({
  agentId,
  agentUrl,
  a2aVersion,
  relayTimeoutSeconds,
  credential: initialCredential,
  canStoreKeys,
}: {
  agentId: string
  agentUrl: string
  a2aVersion: A2AVersion | null
  relayTimeoutSeconds: number | null
  credential: CredentialStatus
  canStoreKeys: boolean
}) {
  const panelId = useId()
  const [open, setOpen] = useState(false)

  // ── The key ──────────────────────────────────────────────────────────────
  const [credential, setCredential] = useState(initialCredential)
  const [key, setKey] = useState<RelayKeyInput>(EMPTY_RELAY_KEY)
  const [keyBusy, setKeyBusy] = useState(false)
  const [keyNotice, setKeyNotice] = useState<Notice>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)

  async function saveKey(e: React.FormEvent) {
    e.preventDefault()
    const body = relayKeyBody(key)
    if (!body) return
    const problem = relayKeyProblem(key)
    if (problem) {
      setKeyNotice({ kind: 'error', text: problem })
      return
    }
    setKeyBusy(true)
    setKeyNotice(null)
    try {
      const res = await fetch(`/api/agents/${agentId}/outbound-auth`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await readJson(res)
      if (!res.ok) {
        setKeyNotice({ kind: 'error', text: errorText(data, `Could not save the key (${res.status}).`) })
        return
      }
      setCredential({
        configured: true,
        header: data.header as string | undefined,
        origin: data.origin as string | undefined,
        updated_at: data.updated_at as string | undefined,
      })
      // Forget the value at once; keep the header name, which is not secret.
      setKey((k) => ({ ...k, value: '' }))
      setKeyNotice({ kind: 'ok', text: 'Saved. The relay sends it on every call to this agent.' })
    } catch {
      setKeyNotice({ kind: 'error', text: 'Could not reach LinkAgora. Try again.' })
    } finally {
      setKeyBusy(false)
    }
  }

  async function removeKey() {
    setKeyBusy(true)
    setKeyNotice(null)
    try {
      const res = await fetch(`/api/agents/${agentId}/outbound-auth`, { method: 'DELETE' })
      const data = await readJson(res)
      if (!res.ok) {
        setKeyNotice({ kind: 'error', text: errorText(data, `Could not remove the key (${res.status}).`) })
        return
      }
      setCredential({ configured: false })
      setConfirmRemove(false)
      setKeyNotice({ kind: 'ok', text: 'Removed. The relay now calls this agent without a key.' })
    } catch {
      setKeyNotice({ kind: 'error', text: 'Could not reach LinkAgora. Try again.' })
    } finally {
      setKeyBusy(false)
    }
  }

  // ── Version and wait ─────────────────────────────────────────────────────
  const [saved, setSaved] = useState<RelaySettings>({
    version: a2aVersion ?? '',
    wait: relayTimeoutSeconds?.toString() ?? '',
  })
  const [version, setVersion] = useState<A2AVersion | ''>(a2aVersion ?? '')
  const [wait, setWait] = useState(relayTimeoutSeconds?.toString() ?? '')
  const [settingsBusy, setSettingsBusy] = useState(false)
  const [settingsNotice, setSettingsNotice] = useState<Notice>(null)
  const dirty = version !== saved.version || wait.trim() !== saved.wait

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault()
    setSettingsBusy(true)
    setSettingsNotice(null)
    try {
      const res = await fetch(`/api/agents/${agentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          a2a_version: version || null,
          relay_timeout_seconds: wait.trim() === '' ? null : Number(wait),
        }),
      })
      const data = await readJson(res)
      if (!res.ok) {
        setSettingsNotice({ kind: 'error', text: errorText(data, `Could not save (${res.status}).`) })
        return
      }
      const next: RelaySettings = {
        version: (data.a2a_version as A2AVersion | null) ?? '',
        wait: typeof data.relay_timeout_seconds === 'number' ? String(data.relay_timeout_seconds) : '',
      }
      setSaved(next)
      setVersion(next.version)
      setWait(next.wait)
      setSettingsNotice({ kind: 'ok', text: 'Saved.' })
    } catch {
      setSettingsNotice({ kind: 'error', text: 'Could not reach LinkAgora. Try again.' })
    } finally {
      setSettingsBusy(false)
    }
  }

  const summary = [
    credential.configured ? `Key stored for ${credential.origin}` : 'No key stored',
    a2aVersionShort(saved.version || null) ?? 'A2A version not set',
    `waits ${saved.wait || DEFAULT_WAIT_SECONDS} s`,
  ].join(' · ')

  return (
    <div className="border-t border-border">
      <div className="flex items-center gap-3 px-4 py-3">
        <KeyRound
          size={16}
          aria-hidden
          className={cn('shrink-0', credential.configured ? 'text-success' : 'text-muted-foreground')}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Relay access</p>
          <p className="text-xs text-muted-foreground sm:truncate">{summary}</p>
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
          className={pill.muted}
        >
          {open ? 'Close' : 'Manage'}
        </button>
      </div>

      {open && (
        <div id={panelId} className="space-y-6 px-4 pb-5">
          <p className="break-all text-xs text-muted-foreground">
            The relay calls <span className="font-mono text-foreground">{agentUrl}</span>
          </p>

          {/* The key */}
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">The key the relay sends</h3>
              {credential.configured ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  Stored. The relay adds the <code className="font-mono text-foreground">{credential.header}</code> header
                  to every call it forwards to this agent, and sends it only to{' '}
                  <span className="font-mono text-foreground">{credential.origin}</span>
                  {credential.updated_at ? `. Set ${timeAgo(credential.updated_at)}.` : '.'}
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  None. The relay calls this agent without a credential. If the agent answers only with its own key — a
                  Dokki Agent&apos;s <code className="font-mono">dka_</code> connection key, for example — store it here.
                </p>
              )}
            </div>

            {credential.configured && !confirmRemove && (
              <button type="button" onClick={() => setConfirmRemove(true)} className={pill.muted} disabled={keyBusy}>
                Remove key
              </button>
            )}
            {confirmRemove && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-sm">
                  Remove the stored key? Calls through the relay go out without it until you set a new one.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={removeKey} disabled={keyBusy} className={destructivePill}>
                    {keyBusy ? 'Removing…' : 'Remove key'}
                  </button>
                  <button type="button" onClick={() => setConfirmRemove(false)} disabled={keyBusy} className={pill.muted}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {canStoreKeys ? (
              <form onSubmit={saveKey} className="space-y-3 rounded-lg border border-border p-4">
                <p className="text-sm font-medium">{credential.configured ? 'Replace the key' : 'Store a key'}</p>
                <RelayKeyFields
                  value={key}
                  onChange={(next) => {
                    setKey(next)
                    setKeyNotice(null)
                  }}
                  disabled={keyBusy}
                />
                <div className="flex flex-wrap items-center gap-3">
                  <button type="submit" disabled={keyBusy || !key.value.trim()} className={cn(pill.primary, 'disabled:opacity-50')}>
                    {keyBusy ? 'Saving…' : credential.configured ? 'Replace key' : 'Save key'}
                  </button>
                  <NoticeLine notice={keyNotice} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Stored encrypted. LinkAgora never shows it again, here or in any API. Changing the agent&apos;s endpoint
                  URL removes it.
                </p>
              </form>
            ) : (
              <>
                <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                  This LinkAgora server has no <code className="font-mono">RELAY_CREDENTIALS_KEY</code>, so it cannot store
                  keys.
                </p>
                <NoticeLine notice={keyNotice} />
              </>
            )}
          </section>

          {/* Version and wait */}
          <form onSubmit={saveSettings} className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">How the relay talks to it</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Callers on another A2A version are translated into this one, and the relay waits this long for an answer.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor={`${panelId}-version`} className="mb-1.5 block text-sm font-medium">
                  A2A version
                </label>
                <select
                  id={`${panelId}-version`}
                  value={version}
                  disabled={settingsBusy}
                  onChange={(e) => setVersion(e.target.value as A2AVersion | '')}
                  className={fieldClass}
                >
                  <option value="">Not set — forward requests unchanged</option>
                  {A2A_VERSIONS.map((v) => (
                    <option key={v.value} value={v.value}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`${panelId}-wait`} className="mb-1.5 block text-sm font-medium">
                  Wait for an answer
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id={`${panelId}-wait`}
                    type="number"
                    inputMode="numeric"
                    min={MIN_WAIT_SECONDS}
                    max={MAX_WAIT_SECONDS}
                    step={1}
                    placeholder={String(DEFAULT_WAIT_SECONDS)}
                    disabled={settingsBusy}
                    value={wait}
                    onChange={(e) => setWait(e.target.value)}
                    aria-describedby={`${panelId}-wait-hint`}
                    className={fieldClass}
                  />
                  <span className="text-sm text-muted-foreground">seconds</span>
                </div>
                <p id={`${panelId}-wait-hint`} className="mt-1 text-xs text-muted-foreground">
                  {MIN_WAIT_SECONDS} to {MAX_WAIT_SECONDS}; empty means {DEFAULT_WAIT_SECONDS}. A Dokki Agent needs{' '}
                  {MAX_WAIT_SECONDS}.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" disabled={settingsBusy || !dirty} className={cn(pill.outline, 'disabled:opacity-50')}>
                {settingsBusy ? 'Saving…' : 'Save'}
              </button>
              <NoticeLine notice={settingsNotice} />
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
