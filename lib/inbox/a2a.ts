/**
 * A2A shapes for agents that pull their work (delivery = 'pull').
 *
 * Callers speak three generations of A2A and expect answers in their own:
 *   legacy  tasks/send …                 — artifacts[].parts[].type, sessionId
 *   v0.3    message/send, tasks/get …    — `kind` discriminators, lowercase states
 *   v1.0    SendMessage, GetTask …       — no `kind`, TASK_STATE_* enums
 * A request with an `A2A-Version: 1.x` header is treated as v1.0 too.
 */

export type A2AGeneration = 'legacy' | 'v03' | 'v10'

export type TaskState =
  | 'submitted'
  | 'working'
  | 'input-required'
  | 'completed'
  | 'failed'
  | 'canceled'
  | 'rejected'

export const OPEN_STATES: TaskState[] = ['submitted', 'working', 'input-required']

const SEND = new Set(['tasks/send', 'message/send', 'SendMessage'])
const GET = new Set(['tasks/get', 'GetTask'])
const CANCEL = new Set(['tasks/cancel', 'CancelTask'])
const STREAM = new Set(['tasks/sendSubscribe', 'message/stream', 'SendStreamingMessage', 'tasks/resubscribe', 'SubscribeToTask'])

export type PullOperation = 'send' | 'get' | 'cancel' | 'stream' | 'other'

export function operationOf(method: string): PullOperation {
  if (SEND.has(method)) return 'send'
  if (GET.has(method)) return 'get'
  if (CANCEL.has(method)) return 'cancel'
  if (STREAM.has(method)) return 'stream'
  return 'other'
}

export function generationOf(method: string, versionHeader: string | null): A2AGeneration {
  if (method.startsWith('tasks/send') || method === 'tasks/sendSubscribe') return 'legacy'
  if (/^[A-Z]/.test(method)) return 'v10'
  if (versionHeader && /^\s*[1-9]/.test(versionHeader)) return 'v10'
  return 'v03'
}

type Part = Record<string, unknown>

/** The text of a message's parts, whatever generation wrote them. */
export function textOf(message: unknown): string {
  const parts = (message as { parts?: Part[] } | null)?.parts
  if (!Array.isArray(parts)) return ''
  return parts
    .map((p) => (typeof p.text === 'string' ? p.text : ''))
    .filter(Boolean)
    .join('\n')
}

/** Store messages in one neutral form: role + text/data parts. */
export function normalizeMessage(raw: unknown, role: 'user' | 'agent') {
  const parts = Array.isArray((raw as { parts?: unknown })?.parts) ? ((raw as { parts: Part[] }).parts) : []
  const clean = parts
    .map((p) => {
      if (typeof p.text === 'string') return { text: p.text }
      if (p.data && typeof p.data === 'object') return { data: p.data }
      const file = (p.file ?? (p.url ? { uri: p.url, mimeType: p.mediaType } : null)) as Record<string, unknown> | null
      if (file && (file.uri || file.url)) return { file: { uri: file.uri ?? file.url, mimeType: file.mimeType ?? file.mediaType } }
      return null
    })
    .filter(Boolean)
  return { role, parts: clean as Part[] }
}

export function messageFromText(text: string, role: 'user' | 'agent') {
  return { role, parts: [{ text }] }
}

function partsFor(generation: A2AGeneration, parts: Part[]): Part[] {
  return parts.map((p) => {
    if (generation === 'v10') return p
    if ('text' in p) return generation === 'legacy' ? { type: 'text', text: p.text } : { kind: 'text', text: p.text }
    if ('data' in p) return generation === 'legacy' ? { type: 'data', data: p.data } : { kind: 'data', data: p.data }
    if ('file' in p) return generation === 'legacy' ? { type: 'file', file: p.file } : { kind: 'file', file: p.file }
    return p
  })
}

function stateFor(generation: A2AGeneration, state: TaskState): string {
  if (generation !== 'v10') return state
  return 'TASK_STATE_' + state.replace('-', '_').toUpperCase()
}

export interface StoredTask {
  id: string
  context_id: string
  state: TaskState
  request: { role: string; parts: Part[] }
  response: { role: string; parts: Part[] } | null
  updated_at: string
}

/** One task, in the caller's generation. */
export function taskFor(generation: A2AGeneration, task: StoredTask) {
  const status: Record<string, unknown> = { state: stateFor(generation, task.state), timestamp: task.updated_at }
  const reply = task.response ? partsFor(generation, task.response.parts) : null
  if (reply && task.state === 'input-required') {
    status.message =
      generation === 'v10'
        ? { role: 'ROLE_AGENT', parts: reply, messageId: `${task.id}-reply` }
        : { role: 'agent', parts: reply, ...(generation === 'v03' ? { kind: 'message', messageId: `${task.id}-reply` } : {}) }
  }
  const artifacts =
    reply && task.state === 'completed'
      ? [
          generation === 'v10'
            ? { artifactId: `${task.id}-result`, name: 'result', parts: reply }
            : generation === 'v03'
              ? { artifactId: `${task.id}-result`, name: 'result', parts: reply }
              : { name: 'result', index: 0, parts: reply },
        ]
      : undefined

  if (generation === 'legacy') {
    return { id: task.id, sessionId: task.context_id, status, ...(artifacts ? { artifacts } : {}) }
  }
  return {
    ...(generation === 'v03' ? { kind: 'task' } : {}),
    id: task.id,
    contextId: task.context_id,
    status,
    ...(artifacts ? { artifacts } : {}),
  }
}

/** JSON-RPC envelopes. v1.0 wraps a SendMessage result as { task }. */
export function rpcResult(id: unknown, generation: A2AGeneration, op: PullOperation, task: unknown) {
  const result = generation === 'v10' && op === 'send' ? { task } : task
  return { jsonrpc: '2.0', id: id ?? null, result }
}

export const RPC_ERRORS = {
  taskNotFound: { code: -32001, message: 'Task not found' },
  notCancelable: { code: -32002, message: 'Task cannot be canceled' },
  unsupported: { code: -32004, message: 'This agent checks its inbox; streaming and push notifications are not available. Use message/send and poll tasks/get.' },
  invalidParams: { code: -32602, message: 'Invalid params' },
} as const

export function rpcError(id: unknown, error: { code: number; message: string }, data?: unknown) {
  return { jsonrpc: '2.0', id: id ?? null, error: data === undefined ? error : { ...error, data } }
}
