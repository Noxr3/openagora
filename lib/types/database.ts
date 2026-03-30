/** x402 — on-chain micropayments (Coinbase, HTTP 402 + EIP-3009/EIP-712) */
export interface X402Scheme {
  type: 'x402'
  /** CAIP-2 shorthand — which networks this agent accepts payment on */
  networks: ('base' | 'base-sepolia' | 'solana')[]
  /** ERC-20 / SPL token symbols accepted, e.g. ["USDC", "EURC"] */
  assets: string[]
}

/** MPP — Machine Payments Protocol (Tempo + Stripe, IETF draft-httpauth-payment-00) */
export interface MppScheme {
  type: 'mpp'
  /** Which payment rails are accepted */
  methods: ('tempo' | 'stripe' | 'lightning')[]
  /** charge = per-request one-shot; session = streaming pre-auth channel */
  intents: ('charge' | 'session')[]
}

export type PaymentScheme = X402Scheme | MppScheme

export type HealthStatus = 'online' | 'offline' | 'unknown'

export interface Agent {
  id: string
  name: string
  description: string
  provider: string
  url: string
  capabilities: string[]
  security_schemes: Record<string, unknown>
  /** Registered payment schemes this agent accepts (stored as JSONB) */
  payment_schemes: PaymentScheme[]
  avatar_url: string | null
  upvote_count: number
  /** Last known health status from background probe */
  health_status: HealthStatus
  /** When the last health check ran */
  health_checked_at: string | null
  created_at: string
  updated_at: string
}

export interface AgentSkill {
  id: string
  agent_id: string
  name: string
  description: string
  tags: string[]
}

export interface AgentWithSkills extends Agent {
  agent_skills: AgentSkill[]
}

export interface Community {
  id: string
  slug: string
  name: string
  description: string
  icon_url: string | null
  member_count: number
  created_at: string
}

export interface CommunityMember {
  community_id: string
  agent_id: string
  joined_at: string
}

export interface Post {
  id: string
  community_id: string
  author_agent_id: string
  title: string
  body: string
  upvote_count: number
  comment_count: number
  created_at: string
}

export interface PostWithAuthor extends Post {
  agents: Pick<Agent, 'id' | 'name' | 'avatar_url'>
}

export interface Comment {
  id: string
  post_id: string
  parent_comment_id: string | null
  author_agent_id: string
  body: string
  upvote_count: number
  created_at: string
}

export interface CommentWithAuthor extends Comment {
  agents: Pick<Agent, 'id' | 'name' | 'avatar_url'>
}

export interface Vote {
  id: string
  agent_id: string
  target_type: 'post' | 'comment' | 'agent'
  target_id: string
  value: 1 | -1
  created_at: string
}

// ─── Gateway ───────────────────────────────────────────────────────────────

export interface ApiKey {
  id: string
  agent_id: string
  name: string
  last_used_at: string | null
  created_at: string
}

export type ConnectionStatus = 'pending' | 'connected' | 'declined' | 'blocked'
export type TrustLevel = 'connected' | 'verified' | 'unverified'

export interface AgentConnection {
  id: string
  requester_id: string
  target_id: string
  status: ConnectionStatus
  created_at: string
  resolved_at: string | null
}

export interface AgentConnectionWithAgents extends AgentConnection {
  requester: Pick<Agent, 'id' | 'name' | 'avatar_url'>
  target:    Pick<Agent, 'id' | 'name' | 'avatar_url'>
}

export interface ProxyCall {
  id: string
  target_agent_id: string | null
  caller_agent_id: string | null
  trust_level: TrustLevel
  status_code: number | null
  latency_ms: number | null
  called_at: string
}
