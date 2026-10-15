/**
 * A2A across generations, for the relay.
 *
 * Agents in the wild speak three generations of A2A JSON-RPC:
 *   legacy  tasks/send, tasks/get …   `type` on parts, client-chosen task id, sessionId
 *   v0.3    message/send, tasks/get … `kind` discriminators, lowercase states
 *   v1.0    SendMessage, GetTask …    no `kind`, ROLE_* and TASK_STATE_* enums,
 *                                     a SendMessage result wrapped as { task } / { message }
 *
 * When caller and target speak different ones, the relay reads the caller's
 * request into one neutral shape, writes it in the target's generation, and
 * does the reverse with the answer. Only the three operations every
 * generation has are translated — send, get, cancel. Streaming and push
 * configuration pass only when both sides speak the same generation.
 *
 * Pure: no I/O, no imports, so it runs under `node --test` as it is. The
 * generation detection follows lib/inbox/a2a.ts on feat/pull-inbox; the two
 * should become one module once both are merged.
 */

export type A2AGeneration = 'legacy' | 'v03' | 'v10'
export type Operation = 'send' | 'get' | 'cancel' | 'stream' | 'other'

type Json = Record<string, unknown>

const SEND = new Set(['tasks/send', 'message/send', 'SendMessage'])
const GET = new Set(['tasks/get', 'GetTask'])
const CANCEL = new Set(['tasks/cancel', 'CancelTask'])
const STREAM = new Set(['tasks/sendSubscribe', 'message/stream', 'SendStreamingMessage', 'tasks/resubscribe', 'SubscribeToTask'])

export function operationOf(method: string): Operation {
  if (SEND.has(method)) return 'send'
  if (GET.has(method)) return 'get'
  if (CANCEL.has(method)) return 'cancel'
  if (STREAM.has(method)) return 'stream'
  return 'other'
}

/** Which generation a request speaks, from its method and A2A-Version header. */
export function generationOf(method: string, versionHeader: string | null): A2AGeneration {
  if (method.startsWith('tasks/send') || method === 'tasks/sendSubscribe') return 'legacy'
  if (/^[A-Z]/.test(method)) return 'v10'
  if (versionHeader && /^\s*[1-9]/.test(versionHeader)) return 'v10'
  return 'v03'
}

const METHODS: Record<'send' | 'get' | 'cancel', Record<A2AGeneration, string>> = {
  send: { legacy: 'tasks/send', v03: 'message/send', v10: 'SendMessage' },
  get: { legacy: 'tasks/get', v03: 'tasks/get', v10: 'GetTask' },
  cancel: { legacy: 'tasks/cancel', v03: 'tasks/cancel', v10: 'CancelTask' },
}

export function methodFor(op: 'send' | 'get' | 'cancel', generation: A2AGeneration): string {
  return METHODS[op][generation]
}

/** The stored agents.a2a_version value. */
export type A2AVersion = 'legacy' | '0.3' | '1.0'

/**
 * A version as people and cards write it ('1.0', '1', '0.3.0', '0.2.5',
 * 'legacy', '0.1') → generation, or null when it says nothing we know.
 */
export function generationFromVersion(version: unknown): A2AGeneration | null {
  if (typeof version !== 'string') return null
  const v = version.trim().toLowerCase()
  if (v === 'legacy' || /^0\.1(\.|$)/.test(v)) return 'legacy'
  if (/^0\.[23](\.|$)/.test(v)) return 'v03'
  if (/^[1-9](\.|$)/.test(v)) return 'v10'
  return null
}

export function versionOf(generation: A2AGeneration): A2AVersion {
  return generation === 'v10' ? '1.0' : generation === 'v03' ? '0.3' : 'legacy'
}

// ─── Neutral shapes ────────────────────────────────────────────────────────

export type TaskState =
  | 'submitted'
  | 'working'
  | 'input-required'
  | 'auth-required'
  | 'completed'
  | 'failed'
  | 'canceled'
  | 'rejected'
  | 'unknown'

const STATES = new Set<TaskState>([
  'submitted', 'working', 'input-required', 'auth-required',
  'completed', 'failed', 'canceled', 'rejected', 'unknown',
])

/** States after which nothing more will happen; anything else means poll. */
export const TERMINAL_STATES: ReadonlySet<TaskState> = new Set<TaskState>(['completed', 'failed', 'canceled', 'rejected'])

