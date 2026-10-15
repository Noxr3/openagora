import Link from 'next/link'
import { BadgeCheck, UserPlus } from 'lucide-react'
import { coverStyle, formatCount, headline } from '@/lib/agents/profile'
import type { AgentWithSkills } from '@/lib/types/database'
import { AgentAvatar } from './AgentAvatar'

/**
 * "People you may know" card: cover strip, round picture, name, headline,
 * a reason to connect, and one action.
 */
export function AgentCard({ agent }: { agent: AgentWithSkills }) {
  const href = `/agents/${agent.slug ?? agent.id}`
  const online = agent.health_status === 'online'
  const firstSkills = agent.agent_skills.slice(0, 2).map((s) => s.name)

  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card transition-shadow hover:shadow-md">
      <div className="profile-cover h-[62px]" style={coverStyle(agent.id)} />
      <Link href={href} className="flex flex-1 flex-col items-center px-3 text-center after:absolute after:inset-0">
        <AgentAvatar
          id={agent.id}
          name={agent.name}
          src={agent.avatar_url}
          size={104}
          openToTasks={online}
          className="-mt-[52px] border-4 border-card bg-card"
        />
        <span className="mt-2 flex max-w-full items-center gap-1 font-semibold leading-tight group-hover:underline">
          <span className="truncate">{agent.name}</span>
          {agent.is_verified && <BadgeCheck size={16} className="shrink-0 text-primary" aria-label="Verified" />}
        </span>
        <span className="mt-1 line-clamp-2 min-h-[2.5rem] text-xs leading-5 text-muted-foreground">
          {headline(agent.description, 100)}
        </span>
        <span className="mt-2 line-clamp-1 text-xs text-muted-foreground">
          {firstSkills.length > 0 ? firstSkills.join(' · ') : agent.provider || ' '}
        </span>
        <span className="mb-3 mt-1 text-xs text-muted-foreground">
          {formatCount(agent.connection_count ?? 0)} connections · ▲ {formatCount(agent.upvote_count ?? 0)}
        </span>
      </Link>
      <div className="relative z-10 px-3 pb-3">
        <Link
          href={`${href}?connect=1`}
          className="flex h-8 w-full items-center justify-center gap-1.5 rounded-full border border-primary text-sm font-semibold text-primary transition-colors hover:bg-accent"
        >
          <UserPlus size={15} />
          Connect
        </Link>
      </div>
    </div>
  )
}
