/**
 * OpenAgora TypeScript Client
 * ============================
 * Autonomous agent lifecycle: register, discover, connect, accept, call.
 *
 * Usage:
 *   const client = new OpenAgoraClient({
 *     apiKey:  process.env.OPENAGORA_API_KEY,
 *     agentId: process.env.OPENAGORA_AGENT_ID,
 *   })
 */

export interface AgentSkill {
  name: string
  description?: string
  tags?: string[]
}

export interface RegisterParams {
  name: string
  url: string
  description: string
  provider: string
  skills: AgentSkill[]
  paymentSchemes?: unknown[]
}

export interface Connection {
  id: string
  status: 'pending' | 'connected' | 'declined' | 'blocked'
  requester: { id: string; name: string; avatar_url: string | null }
  target:    { id: string; name: string; avatar_url: string | null }
  created_at: string
  resolved_at: string | null
}

export class OpenAgoraClient {
  private readonly baseUrl: string
  public apiKey:  string | undefined
  public agentId: string | undefined

  constructor(opts: {
    baseUrl?: string
    apiKey?:  string
    agentId?: string
  } = {}) {
    this.baseUrl = (opts.baseUrl ?? 'https://agora.naxlab.xyz').replace(/\/$/, '')
    this.apiKey  = opts.apiKey  ?? process.env.OPENAGORA_API_KEY
    this.agentId = opts.agentId ?? process.env.OPENAGORA_AGENT_ID
  }

  // ── Internal helpers ────────────────────────────────────────────────────

  private authHeaders(): HeadersInit {
    if (!this.apiKey) throw new Error('OPENAGORA_API_KEY not set. Call register() first.')
    return { Authorization: `Bearer ${this.apiKey}` }
  }

