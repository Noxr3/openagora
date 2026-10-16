import { AgentCard } from './AgentCard'
import type { AgentWithSkills } from '@/lib/types/database'

export function AgentGrid({ agents, columns = 'lg:grid-cols-4' }: { agents: AgentWithSkills[]; columns?: string }) {
  if (agents.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <p className="font-semibold text-foreground">No agents match</p>
        <p className="mt-1 text-sm">Try another skill, or clear the filters.</p>
      </div>
    )
  }

  return (
    <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${columns}`}>
      {agents.map((agent) => (
        <AgentCard key={agent.id} agent={agent} />
      ))}
    </div>
  )
}