export interface NeutralPart {
  text?: string
  data?: unknown
  file?: { uri?: string; bytes?: string; mimeType?: string; name?: string }
  metadata?: Json
}

export interface NeutralMessage {
  role: 'user' | 'agent'
  parts: NeutralPart[]
  messageId?: string
  contextId?: string
  taskId?: string
  metadata?: Json
}

export interface NeutralArtifact {
  artifactId?: string
  name?: string
  description?: string
  parts: NeutralPart[]
  metadata?: Json
}

export interface NeutralTask {
  id: string
  contextId?: string
  state: TaskState
  message?: NeutralMessage
  timestamp?: string
  artifacts: NeutralArtifact[]
  history?: NeutralMessage[]
  metadata?: Json
}

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

function meta(value: unknown): Json | undefined {
  return isObject(value) && Object.keys(value).length > 0 ? value : undefined
}

// ─── Reading ───────────────────────────────────────────────────────────────

export function readPart(raw: unknown): NeutralPart | null {
  if (!isObject(raw)) return null
  const metadata = meta(raw.metadata)
  const kind = raw.kind ?? raw.type
  if (typeof raw.text === 'string' && (kind === undefined || kind === 'text')) {
    return { text: raw.text, ...(metadata ? { metadata } : {}) }
  }
  if ('data' in raw && (kind === undefined || kind === 'data')) {
    return { data: raw.data, ...(metadata ? { metadata } : {}) }
  }
  // v0.3 / legacy: { kind|type: 'file', file: { uri | bytes, mimeType, name } }
  if (isObject(raw.file)) {
    const f = raw.file
    return {
      file: {
        ...(str(f.uri) ?? str(f.url) ? { uri: str(f.uri) ?? str(f.url) } : {}),
        ...(str(f.bytes) ? { bytes: str(f.bytes) } : {}),
        ...(str(f.mimeType) ?? str(f.mediaType) ? { mimeType: str(f.mimeType) ?? str(f.mediaType) } : {}),
        ...(str(f.name) ?? str(f.filename) ? { name: str(f.name) ?? str(f.filename) } : {}),
      },
      ...(metadata ? { metadata } : {}),
    }
  }
  // v1.0: { url | raw, mediaType, filename }
  if (str(raw.url) || str(raw.raw)) {
    return {
      file: {
        ...(str(raw.url) ? { uri: str(raw.url) } : {}),
        ...(str(raw.raw) ? { bytes: str(raw.raw) } : {}),
        ...(str(raw.mediaType) ? { mimeType: str(raw.mediaType) } : {}),
        ...(str(raw.filename) ? { name: str(raw.filename) } : {}),
      },
      ...(metadata ? { metadata } : {}),
    }
  }
  return null
}

function readRole(raw: unknown): 'user' | 'agent' {
  return typeof raw === 'string' && /agent$/i.test(raw) ? 'agent' : 'user'
}

export function readState(raw: unknown): TaskState {
  if (typeof raw !== 'string') return 'unknown'
  let s = raw.trim()
  if (/^TASK_STATE_/i.test(s)) s = s.slice('TASK_STATE_'.length).replace(/_/g, '-')
  s = s.toLowerCase()
  if (s === 'cancelled') s = 'canceled'
  if (s === 'unspecified') s = 'unknown'
  return STATES.has(s as TaskState) ? (s as TaskState) : 'unknown'
}

export function readMessage(raw: unknown): NeutralMessage | null {
  if (!isObject(raw) || !Array.isArray(raw.parts)) return null
  const parts = raw.parts.map(readPart).filter((p): p is NeutralPart => p !== null)
  const metadata = meta(raw.metadata)
  return {
    role: readRole(raw.role),
    parts,
    ...(str(raw.messageId) ? { messageId: str(raw.messageId) } : {}),
    ...(str(raw.contextId) ? { contextId: str(raw.contextId) } : {}),
    ...(str(raw.taskId) ? { taskId: str(raw.taskId) } : {}),
    ...(metadata ? { metadata } : {}),
  }
}

function readArtifact(raw: unknown): NeutralArtifact | null {
  if (!isObject(raw) || !Array.isArray(raw.parts)) return null
  const metadata = meta(raw.metadata)
  return {
    ...(str(raw.artifactId) ? { artifactId: str(raw.artifactId) } : {}),
    ...(str(raw.name) ? { name: str(raw.name) } : {}),
    ...(str(raw.description) ? { description: str(raw.description) } : {}),
    parts: raw.parts.map(readPart).filter((p): p is NeutralPart => p !== null),
    ...(metadata ? { metadata } : {}),
  }
}

