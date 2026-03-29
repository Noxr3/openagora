import OpenAI from 'openai'
import type {
  A2AAgentCard,
  A2AJsonRpcRequest,
  A2AJsonRpcResponse,
  A2ATask,
  A2ATaskSendParams,
} from '@/lib/types/a2a'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'

// ─── LLM client ───────────────────────────────────────────────────────────────
// All providers expose an OpenAI-compatible chat completions API.
//
// Priority (first match wins):
//   1. OpenAI direct       — OPENAI_API_KEY
//   2. OpenRouter          — OPENROUTER_API_KEY
//   3. Vercel AI Gateway   — AI_GATEWAY_URL + AI_GATEWAY_TOKEN
//   4. LiteLLM proxy       — LITELLM_BASE_URL (+ optional LITELLM_API_KEY)

interface ClientConfig {
  provider: string
  baseURL?: string
  apiKey: string
  defaultHeaders?: Record<string, string>
}

function resolveClientConfig(): ClientConfig {
  const openaiKey      = process.env.OPENAI_API_KEY
  const openrouterKey  = process.env.OPENROUTER_API_KEY
  const gatewayUrl     = process.env.AI_GATEWAY_URL
  const gatewayToken   = process.env.AI_GATEWAY_TOKEN
  const litellmUrl     = process.env.LITELLM_BASE_URL
  const litellmKey     = process.env.LITELLM_API_KEY

  if (openaiKey) {
    return { provider: 'openai', apiKey: openaiKey }
  }

  if (openrouterKey) {
    return {
      provider: 'openrouter',
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: openrouterKey,
      defaultHeaders: {
        'HTTP-Referer': process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000',
        'X-Title': 'OpenAgora',
      },
    }
  }

  if (gatewayUrl) {
    return {
      provider: 'vercel-ai-gateway',
      baseURL: gatewayUrl,
      apiKey: gatewayToken ?? 'no-key',
    }
  }

  if (litellmUrl) {
    return {
      provider: 'litellm',
      baseURL: litellmUrl,
      apiKey: litellmKey ?? 'no-key',
    }
  }

  // Nothing configured — will fail at request time with a clear error
  return { provider: 'unconfigured', baseURL: 'http://localhost:4000', apiKey: 'unconfigured' }
}

function buildClient(): OpenAI {
  const { baseURL, apiKey, defaultHeaders } = resolveClientConfig()
  return new OpenAI({ baseURL, apiKey, defaultHeaders })
}

const llm = buildClient()

const MODEL = process.env.DEMO_AGENT_MODEL ?? 'gpt-4o'
const MAX_TOOL_ITERATIONS = 10

// ─── In-memory session store ──────────────────────────────────────────────────
// Maps sessionId → conversation history (system prompt excluded).
// Simple Map; resets on server restart. Replace with Redis for persistence.

type MessageHistory = OpenAI.Chat.Completions.ChatCompletionMessageParam[]

const sessionStore = new Map<string, MessageHistory>()

const SESSION_TTL_MS = 30 * 60 * 1000   // 30 min idle expiry
const sessionLastUsed = new Map<string, number>()

function getHistory(sessionId: string): MessageHistory {
  evictStale()
  return sessionStore.get(sessionId) ?? []
}

function saveHistory(sessionId: string, history: MessageHistory): void {
  sessionStore.set(sessionId, history)
  sessionLastUsed.set(sessionId, Date.now())
}

function evictStale(): void {
  const cutoff = Date.now() - SESSION_TTL_MS
  for (const [id, ts] of sessionLastUsed) {
    if (ts < cutoff) {
      sessionStore.delete(id)
      sessionLastUsed.delete(id)
    }
  }
}

const SYSTEM_PROMPT = `You are Del — OpenAgora's flagship A2A agent, running on ${BASE_URL}.

OpenAgora is an open registry and community platform for A2A-compatible agents. You can answer questions directly, or delegate to other registered agents when they can do better.

Workflow for tasks that benefit from other agents:
1. Use discover_agents to search the OpenAgora directory for relevant agents.
2. Use call_agent to send a task to a specific agent and get its response.
3. Synthesize the results into a final answer.

Keep responses clear and precise. Only call other agents when they genuinely add value.`

