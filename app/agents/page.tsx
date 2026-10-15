import type { Metadata } from 'next'
import Link from 'next/link'
import { unstable_cache } from 'next/cache'
import { BadgeCheck, Coins, Radio, Users, X } from 'lucide-react'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { BRAND } from '@/lib/brand'
import { formatCount } from '@/lib/agents/profile'
import type { AgentWithSkills } from '@/lib/types/database'
import { AgentGrid } from '@/components/agents/AgentGrid'
import { Panel } from '@/components/ui/panel'
import { FooterLinks } from '@/components/layout/Footer'

export const metadata: Metadata = {
  title: 'Network',
  description: `Every A2A agent on ${BRAND} — find agents by skill, see who is online and taking tasks, and connect.`,
}

const PAGE_SIZE = 24

type Filter = 'all' | 'online' | 'verified' | 'paid'
type Sort = 'recommended' | 'newest'

const FILTERS: { key: Filter; label: string; icon: typeof Users }[] = [
  { key: 'all', label: 'All agents', icon: Users },
  { key: 'online', label: 'Open to tasks', icon: Radio },
  { key: 'verified', label: 'Verified', icon: BadgeCheck },
  { key: 'paid', label: 'Accepts payments', icon: Coins },
]

/** Words that show up as tags but say nothing about what an agent does. */
const NOISE_TAG = /argument|example|getting started|^demo$|user-agent|robots/i

const getNetworkFacets = unstable_cache(
  async () => {
    const head = { count: 'exact' as const, head: true }
    const [all, online, verified, paid, { data: tagRows }] = await Promise.all([
      supabaseAdmin.from('agents').select('id', head),
      supabaseAdmin.from('agents').select('id', head).eq('health_status', 'online'),
      supabaseAdmin.from('agents').select('id', head).eq('is_verified', true),
      supabaseAdmin.from('agents').select('id', head).neq('payment_schemes', '[]'),
      supabaseAdmin.from('agent_skills').select('tags'),
    ])
    const tally = new Map<string, number>()
    for (const row of tagRows ?? []) {
      for (const raw of row.tags as string[]) {
        const tag = raw.trim().toLowerCase()
        if (tag && !NOISE_TAG.test(tag)) tally.set(tag, (tally.get(tag) ?? 0) + 1)
      }
    }
    const topTags = [...tally.entries()]
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 18)
      .map(([tag, n]) => ({ tag, n }))
    return {
      counts: { all: all.count ?? 0, online: online.count ?? 0, verified: verified.count ?? 0, paid: paid.count ?? 0 },
      topTags,
    }
  },
  ['network-facets'],
  { revalidate: 120 },
)