export function readTask(raw: unknown): NeutralTask | null {
  if (!isObject(raw) || !str(raw.id) || !isObject(raw.status)) return null
  const status = raw.status
  const message = readMessage(status.message)
  const contextId = str(raw.contextId) ?? str(raw.sessionId)
  const history = Array.isArray(raw.history)
    ? raw.history.map(readMessage).filter((m): m is NeutralMessage => m !== null)
    : undefined
  const metadata = meta(raw.metadata)
  return {
    id: str(raw.id)!,
    ...(contextId ? { contextId } : {}),
    state: readState(status.state),
    ...(message ? { message } : {}),
    ...(str(status.timestamp) ? { timestamp: str(status.timestamp) } : {}),
    artifacts: Array.isArray(raw.artifacts)
      ? raw.artifacts.map(readArtifact).filter((a): a is NeutralArtifact => a !== null)
      : [],
    ...(history && history.length > 0 ? { history } : {}),
    ...(metadata ? { metadata } : {}),
  }
}

// ─── Writing ───────────────────────────────────────────────────────────────

export function writePart(generation: A2AGeneration, part: NeutralPart): Json {
  const m = part.metadata ? { metadata: part.metadata } : {}
  if (part.text !== undefined) {
    if (generation === 'v10') return { text: part.text, ...m }
    return generation === 'v03' ? { kind: 'text', text: part.text, ...m } : { type: 'text', text: part.text, ...m }
  }
  if (part.file) {
    const f = part.file
    if (generation === 'v10') {
      return {
        ...(f.uri ? { url: f.uri } : {}),
        ...(f.bytes ? { raw: f.bytes } : {}),
        ...(f.mimeType ? { mediaType: f.mimeType } : {}),
        ...(f.name ? { filename: f.name } : {}),
        ...m,
      }
    }
    const file = {
      ...(f.uri ? { uri: f.uri } : {}),
      ...(f.bytes ? { bytes: f.bytes } : {}),
      ...(f.mimeType ? { mimeType: f.mimeType } : {}),
      ...(f.name ? { name: f.name } : {}),
    }
    return generation === 'v03' ? { kind: 'file', file, ...m } : { type: 'file', file, ...m }
  }
  if (generation === 'v10') return { data: part.data, ...m }
  return generation === 'v03' ? { kind: 'data', data: part.data, ...m } : { type: 'data', data: part.data, ...m }
}

export function writeState(generation: A2AGeneration, state: TaskState): string {
  if (generation === 'v10') {
    return state === 'unknown' ? 'TASK_STATE_UNSPECIFIED' : 'TASK_STATE_' + state.replace(/-/g, '_').toUpperCase()
  }
  if (generation === 'legacy') {
    // Legacy has neither: the nearest a legacy client knows how to act on.
    if (state === 'rejected') return 'failed'
    if (state === 'auth-required') return 'input-required'
  }
  return state
}

export function writeMessage(generation: A2AGeneration, message: NeutralMessage): Json {
  const parts = message.parts.map((p) => writePart(generation, p))
  const m = message.metadata ? { metadata: message.metadata } : {}
  if (generation === 'legacy') return { role: message.role, parts, ...m }
  return {
    ...(generation === 'v03' ? { kind: 'message' } : {}),
    role: generation === 'v10' ? (message.role === 'agent' ? 'ROLE_AGENT' : 'ROLE_USER') : message.role,
    parts,
    ...(message.messageId ? { messageId: message.messageId } : {}),
    ...(message.contextId ? { contextId: message.contextId } : {}),
    ...(message.taskId ? { taskId: message.taskId } : {}),
    ...m,
  }
}

function writeArtifact(generation: A2AGeneration, artifact: NeutralArtifact, index: number, taskId: string): Json {
  const parts = artifact.parts.map((p) => writePart(generation, p))
  const common = {
    ...(artifact.name ? { name: artifact.name } : {}),
    ...(artifact.description ? { description: artifact.description } : {}),
    parts,
    ...(artifact.metadata ? { metadata: artifact.metadata } : {}),
  }
  if (generation === 'legacy') return { ...common, index }
  return { artifactId: artifact.artifactId ?? `${taskId}-artifact-${index}`, ...common }
}

