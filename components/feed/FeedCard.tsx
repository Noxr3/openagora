import Link from 'next/link'
import { BadgeCheck, MessageSquareText, ThumbsUp, UserPlus } from 'lucide-react'
import type { FeedAgent, FeedItem } from '@/lib/feed'
import { headline, readableBody } from '@/lib/agents/profile'
import { timeAgo } from '@/lib/utils/format'
import { BRAND } from '@/lib/brand'
import { Panel } from '@/components/ui/panel'
import { AgentAvatar } from '@/components/agents/AgentAvatar'
import { ShareButton } from './ShareButton'

const action =
  'flex flex-1 items-center justify-center gap-1.5 rounded-md py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'

function profileHref(a: Pick<FeedAgent, 'id' | 'slug'>) {
  return `/agents/${a.slug ?? a.id}`
}

function Byline({ agent, at, context }: { agent: FeedAgent; at: string; context?: React.ReactNode }) {
  return (
    <div className="flex gap-2 px-4 pt-3">
      <Link href={profileHref(agent)}>
        <AgentAvatar id={agent.id} name={agent.name} src={agent.avatar_url} size={48} openToTasks={agent.health_status === 'online'} />
      </Link>
      <div className="min-w-0 flex-1 leading-tight">
        <Link href={profileHref(agent)} className="flex items-center gap-1 text-sm font-semibold hover:text-primary hover:underline">
          <span className="truncate">{agent.name}</span>
          {agent.is_verified && <BadgeCheck size={14} className="shrink-0 text-primary" aria-label="Verified" />}
        </Link>
        <p className="truncate text-xs text-muted-foreground">{headline(agent.description, 90)}</p>
        <p className="text-xs text-muted-foreground">
          {timeAgo(at)}
          {context && <> · {context}</>}
        </p>
      </div>
    </div>
  )
}

export function FeedCard({ item }: { item: FeedItem }) {
  if (item.kind === 'post') {
    return (
      <Panel>
        {item.author && (
          <Byline
            agent={item.author}
            at={item.at}
            context={
              item.community && (
                <Link href={`/communities/${item.community.slug}`} className="hover:text-primary hover:underline">
                  {item.community.name}
                </Link>
              )
            }
          />
        )}
        <Link href={`/posts/${item.id}`} className="block px-4 pb-2 pt-3">
          <p className="font-semibold hover:text-primary">{item.title}</p>
          {item.body && <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm">{readableBody(item.body)}</p>}
        </Link>
        {(item.reactions > 0 || item.comments > 0) && (
          <div className="flex justify-between px-4 pb-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              {item.reactions > 0 && (
                <>
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <ThumbsUp size={9} />
                  </span>
                  {item.reactions}
                </>
              )}
            </span>
            {item.comments > 0 && <span>{item.comments} comments</span>}
          </div>
        )}
        <div className="mx-2 flex border-t border-border">
          <Link href={`/posts/${item.id}`} className={action}>
            <ThumbsUp size={18} />
            <span>Like</span>
          </Link>
          <Link href={`/posts/${item.id}#comments`} className={action}>
            <MessageSquareText size={18} />
            <span>Comment</span>
          </Link>
          <ShareButton path={`/posts/${item.id}`} className={action} />
        </div>
      </Panel>
    )
  }

  if (item.kind === 'joined') {
    const [first, ...rest] = item.agents
    if (rest.length === 0) {
      const skills = (first.agent_skills ?? []).map((s) => s.name).slice(0, 3)
      return (
        <Panel>
          <p className="border-b border-border px-4 py-2 text-xs text-muted-foreground">New on {BRAND}</p>
          <Byline agent={first} at={item.at} context={first.provider || undefined} />
          <p className="px-4 pt-3 text-sm">
            👋 <span className="font-semibold">{first.name}</span> just joined the network
            {skills.length > 0 && (
              <>
                {' '}— offers <span className="font-semibold">{skills.join(', ')}</span>
              </>
            )}
            .
          </p>
          <div className="flex gap-2 px-4 pb-4 pt-3">
            <Link
              href={`${profileHref(first)}?connect=1`}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-primary px-4 text-sm font-semibold text-primary transition-colors hover:bg-accent"
            >
              <UserPlus size={15} />
              Connect
            </Link>
            <Link
              href={`${profileHref(first)}#try`}
              className="inline-flex h-8 items-center rounded-full px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Say hello
            </Link>
          </div>
        </Panel>
      )
    }
    const shown = item.agents.slice(0, 6)
    return (
      <Panel>
        <p className="border-b border-border px-4 py-2 text-xs text-muted-foreground">New on {BRAND}</p>
        <div className="px-4 py-3">
          <p className="text-sm">
            <Link
              href={`/agents?provider=${encodeURIComponent(item.provider)}`}
              className="font-semibold hover:text-primary hover:underline"
            >
              {item.provider}
            </Link>{' '}
            added {item.agents.length} agents to the network · <span className="text-muted-foreground">{timeAgo(item.at)}</span>
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {shown.map((a) => (
              <li key={a.id}>
                <Link href={profileHref(a)} className="group flex items-center gap-2">
                  <AgentAvatar id={a.id} name={a.name} src={a.avatar_url} size={36} openToTasks={a.health_status === 'online'} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold group-hover:text-primary group-hover:underline">{a.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{headline(a.description, 60)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {item.agents.length > shown.length && (
            <Link
              href={`/agents?provider=${encodeURIComponent(item.provider)}`}
              className="mt-3 inline-block text-sm font-semibold text-primary hover:underline"
            >
              See all {item.agents.length}
            </Link>
          )}
        </div>
      </Panel>
    )
  }

  return (
    <Panel className="flex items-center gap-3 px-4 py-3">
      <div className="flex -space-x-3">
        <AgentAvatar id={item.a.id} name={item.a.name} src={item.a.avatar_url} size={40} className="ring-2 ring-card" />
        <AgentAvatar id={item.b.id} name={item.b.name} src={item.b.avatar_url} size={40} className="ring-2 ring-card" />
      </div>
      <p className="text-sm">
        <Link href={profileHref(item.a)} className="font-semibold hover:text-primary hover:underline">
          {item.a.name}
        </Link>{' '}
        and{' '}
        <Link href={profileHref(item.b)} className="font-semibold hover:text-primary hover:underline">
          {item.b.name}
        </Link>{' '}
        are now connected · <span className="text-muted-foreground">{timeAgo(item.at)}</span>
      </p>
    </Panel>
  )
}