// ─── Tool definitions (OpenAI function-calling format) ────────────────────────

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'discover_agents',
      description:
        'Search the Pacman Place agent directory. Returns a list of registered A2A agents matching the query, including their endpoint URLs and skills.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search term — agent name, skill, or capability keyword.',
          },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'call_agent',
      description:
        'Send an A2A tasks/send request to another agent and return its reply. Use the agent URL from discover_agents.',
      parameters: {
        type: 'object',
        properties: {
          agent_url: {
            type: 'string',
            description: "The agent's A2A endpoint URL (from discover_agents results).",
          },
          message: {
            type: 'string',
            description: 'The message text to send to the agent.',
          },
        },
        required: ['agent_url', 'message'],
        additionalProperties: false,
      },
    },
  },
]

// ─── Tool implementations ─────────────────────────────────────────────────────

async function discoverAgents(query: string): Promise<string> {
  try {
    const url = new URL('/api/agents', BASE_URL)
    url.searchParams.set('q', query)
    url.searchParams.set('limit', '5')

    const res = await fetch(url.toString(), { next: { revalidate: 0 } })
    if (!res.ok) return `Directory search failed: HTTP ${res.status}`

    const data = (await res.json()) as {
      agents: Array<{
        id: string
        name: string
        url: string
        description: string
        agent_skills: Array<{ name: string }>
      }>
      total: number
    }

    if (!data.agents?.length) return `No agents found for query: "${query}"`

    const lines = data.agents.map((a) => {
      const skills = a.agent_skills?.map((s) => s.name).join(', ') || 'none'
      return `- ${a.name} | url: ${a.url} | skills: ${skills}\n  ${a.description}`
    })
    return `Found ${data.total} agent(s):\n${lines.join('\n')}`
  } catch (err) {
    return `discover_agents error: ${err instanceof Error ? err.message : String(err)}`
  }
}

async function callAgent(agentUrl: string, message: string, parentSessionId?: string): Promise<string> {
  const taskId = `demo-${Date.now()}`
  // Derive a sub-session ID so the called agent can also maintain context
  const subSessionId = parentSessionId ? `${parentSessionId}::sub-${taskId}` : taskId

  const payload = {
    jsonrpc: '2.0',
    id: taskId,
    method: 'tasks/send',
    params: {
      id: taskId,
      sessionId: subSessionId,
      message: {
        role: 'user',
        parts: [{ type: 'text', text: message }],
      },
    },
  }

  try {
    const res = await fetch(agentUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) return `Agent returned HTTP ${res.status}`

    const data = (await res.json()) as {
      result?: {
        artifacts?: Array<{ parts: Array<{ type: string; text?: string }> }>
        status?: { state: string }
      }
      error?: { message: string }
    }

    if (data.error) return `Agent error: ${data.error.message}`

    const text = data.result?.artifacts
      ?.flatMap((a) => a.parts)
      .filter((p) => p.type === 'text')
      .map((p) => p.text)
      .join('\n')
      .trim()

    if (!text) return `Agent responded but returned no text (state: ${data.result?.status?.state})`
    return text
  } catch (err) {
    return `call_agent error: ${err instanceof Error ? err.message : String(err)}`
  }
}

// ─── Agentic loop ─────────────────────────────────────────────────────────────

async function runAgentLoop(userText: string, sessionId?: string): Promise<string> {
  // Load prior history for this session (empty array if new session)
  const priorHistory = sessionId ? getHistory(sessionId) : []

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...priorHistory,                          // ← inject conversation history
    { role: 'user', content: userText },
  ]

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const completion = await llm.chat.completions.create({
      model: MODEL,
      max_tokens: 4096,
      tools: TOOLS,
      tool_choice: 'auto',
      messages,
    })

    const choice = completion.choices[0]
    const assistantMsg = choice.message

    messages.push(assistantMsg)

    // No tool calls → final answer
    if (choice.finish_reason === 'stop' || !assistantMsg.tool_calls?.length) {
      const replyText = assistantMsg.content?.trim() || '(no response)'

      // Persist this turn into session history (exclude system prompt)
      if (sessionId) {
        saveHistory(sessionId, [
          ...priorHistory,
          { role: 'user', content: userText },
          { role: 'assistant', content: replyText },
        ])
      }

      return replyText
    }

    // Execute all tool calls and collect results
    const toolResults: OpenAI.Chat.Completions.ChatCompletionToolMessageParam[] = []

    for (const toolCall of assistantMsg.tool_calls) {
      let result: string
      try {
        if (toolCall.type !== 'function') {
          result = `Unsupported tool call type: ${toolCall.type}`
        } else {
          const args = JSON.parse(toolCall.function.arguments) as Record<string, string>

          if (toolCall.function.name === 'discover_agents') {
            result = await discoverAgents(args.query)
          } else if (toolCall.function.name === 'call_agent') {
            // Pass the parent sessionId so the sub-agent can also track context
            result = await callAgent(args.agent_url, args.message, sessionId)
          } else {
            result = `Unknown tool: ${toolCall.function.name}`
          }
        }
      } catch (err) {
        result = `Tool execution error: ${err instanceof Error ? err.message : String(err)}`
      }

      toolResults.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: result,
      })
    }

    messages.push(...toolResults)
  }

  return '(reached max tool iterations without a final answer)'
}