export function writeTask(generation: A2AGeneration, task: NeutralTask): Json {
  const status: Json = {
    state: writeState(generation, task.state),
    ...(task.message ? { message: writeMessage(generation, task.message) } : {}),
    ...(task.timestamp ? { timestamp: task.timestamp } : {}),
  }
  const artifacts = task.artifacts.map((a, i) => writeArtifact(generation, a, i, task.id))
  const history = task.history?.map((m) => writeMessage(generation, m))
  const m = task.metadata ? { metadata: task.metadata } : {}
  if (generation === 'legacy') {
    return {
      id: task.id,
      ...(task.contextId ? { sessionId: task.contextId } : {}),
      status,
      ...(artifacts.length > 0 ? { artifacts } : {}),
      ...(history ? { history } : {}),
      ...m,
    }
  }
  return {
    ...(generation === 'v03' ? { kind: 'task' } : {}),
    id: task.id,
    ...(task.contextId ? { contextId: task.contextId } : {}),
    status,
    ...(artifacts.length > 0 ? { artifacts } : {}),
    ...(history ? { history } : {}),
    ...m,
  }
}

// ─── Requests ──────────────────────────────────────────────────────────────

export interface RpcError {
  code: number
  message: string
}

export type TranslatedRequest =
  | {
      ok: true
      op: 'send' | 'get' | 'cancel'
      body: Json
      /** A legacy caller's own task id, which the relay maps to the target's. */
      callerTaskId?: string
      /** A legacy caller's sessionId, echoed back as it sent it. */
      callerContextId?: string
    }
  | { ok: false; error: RpcError }

export interface TranslateOptions {
  /** Makes message and task ids the target generation requires. */
  newId: () => string
  /**
   * The target's task id behind a legacy caller's own task id, when the relay
   * has seen that id before (relay_task_aliases).
   */
  knownTaskId?: string
}

/**
 * The caller's JSON-RPC request, written in the target's generation.
 * Only call it when the two differ; a same-generation request passes as is.
 */
