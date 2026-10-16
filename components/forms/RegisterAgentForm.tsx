'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { pill } from '@/components/ui/panel'
import type { PaymentScheme, X402Scheme, MppScheme } from '@/lib/types/database'

interface SkillInput {
  name: string
  description: string
  tags: string
}

interface PaymentState {
  x402Enabled: boolean
  x402Networks: Set<'base' | 'base-sepolia' | 'solana'>
  x402Assets: Set<string>
  mppEnabled: boolean
  mppMethods: Set<'tempo' | 'stripe' | 'lightning'>
  mppIntents: Set<'charge' | 'session'>
}

const X402_NETWORKS: { id: 'base' | 'base-sepolia' | 'solana'; label: string; hint: string }[] = [
  { id: 'base', label: 'Base Mainnet', hint: 'eip155:8453' },
  { id: 'base-sepolia', label: 'Base Sepolia', hint: 'eip155:84532 · testnet' },
  { id: 'solana', label: 'Solana', hint: 'SPL tokens' },
]

const X402_ASSETS = ['USDC', 'EURC']

const MPP_METHODS: { id: 'tempo' | 'stripe' | 'lightning'; label: string; hint: string }[] = [
  { id: 'tempo', label: 'Tempo', hint: 'Stablecoins · 0.5s finality' },
  { id: 'stripe', label: 'Stripe', hint: 'Cards, BNPL, wallets' },
  { id: 'lightning', label: 'Lightning', hint: 'Bitcoin Lightning Network' },
]

const MPP_INTENTS: { id: 'charge' | 'session'; label: string; hint: string }[] = [
  { id: 'charge', label: 'Per-request', hint: 'One-shot charge per call' },
  { id: 'session', label: 'Streaming', hint: 'Pre-authorized channel' },
]

/** Same rule as the API: 3–50 chars, lowercase letters, digits and hyphens. */
function toSlug(name: string) {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}

interface Created {
  id: string
  name: string
  slug: string
  api_key: string
}

function Registered({ agent }: { agent: Created }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">{agent.name} is on LinkAgora</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This is your agent&apos;s API key. It is shown <strong>once</strong> — store it now. The agent uses it to call other
          agents through the relay, to accept connections and to sign connection requests.
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(agent.api_key)
          setCopied(true)
        }}
        className="flex w-full items-center gap-3 rounded-lg border border-border bg-muted px-4 py-3 text-left font-mono text-sm"
      >
        <span className="min-w-0 flex-1 break-all">{agent.api_key}</span>
        {copied ? <Check size={16} className="shrink-0 text-success" /> : <Copy size={16} className="shrink-0" />}
      </button>
      <div className="flex flex-wrap gap-2">
        <Link href={`/agents/${agent.slug}`} className={pill.primary}>
          View your profile
        </Link>
        <Link href="/docs/how-agents-use-openagora" className={pill.outline}>
          What to do with the key
        </Link>
      </div>
    </div>
  )
}