// ─── A2A handler ──────────────────────────────────────────────────────────────

async function handleTaskSend(
  rpcId: string | number | null,
  params: A2ATaskSendParams,
): Promise<Response> {
  if (!params?.id || !params?.message) {
    return jsonRpcError(rpcId, -32602, 'Invalid params: id and message are required')
  }

  const userText = params.message.parts
    .filter((p) => p.type === 'text')
    .map((p) => p.text)
    .join('\n')
    .trim()

  if (!userText) {
    return jsonRpcError(rpcId, -32602, 'Invalid params: message must contain at least one text part')
  }

  try {
    const replyText = await runAgentLoop(userText, params.sessionId)

    const task: A2ATask = {
      id: params.id,
      sessionId: params.sessionId,
      status: { state: 'completed', timestamp: new Date().toISOString() },
      artifacts: [{ name: 'reply', parts: [{ type: 'text', text: replyText }] }],
    }

    return jsonRpcOk(rpcId, task)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return jsonRpcError(rpcId, -32603, `Internal error: ${message}`)
  }
}

// ─── Agent card ───────────────────────────────────────────────────────────────

const AGENT_CARD: A2AAgentCard = {
  name: 'Del',
  description:
    "OpenAgora's flagship A2A agent. Ask anything directly, or let Del find and call the right specialist agent for you.",
  url: `${BASE_URL}/api/demo-agent`,
  version: '1.0.0',
  provider: { organization: 'OpenAgora', url: BASE_URL },
  documentationUrl: `${BASE_URL}/agents`,
  capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: false },
  authentication: { schemes: ['none'] },
  defaultInputModes: ['text/plain', 'application/json'],
  defaultOutputModes: ['text/plain', 'application/json'],
  skills: [
    {
      id: 'general-qa',
      name: 'General Q&A',
      description: 'Answer any question, optionally delegating to specialist agents.',
      tags: ['qa', 'general', 'orchestrator'],
      examples: ['What is the A2A protocol?', 'Find me a coding agent'],
    },
    {
      id: 'agent-discovery',
      name: 'Agent Discovery',
      description: 'Search and call other registered A2A agents on OpenAgora.',
      tags: ['discovery', 'orchestrator', 'a2a'],
      examples: ['Find an agent that can summarize text', 'Ask the weather agent for Beijing'],
    },
    {
      id: 'a2a-guide',
      name: 'A2A Protocol Guide',
      description: 'Explain A2A protocol concepts and help design agent implementations.',
      tags: ['a2a', 'protocol', 'guide'],
      examples: ['How do I write an agent card?', 'What does tasks/send return?'],
    },
  ],
}

// ─── Route handlers ───────────────────────────────────────────────────────────

export async function GET() {
  return Response.json(AGENT_CARD)
}

export async function POST(request: Request) {
  let rpcId: string | number | null = null

  try {
    const body = (await request.json()) as A2AJsonRpcRequest
    rpcId = body.id ?? null

    if (body.jsonrpc !== '2.0') {
      return jsonRpcError(rpcId, -32600, 'Invalid Request: jsonrpc must be "2.0"')
    }

    switch (body.method) {
      case 'tasks/send':
        return handleTaskSend(rpcId, body.params as unknown as A2ATaskSendParams)
      case 'tasks/get':
      case 'tasks/cancel':
        return jsonRpcError(rpcId, -32001, 'Task not found: this agent is stateless')
      default:
        return jsonRpcError(rpcId, -32601, `Method not found: ${body.method}`)
    }
  } catch {
    return jsonRpcError(rpcId, -32700, 'Parse error: invalid JSON')
  }
}

// ─── JSON-RPC helpers ─────────────────────────────────────────────────────────

function jsonRpcOk(id: string | number | null, result: unknown): Response {
  const body: A2AJsonRpcResponse = { jsonrpc: '2.0', id, result }
  return Response.json(body)
}

function jsonRpcError(id: string | number | null, code: number, message: string): Response {
  const body: A2AJsonRpcResponse = { jsonrpc: '2.0', id, error: { code, message } }
  return Response.json(body, { status: code === -32700 || code === -32600 ? 400 : 200 })
}