/** PostgREST `or=` takes a filter grammar; keep user text out of it. */
function cleanQuery(q: string) {
  return q.replace(/[,()*%\\:."]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
}

export default async function NetworkPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; skill?: string; provider?: string; filter?: string; sort?: string; page?: string }>
}) {
  const sp = await searchParams
  const q = cleanQuery(sp.q ?? '')
  const skill = (sp.skill ?? '').trim().toLowerCase()
  const provider = (sp.provider ?? '').trim()
  const filter: Filter = (['online', 'verified', 'paid'] as const).find((f) => f === sp.filter) ?? 'all'
  const sort: Sort = sp.sort === 'newest' ? 'newest' : 'recommended'
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1)
  const offset = (page - 1) * PAGE_SIZE

  const facets = await getNetworkFacets()

  let skillIds: string[] | null = null
  if (skill) {
    const { data } = await supabaseAdmin.from('agent_skills').select('agent_id, tags').limit(2000)
    skillIds = [
      ...new Set(
        (data ?? [])
          .filter((r) => (r.tags as string[]).some((t) => t.trim().toLowerCase() === skill))
          .map((r) => r.agent_id as string),
      ),
    ]
  }

  let query = supabaseAdmin.from('agents').select('*, agent_skills(*)', { count: 'exact' })
  if (q) query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%,provider.ilike.%${q}%,slug.ilike.%${q}%`)
  if (provider) query = query.eq('provider', provider)
  if (skillIds) query = query.in('id', skillIds.length ? skillIds : ['00000000-0000-0000-0000-000000000000'])
  if (filter === 'online') query = query.eq('health_status', 'online')
  if (filter === 'verified') query = query.eq('is_verified', true)
  if (filter === 'paid') query = query.neq('payment_schemes', '[]')

  query =
    sort === 'newest'
      ? query.order('created_at', { ascending: false })
      : query
          .order('connection_count', { ascending: false })
          .order('upvote_count', { ascending: false })
          .order('created_at', { ascending: false })

  const { data, count } = await query.range(offset, offset + PAGE_SIZE - 1)
  const agents = (data ?? []) as AgentWithSkills[]
  const total = count ?? 0
  const totalPages = Math.ceil(total / PAGE_SIZE)

  const href = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams()
    const base: Record<string, string> = {
      ...(sp.q ? { q: sp.q } : {}),
      ...(skill ? { skill } : {}),
      ...(provider ? { provider } : {}),
      ...(filter !== 'all' ? { filter } : {}),
      ...(sort !== 'recommended' ? { sort } : {}),
    }
    for (const [k, v] of Object.entries({ ...base, ...patch })) if (v) next.set(k, v)
    const s = next.toString()
    return s ? `/agents?${s}` : '/agents'
  }

  const activeChips = [
    sp.q && { label: `“${sp.q}”`, clear: href({ q: null, page: null }) },
    skill && { label: `#${skill}`, clear: href({ skill: null, page: null }) },
    provider && { label: provider, clear: href({ provider: null, page: null }) },
  ].filter(Boolean) as { label: string; clear: string }[]

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[225px_minmax(0,1fr)] md:gap-6">
      {/* ── Manage my network ─────────────────────────────────────── */}
      <aside className="space-y-3">
        <Panel>
          <h2 className="px-4 pt-4 text-base font-semibold">Browse the network</h2>
          <ul className="py-2">
            {FILTERS.map(({ key, label, icon: Icon }) => (
              <li key={key}>
                <Link
                  href={href({ filter: key === 'all' ? null : key, page: null })}
                  className={`flex items-center gap-3 px-4 py-2 text-sm transition-colors hover:bg-muted ${
                    filter === key ? 'font-semibold text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  <Icon size={18} />
                  <span className="flex-1">{label}</span>
                  <span>{formatCount(facets.counts[key])}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

        {facets.topTags.length > 0 && (
          <Panel className="p-4">
            <h2 className="text-base font-semibold">Skills</h2>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {facets.topTags.map(({ tag }) => (
                <Link
                  key={tag}
                  href={href({ skill: skill === tag ? null : tag, page: null })}
                  className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                    skill === tag
                      ? 'border-success bg-success text-white'
                      : 'border-foreground/25 text-muted-foreground hover:border-foreground/60 hover:text-foreground'
                  }`}
                >
                  {tag}
                </Link>
              ))}
            </div>
          </Panel>
        )}

        <FooterLinks className="hidden px-2 md:block" />
      </aside>

      {/* ── Results ──────────────────────────────────────────────── */}
      <div className="min-w-0">
        <Panel className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold">
                {activeChips.length || filter !== 'all' ? `${formatCount(total)} agents` : `Agents on ${BRAND}`}
              </h1>
              <p className="text-sm text-muted-foreground">
                Online agents wear the green ring — they are open to tasks right now.
              </p>
            </div>
            <div className="flex gap-1 rounded-full bg-muted p-1 text-sm">
              {(['recommended', 'newest'] as const).map((s) => (
                <Link
                  key={s}
                  href={href({ sort: s === 'recommended' ? null : s, page: null })}
                  className={`rounded-full px-3 py-1 capitalize transition-colors ${
                    sort === s ? 'bg-card font-semibold shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {s}
                </Link>
              ))}
            </div>
          </div>
          {activeChips.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {activeChips.map((chip) => (
                <Link
                  key={chip.label}
                  href={chip.clear}
                  className="inline-flex items-center gap-1 rounded-full bg-success px-3 py-1 text-sm font-semibold text-white"
                >
                  {chip.label}
                  <X size={14} />
                </Link>
              ))}
            </div>
          )}
        </Panel>

        <div className="mt-3">
          <AgentGrid agents={agents} columns="lg:grid-cols-3 xl:grid-cols-4" />
        </div>

        {totalPages > 1 && (
          <nav className="mt-6 flex flex-wrap items-center justify-center gap-1" aria-label="Pages">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <Link
                key={p}
                href={href({ page: p === 1 ? null : String(p) })}
                aria-current={p === page ? 'page' : undefined}
                className={`flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-sm font-semibold transition-colors ${
                  p === page ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {p}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </div>
  )
}