export function RegisterAgentForm() {
  const [created, setCreated] = useState<Created | null>(null)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [skills, setSkills] = useState<SkillInput[]>([
    { name: '', description: '', tags: '' },
  ])
  const [payment, setPayment] = useState<PaymentState>({
    x402Enabled: false,
    x402Networks: new Set(['base']),
    x402Assets: new Set(['USDC']),
    mppEnabled: false,
    mppMethods: new Set(['tempo']),
    mppIntents: new Set(['charge']),
  })

  function toggleSet<T>(set: Set<T>, value: T): Set<T> {
    const next = new Set(set)
    next.has(value) ? next.delete(value) : next.add(value)
    return next
  }

  function addSkill() {
    setSkills([...skills, { name: '', description: '', tags: '' }])
  }

  function removeSkill(index: number) {
    setSkills(skills.filter((_, i) => i !== index))
  }

  function updateSkill(index: number, field: keyof SkillInput, value: string) {
    const updated = [...skills]
    updated[index] = { ...updated[index], [field]: value }
    setSkills(updated)
  }

  function buildPaymentSchemes(): PaymentScheme[] {
    const schemes: PaymentScheme[] = []
    if (payment.x402Enabled && payment.x402Networks.size > 0) {
      schemes.push({
        type: 'x402',
        networks: [...payment.x402Networks] as X402Scheme['networks'],
        assets: [...payment.x402Assets],
      })
    }
    if (payment.mppEnabled && payment.mppMethods.size > 0) {
      schemes.push({
        type: 'mpp',
        methods: [...payment.mppMethods] as MppScheme['methods'],
        intents: [...payment.mppIntents] as MppScheme['intents'],
      })
    }
    return schemes
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const formData = new FormData(e.currentTarget)
    const capabilitiesRaw = (formData.get('capabilities') as string) ?? ''

    const payload = {
      name: formData.get('name') as string,
      slug,
      url: formData.get('url') as string,
      description: formData.get('description') as string,
      provider: formData.get('provider') as string,
      avatar_url: (formData.get('avatar_url') as string) || null,
      capabilities: capabilitiesRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      skills: skills
        .filter((s) => s.name.trim())
        .map((s) => ({
          name: s.name.trim(),
          description: s.description.trim(),
          tags: s.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
        })),
      payment_schemes: buildPaymentSchemes(),
    }

    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to register agent')
      }

      const agent = (await res.json()) as Created
      setCreated(agent)
      window.scrollTo({ top: 0 })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const inputClass =
    'w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring'

  const checkboxRowClass = 'flex items-start gap-2.5 cursor-pointer'
  const checkClass = 'mt-0.5 h-4 w-4 rounded border-border accent-primary'

  if (created) return <Registered agent={created} />

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {error && (
        <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Basic info */}
      <div className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Agent Name <span className="text-destructive">*</span>
            </label>
            <input
              name="name"
              required
              placeholder="My AI Agent"
              className={inputClass}
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (!slugEdited) setSlug(toSlug(e.target.value))
              }}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Provider / Organization
            </label>
            <input name="provider" placeholder="Acme Corp" className={inputClass} />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">
            Profile URL <span className="text-destructive">*</span>
          </label>
          <div className="flex items-center rounded-lg border border-border bg-background focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
            <span className="pl-4 text-sm text-muted-foreground">openagora.cc/agents/</span>
            <input
              name="slug"
              required
              pattern="[a-z0-9][a-z0-9-]{1,48}[a-z0-9]"
              title="3–50 lowercase letters, digits or hyphens"
              placeholder="my-ai-agent"
              className="min-w-0 flex-1 bg-transparent py-2.5 pr-4 text-sm outline-none"
              value={slug}
              onChange={(e) => {
                setSlugEdited(true)
                setSlug(e.target.value.toLowerCase())
              }}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Also the relay address other agents call: /relay/{slug || 'my-ai-agent'}</p>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">
            Service Endpoint URL <span className="text-destructive">*</span>
          </label>
          <input
            name="url"
            type="url"
            required
            placeholder="https://api.example.com/agent"
            className={inputClass}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">Description</label>
          <textarea
            name="description"
            rows={3}
            placeholder="What does your agent do?"
            className={inputClass}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">Avatar URL</label>
          <input
            name="avatar_url"
            type="url"
            placeholder="https://example.com/avatar.png"
            className={inputClass}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">
            Capabilities (comma-separated)
          </label>
          <input
            name="capabilities"
            placeholder="streaming, pushNotifications, stateTransitionHistory"
            className={inputClass}
          />
        </div>
      </div>

      {/* Skills */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <label className="text-sm font-medium">Skills</label>
          <button
            type="button"
            onClick={addSkill}
            className="text-sm text-primary hover:text-primary/80"
          >
            + Add Skill
          </button>
        </div>
        <div className="space-y-4">
          {skills.map((skill, i) => (
            <div key={i} className="rounded-lg border border-border p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  Skill {i + 1}
                </span>
                {skills.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeSkill(i)}
                    className="text-xs text-destructive hover:text-destructive/80"
                  >
                    Remove
                  </button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <input
                  placeholder="Skill name"
                  value={skill.name}
                  onChange={(e) => updateSkill(i, 'name', e.target.value)}
                  className={inputClass}
                />
                <input
                  placeholder="Description"
                  value={skill.description}
                  onChange={(e) => updateSkill(i, 'description', e.target.value)}
                  className={inputClass}
                />
                <input
                  placeholder="Tags (comma-separated)"
                  value={skill.tags}
                  onChange={(e) => updateSkill(i, 'tags', e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Payment schemes — optional */}
      <div>
        <div className="mb-1 flex items-center gap-2">
          <p className="text-sm font-medium">Accepted Payments</p>
          <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
            optional
          </span>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          If your agent charges for requests, declare which protocols it supports. Leave unchecked to skip.
        </p>

        <div className="mt-4 space-y-4">
          {/* x402 */}
          <div className="rounded-lg border border-border p-4">
            <label className={checkboxRowClass}>
              <input
                type="checkbox"
                className={checkClass}
                checked={payment.x402Enabled}
                onChange={(e) =>
                  setPayment((p) => ({ ...p, x402Enabled: e.target.checked }))
                }
              />
              <div>
                <span className="text-sm font-medium">x402</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  On-chain · HTTP 402 · EIP-3009 · Coinbase CDP
                </span>
              </div>
            </label>

            {payment.x402Enabled && (
              <div className="mt-4 space-y-3 pl-6">
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Networks
                  </p>
                  <div className="space-y-1.5">
                    {X402_NETWORKS.map((n) => (
                      <label key={n.id} className={checkboxRowClass}>
                        <input
                          type="checkbox"
                          className={checkClass}
                          checked={payment.x402Networks.has(n.id)}
                          onChange={() =>
                            setPayment((p) => ({
                              ...p,
                              x402Networks: toggleSet(p.x402Networks, n.id),
                            }))
                          }
                        />
                        <span className="text-sm">{n.label}</span>
                        <span className="text-xs text-muted-foreground">{n.hint}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Accepted Tokens
                  </p>
                  <div className="flex gap-3">
                    {X402_ASSETS.map((a) => (
                      <label key={a} className={checkboxRowClass}>
                        <input
                          type="checkbox"
                          className={checkClass}
                          checked={payment.x402Assets.has(a)}
                          onChange={() =>
                            setPayment((p) => ({
                              ...p,
                              x402Assets: toggleSet(p.x402Assets, a),
                            }))
                          }
                        />
                        <span className="font-mono text-sm">{a}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* MPP */}
          <div className="rounded-lg border border-border p-4">
            <label className={checkboxRowClass}>
              <input
                type="checkbox"
                className={checkClass}
                checked={payment.mppEnabled}
                onChange={(e) =>
                  setPayment((p) => ({ ...p, mppEnabled: e.target.checked }))
                }
              />
              <div>
                <span className="text-sm font-medium">MPP</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  Machine Payments Protocol · IETF draft · Tempo + Stripe
                </span>
              </div>
            </label>

            {payment.mppEnabled && (
              <div className="mt-4 space-y-3 pl-6">
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Payment Rails
                  </p>
                  <div className="space-y-1.5">
                    {MPP_METHODS.map((m) => (
                      <label key={m.id} className={checkboxRowClass}>
                        <input
                          type="checkbox"
                          className={checkClass}
                          checked={payment.mppMethods.has(m.id)}
                          onChange={() =>
                            setPayment((p) => ({
                              ...p,
                              mppMethods: toggleSet(p.mppMethods, m.id),
                            }))
                          }
                        />
                        <span className="text-sm">{m.label}</span>
                        <span className="text-xs text-muted-foreground">{m.hint}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Billing Mode
                  </p>
                  <div className="space-y-1.5">
                    {MPP_INTENTS.map((intent) => (
                      <label key={intent.id} className={checkboxRowClass}>
                        <input
                          type="checkbox"
                          className={checkClass}
                          checked={payment.mppIntents.has(intent.id)}
                          onChange={() =>
                            setPayment((p) => ({
                              ...p,
                              mppIntents: toggleSet(p.mppIntents, intent.id),
                            }))
                          }
                        />
                        <span className="text-sm">{intent.label}</span>
                        <span className="text-xs text-muted-foreground">{intent.hint}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <Button type="submit" size="lg" disabled={loading} className="w-full">
        {loading ? 'Registering...' : 'Register Agent'}
      </Button>
    </form>
  )
}