export function translateRequest(
  request: unknown,
  from: A2AGeneration,
  to: A2AGeneration,
  options: TranslateOptions,
): TranslatedRequest {
  if (!isObject(request) || typeof request.method !== 'string') {
    return { ok: false, error: { code: -32600, message: 'Invalid Request: a JSON-RPC 2.0 object with a method is required' } }
  }
  const op = operationOf(request.method)
  if (op !== 'send' && op !== 'get' && op !== 'cancel') {
    return {
      ok: false,
      error: {
        code: -32004,
        message:
          `"${request.method}" cannot cross from A2A ${versionOf(from)} to this agent's A2A ${versionOf(to)} ` +
          `through the relay. Use ${methodFor('send', from)} and poll ${methodFor('get', from)}.`,
      },
    }
  }
  const params = isObject(request.params) ? request.params : {}
  const envelope = (p: Json) => ({ jsonrpc: '2.0', id: request.id ?? null, method: methodFor(op, to), params: p })

  if (op === 'get' || op === 'cancel') {
    // v1.0 release candidates named the task as `name: "tasks/<id>"`.
    const ownId = str(params.id) ?? str(params.name)?.replace(/^tasks\//, '')
    if (!ownId) return { ok: false, error: { code: -32602, message: 'Invalid params: params.id (the task id) is required' } }
    const id = from === 'legacy' && options.knownTaskId ? options.knownTaskId : ownId
    const historyLength = typeof params.historyLength === 'number' ? { historyLength: params.historyLength } : {}
    return {
      ok: true,
      op,
      body: envelope({ id, ...(op === 'get' ? historyLength : {}) }),
      ...(from === 'legacy' && to !== 'legacy' ? { callerTaskId: ownId } : {}),
    }
  }

  // send
  const message = readMessage(params.message)
  if (!message) {
    return { ok: false, error: { code: -32602, message: 'Invalid params: params.message with parts is required' } }
  }
  const configuration = isObject(params.configuration) ? params.configuration : {}
  const metadata = meta(params.metadata)

  // Does the caller want to wait for the answer? Legacy always waits; v0.3
  // says so with `blocking`, v1.0 with `returnImmediately` (default: wait).
  let wait: boolean | undefined
  if (from === 'legacy') wait = true
  else if (typeof configuration.blocking === 'boolean') wait = configuration.blocking
  else if (typeof configuration.returnImmediately === 'boolean') wait = !configuration.returnImmediately
  else if (from === 'v10') wait = true
  const historyLength =
    typeof configuration.historyLength === 'number'
      ? configuration.historyLength
      : typeof params.historyLength === 'number'
        ? params.historyLength
        : undefined
  const acceptedOutputModes = Array.isArray(configuration.acceptedOutputModes) ? configuration.acceptedOutputModes : undefined

  let callerTaskId: string | undefined
  let callerContextId: string | undefined
  if (from === 'legacy') {
    callerTaskId = str(params.id)
    callerContextId = str(params.sessionId)
    // A legacy id the relay has seen continues that task; a new one starts a task.
    message.taskId = options.knownTaskId
    if (callerContextId) message.contextId = callerContextId
  }

  if (to === 'legacy') {
    return {
      ok: true,
      op,
      body: envelope({
        id: message.taskId ?? options.newId(),
        sessionId: message.contextId ?? options.newId(),
        message: writeMessage('legacy', message),
        ...(historyLength !== undefined ? { historyLength } : {}),
        ...(metadata ? { metadata } : {}),
      }),
    }
  }

  const outgoing: NeutralMessage = { ...message, messageId: message.messageId ?? options.newId() }
  const config: Json = {
    ...(wait !== undefined
      ? to === 'v10'
        ? { returnImmediately: !wait }
        : { blocking: wait }
      : {}),
    ...(historyLength !== undefined ? { historyLength } : {}),
    ...(acceptedOutputModes ? { acceptedOutputModes } : {}),
  }
  return {
    ok: true,
    op,
    body: envelope({
      message: writeMessage(to, outgoing),
      ...(Object.keys(config).length > 0 ? { configuration: config } : {}),
      ...(metadata ? { metadata } : {}),
    }),
    ...(callerTaskId ? { callerTaskId } : {}),
    ...(callerContextId ? { callerContextId } : {}),
  }
}

// ─── Responses ─────────────────────────────────────────────────────────────

export interface TranslatedResponse {
  body: unknown
  /** The task in the answer, when there is one, in neutral form. */
  task?: NeutralTask
}

function readSendResult(result: unknown, from: A2AGeneration): { task?: NeutralTask; message?: NeutralMessage } {
  if (!isObject(result)) return {}
  if (from === 'v10') {
    if (isObject(result.task)) return { task: readTask(result.task) ?? undefined }
    if (isObject(result.message)) return { message: readMessage(result.message) ?? undefined }
  }
  if (result.kind === 'message') return { message: readMessage(result) ?? undefined }
  if (isObject(result.status)) return { task: readTask(result) ?? undefined }
  if (Array.isArray(result.parts)) return { message: readMessage(result) ?? undefined }
  return {}
}

/**
 * The target's JSON-RPC answer, written in the caller's generation. Errors and
 * shapes it does not recognise come back unchanged.
 */
export function translateResponse(
  response: unknown,
  op: 'send' | 'get' | 'cancel',
  from: A2AGeneration,
  to: A2AGeneration,
  context: { callerTaskId?: string; callerContextId?: string; now?: () => string } = {},
): TranslatedResponse {
  if (!isObject(response) || !('result' in response)) return { body: response }
  const result = response.result
  const envelope = (r: unknown) => ({ jsonrpc: '2.0', id: response.id ?? null, result: r })

  // A legacy caller sees the task under the ids it chose.
  const asCallerSees = (task: NeutralTask): NeutralTask =>
    to === 'legacy'
      ? {
          ...task,
          id: context.callerTaskId ?? task.id,
          ...(context.callerContextId ?? task.contextId ? { contextId: context.callerContextId ?? task.contextId } : {}),
        }
      : task

  if (op === 'get' || op === 'cancel') {
    const task = readTask(result)
    if (!task) return { body: response }
    return { body: envelope(writeTask(to, asCallerSees(task))), task }
  }

  const { task, message } = readSendResult(result, from)
  if (task) {
    const written = writeTask(to, asCallerSees(task))
    return { body: envelope(to === 'v10' ? { task: written } : written), task }
  }
  if (message) {
    if (to === 'v10') return { body: envelope({ message: writeMessage('v10', message) }) }
    if (to === 'v03') return { body: envelope(writeMessage('v03', message)) }
    // Legacy has no message result: an answer without a task is a finished task.
    const finished: NeutralTask = {
      id: context.callerTaskId ?? message.taskId ?? message.messageId ?? 'task',
      ...(context.callerContextId ?? message.contextId ? { contextId: context.callerContextId ?? message.contextId } : {}),
      state: 'completed',
      message: { ...message, role: 'agent' },
      timestamp: (context.now ?? (() => new Date().toISOString()))(),
      artifacts: [{ name: 'result', parts: message.parts }],
    }
    return { body: envelope(writeTask('legacy', finished)), task: finished }
  }
  return { body: response }
}

/** The task state in a JSON-RPC answer of any generation, or null when it holds no task. */
export function taskStateIn(response: unknown): TaskState | null {
  if (!isObject(response) || !isObject(response.result)) return null
  const result = response.result
  const task = isObject(result.task) ? result.task : result
  return isObject(task.status) ? readState(task.status.state) : null
}

// ─── Agent Cards ───────────────────────────────────────────────────────────

export interface CardFacts {
  name: string
  description: string
  /** The JSON-RPC endpoint the relay should call. */
  url: string | null
  generation: A2AGeneration | null
  provider: string | null
  skills: Array<{ name: string; description: string; tags: string[] }>
  capabilities: string[]
  securitySchemes: Json
  /** The card says calls need a credential. */
  requiresAuth: boolean
}

function nonEmptyArray(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0
}

/**
 * What a registry needs from an Agent Card of any generation, or null when
 * the document is not one. v1.0 cards list `supportedInterfaces`; v0.3 cards
 * carry `url` + `protocolVersion` (+ `additionalInterfaces`); older cards
 * only `url`, and their generation stays unknown.
 */
export function readAgentCard(card: unknown): CardFacts | null {
  if (!isObject(card) || !str(card.name)) return null

  let url: string | null = null
  let generation: A2AGeneration | null = null
  const jsonRpc = (binding: unknown) => typeof binding === 'string' && binding.toUpperCase().replace(/[-_]/g, '') === 'JSONRPC'

  if (Array.isArray(card.supportedInterfaces)) {
    const interfaces = card.supportedInterfaces.filter(isObject)
    const chosen = interfaces.find((i) => jsonRpc(i.protocolBinding) && str(i.url))
    if (chosen) {
      url = str(chosen.url) ?? null
      generation = generationFromVersion(chosen.protocolVersion) ?? 'v10'
    }
  }
  if (!url) {
    const preferred = card.preferredTransport
    if (str(card.url) && (preferred === undefined || jsonRpc(preferred))) url = str(card.url)!
    else if (Array.isArray(card.additionalInterfaces)) {
      const alt = card.additionalInterfaces.filter(isObject).find((i) => jsonRpc(i.transport) && str(i.url))
      url = alt ? str(alt.url)! : str(card.url) ?? null
    } else url = str(card.url) ?? null
    generation = generation ?? generationFromVersion(card.protocolVersion)
  }

  const skills = Array.isArray(card.skills)
    ? card.skills.filter(isObject).flatMap((s) => {
        const name = str(s.name) ?? str(s.id)
        if (!name) return []
        return [{
          name: name.slice(0, 200),
          description: (str(s.description) ?? '').slice(0, 2000),
          tags: Array.isArray(s.tags) ? s.tags.filter((t): t is string => typeof t === 'string').slice(0, 20) : [],
        }]
      }).slice(0, 50)
    : []

  const capabilities = isObject(card.capabilities)
    ? Object.entries(card.capabilities).filter(([, on]) => on === true).map(([k]) => k)
    : []

  const authentication = isObject(card.authentication) ? card.authentication : {}
  const requiresAuth =
    nonEmptyArray(card.securityRequirements) || nonEmptyArray(card.security) || nonEmptyArray(authentication.schemes)

  return {
    name: str(card.name)!.slice(0, 200),
    description: (str(card.description) ?? '').slice(0, 5000),
    url,
    generation,
    provider: isObject(card.provider) ? str(card.provider.organization) ?? null : null,
    skills,
    capabilities,
    securitySchemes: isObject(card.securitySchemes) ? card.securitySchemes : {},
    requiresAuth,
  }
}

/** A registry slug from a display name: 3–50 of [a-z0-9-], or null. */
export function slugFromName(name: string): string | null {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/, '')
  return /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(slug) ? slug : null
}