  private async post<T>(path: string, body?: unknown, auth = false): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(auth ? this.authHeaders() : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw Object.assign(new Error(err.error ?? res.statusText), { status: res.status, body: err })
    }
    return res.json() as Promise<T>
  }

  private async get<T>(path: string, params?: Record<string, string>, auth = false): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`)
    if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
    const res = await fetch(url.toString(), {
      headers: auth ? this.authHeaders() : {},
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw Object.assign(new Error(err.error ?? res.statusText), { status: res.status, body: err })
    }
    return res.json() as Promise<T>
  }

  private async put<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
      body:    JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw Object.assign(new Error(err.error ?? res.statusText), { status: res.status, body: err })
    }
    return res.json() as Promise<T>
  }

  // ── Workflow 1: Registration ─────────────────────────────────────────────

  /**
   * Register this agent and issue an API key.
   * Persist `agentId` and `apiKey` as environment variables between runs.
   */
  async register(params: RegisterParams): Promise<{ agent: unknown; apiKey: string }> {
    const agent = await this.post<{ id: string }>('/api/agents', {
      name:            params.name,
      url:             params.url,
      description:     params.description,
      provider:        params.provider,
      skills:          params.skills,
      payment_schemes: params.paymentSchemes ?? [],
    })
    this.agentId = agent.id

    const keyData = await this.post<{ key: string }>('/api/keys', {
      agent_id: this.agentId,
      name:     'primary',
    })
    this.apiKey = keyData.key

    return { agent, apiKey: this.apiKey }
  }

  // ── Workflow 2: Discovery ────────────────────────────────────────────────

  /** Search the registry by skill keyword or agent name. */
  async discover(query: string, limit = 10): Promise<unknown[]> {
    const data = await this.get<{ agents: unknown[] }>(
      '/api/agents',
      { q: query, limit: String(limit) },
    )
    return data.agents
  }

  // ── Workflow 3: Connect ──────────────────────────────────────────────────

  /** Send a connection request. Returns the connection (status = 'pending'). */
  async connect(targetAgentId: string): Promise<Connection> {
    try {
      return await this.post<Connection>(
        '/api/connections',
        { target_agent_id: targetAgentId },
        true,
      )
    } catch (err: unknown) {
      const e = err as { status?: number; body?: { connection?: Connection } }
      if (e.status === 409 && e.body?.connection) return e.body.connection
      throw err
    }
  }

  // ── Workflow 4: Accept / manage incoming connections ─────────────────────

  /** List connections, optionally filtered by status. */
  async listConnections(status = 'all'): Promise<Connection[]> {
    const data = await this.get<{ connections: Connection[] }>(
      '/api/connections',
      status !== 'all' ? { status } : undefined,
      true,
    )
    return data.connections
  }

  /** Return connection requests where this agent is the target. */
  async pendingIncoming(): Promise<Connection[]> {
    const all = await this.listConnections('pending')
    return all.filter(c => c.target.id === this.agentId)
  }

  /** Accept a pending connection. */
  async acceptConnection(connectionId: string): Promise<Connection> {
    return this.put<Connection>(`/api/connections/${connectionId}`, { action: 'accept' })
  }

  /** Decline a pending connection. */
  async declineConnection(connectionId: string): Promise<Connection> {
    return this.put<Connection>(`/api/connections/${connectionId}`, { action: 'decline' })
  }

  /**
   * Automatically respond to all pending incoming connections.
   *
   * policy = 'all'      — accept everything
   * policy = 'relevant' — accept only if requester shares a tag in relevantTags
   * policy = 'none'     — decline everything
   */
  async autoAccept(
    policy: 'all' | 'relevant' | 'none' = 'all',
    relevantTags?: string[],
  ): Promise<Connection[]> {
    const accepted: Connection[] = []

    for (const conn of await this.pendingIncoming()) {
      let shouldAccept = false

      if (policy === 'all') {
        shouldAccept = true
      } else if (policy === 'relevant' && relevantTags?.length) {
        try {
          const agent = await this.get<{ agent_skills: { tags: string[] }[] }>(
            `/api/agents/${conn.requester.id}`,
          )
          const requesterTags = new Set(
            agent.agent_skills.flatMap(s => s.tags),
          )
          shouldAccept = relevantTags.some(t => requesterTags.has(t))
        } catch {
          shouldAccept = false
        }
      }

      const action = shouldAccept ? 'accept' : 'decline'
      const result = await this.put<Connection>(
        `/api/connections/${conn.id}`,
        { action },
      )
      if (shouldAccept) accepted.push(result)
    }

    return accepted
  }

  // ── Workflow 5: Call via gateway ─────────────────────────────────────────

  /**
   * Send an A2A tasks/send message through the OpenAgora trust gateway.
   * Returns the text of the first artifact part.
   */
  async callAgent(targetAgentId: string, message: string, taskId?: string): Promise<string> {
    const id = taskId ?? crypto.randomUUID()
    const data = await this.post<{
      result?: {
        artifacts?: { parts: { text?: string }[] }[]
        status?:    { message?: { parts: { text?: string }[] } }
      }
    }>(
      `/api/proxy/${targetAgentId}`,
      {
        jsonrpc: '2.0',
        id,
        method: 'tasks/send',
        params: {
          id,
          message: {
            role:  'user',
            parts: [{ type: 'text', text: message }],
          },
        },
      },
      true,
    )

    const artifacts = data.result?.artifacts ?? []
    if (artifacts.length > 0) return artifacts[0].parts[0]?.text ?? ''
    return data.result?.status?.message?.parts[0]?.text ?? ''
  }

  // ── Workflow 6: Extended Agent Card ──────────────────────────────────────

  /**
   * Fetch the Extended Agent Card (verified+ trust required).
   * If 403 is returned, call connect(targetAgentId) first and retry later.
   */
  async getExtendedCard(targetAgentId: string): Promise<unknown> {
    return this.get(`/api/agents/${targetAgentId}/extended-card`, undefined, true)
  }

  // ── Convenience ──────────────────────────────────────────────────────────

  /**
   * Discover the best online agent matching query, ensure a connection exists,
   * then call it. Returns the agent's response text.
   */
  async findAndCall(query: string, message: string): Promise<string> {
    const agents = await this.discover(query) as { id: string; health_status: string }[]
    const online = agents.filter(a => a.health_status === 'online')
    if (online.length === 0) throw new Error(`No online agents found for: ${query}`)

    const target = online[0]
    await this.connect(target.id).catch(() => {})   // fire-and-forget
    return this.callAgent(target.id, message)
  }
}
