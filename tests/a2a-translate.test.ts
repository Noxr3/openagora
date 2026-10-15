import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  generationFromVersion,
  generationOf,
  operationOf,
  readAgentCard,
  readState,
  slugFromName,
  taskStateIn,
  translateRequest,
  translateResponse,
  writeState,
} from '../lib/a2a/translate.ts'

let counter = 0
const newId = () => `gen-${++counter}`

// Real A2A 1.0 JSON, produced with @a2a-js/sdk 1.1 (the SDK Dokki's door runs on)
// from the shapes lib/agent/api/a2a.ts builds.
const DOKKI_SEND_COMPLETED = {
  jsonrpc: '2.0',
  id: 7,
  result: {
    task: {
      id: 'task-123',
      contextId: 'ctx-9',
      status: {
        state: 'TASK_STATE_COMPLETED',
        message: {
          messageId: 'm-agent-1', contextId: 'ctx-9', taskId: 'task-123', role: 'ROLE_AGENT',
          parts: [{ text: 'Hello from Dokki' }], metadata: {},
        },
        timestamp: '2026-10-16T00:00:00.000Z',
      },
      artifacts: [{ artifactId: 'reply', name: 'reply', parts: [{ text: 'Hello from Dokki' }] }],
      metadata: { dokki_response_id: 'run-1' },
    },
  },
}

const DOKKI_GET_WORKING = {
  jsonrpc: '2.0',
  id: 'poll-1',
  result: {
    id: 'task-456',
    contextId: 'ctx-9',
    status: {
      state: 'TASK_STATE_WORKING',
      message: {
        messageId: 'm-agent-1', contextId: 'ctx-9', taskId: 'task-456', role: 'ROLE_AGENT',
        parts: [{ text: 'Still working. Call GetTask (or SubscribeToTask) for the reply.' }], metadata: {},
      },
      timestamp: '2026-10-16T00:00:00.000Z',
    },
    metadata: {},
  },
}

const DOKKI_CARD = {
  name: 'Research Aide',
  description: 'Research Aide, a Dokki Agent answering from the materials its owner shared.',
  supportedInterfaces: [{ url: 'https://dokki.one/api/agent-api/a2a/0b6c2f1e-1111-4222-8333-944455556666', protocolBinding: 'JSONRPC', protocolVersion: '1.0' }],
  provider: { url: 'https://dokki.one', organization: 'Dokki' },
  version: '1',
  capabilities: { streaming: true, pushNotifications: false, extendedAgentCard: false },
  securitySchemes: { dokki_agent_key: { httpAuthSecurityScheme: { scheme: 'bearer', bearerFormat: 'dka_ Agent API key' } } },
  securityRequirements: [{ schemes: { dokki_agent_key: {} } }],
  defaultInputModes: ['text/plain'],
  defaultOutputModes: ['text/plain'],
  skills: [{ id: 'conversation', name: 'Research Aide', description: 'Answers questions', tags: ['dokki', 'public'] }],
}

// ─── Detection ─────────────────────────────────────────────────────────────

test('generationOf reads the method, then the A2A-Version header', () => {
  assert.equal(generationOf('tasks/send', null), 'legacy')
  assert.equal(generationOf('tasks/sendSubscribe', null), 'legacy')
  assert.equal(generationOf('message/send', null), 'v03')
  assert.equal(generationOf('tasks/get', null), 'v03')
  assert.equal(generationOf('tasks/get', '1.0'), 'v10')
  assert.equal(generationOf('SendMessage', null), 'v10')
  assert.equal(generationOf('GetTask', '0.3'), 'v10')
})

test('operationOf groups the three generations', () => {
  assert.equal(operationOf('tasks/send'), 'send')
  assert.equal(operationOf('message/send'), 'send')
  assert.equal(operationOf('SendMessage'), 'send')
  assert.equal(operationOf('GetTask'), 'get')
  assert.equal(operationOf('tasks/cancel'), 'cancel')
  assert.equal(operationOf('message/stream'), 'stream')
  assert.equal(operationOf('ListTasks'), 'other')
})

test('generationFromVersion accepts what people and cards write', () => {
  assert.equal(generationFromVersion('1.0'), 'v10')
  assert.equal(generationFromVersion('1'), 'v10')
  assert.equal(generationFromVersion('0.3.0'), 'v03')
  assert.equal(generationFromVersion('0.2.5'), 'v03')
  assert.equal(generationFromVersion('legacy'), 'legacy')
  assert.equal(generationFromVersion('0.1'), 'legacy')
  assert.equal(generationFromVersion('banana'), null)
  assert.equal(generationFromVersion(undefined), null)
})

test('states map both ways, legacy gets the nearest state it knows', () => {
  assert.equal(readState('TASK_STATE_INPUT_REQUIRED'), 'input-required')
  assert.equal(readState('TASK_STATE_CANCELLED'), 'canceled')
  assert.equal(readState('TASK_STATE_UNSPECIFIED'), 'unknown')
  assert.equal(readState('working'), 'working')
  assert.equal(readState('nonsense'), 'unknown')
  assert.equal(writeState('v10', 'auth-required'), 'TASK_STATE_AUTH_REQUIRED')
  assert.equal(writeState('v03', 'rejected'), 'rejected')
  assert.equal(writeState('legacy', 'rejected'), 'failed')
  assert.equal(writeState('legacy', 'auth-required'), 'input-required')
})

// ─── Requests ──────────────────────────────────────────────────────────────

test('0.3 message/send → 1.0 SendMessage', () => {
  const out = translateRequest(
    {
      jsonrpc: '2.0', id: 1, method: 'message/send',
      params: {
        message: {
          kind: 'message', messageId: 'm1', role: 'user', contextId: 'c1',
          parts: [
            { kind: 'text', text: 'Summarise this' },
            { kind: 'file', file: { uri: 'https://example.com/a.pdf', mimeType: 'application/pdf', name: 'a.pdf' } },
            { kind: 'data', data: { k: 1 } },
          ],
        },
        configuration: { blocking: false, historyLength: 2 },
      },
    },
    'v03', 'v10', { newId },
  )
  assert.equal(out.ok, true)
  if (!out.ok) return
  assert.equal(out.op, 'send')
  assert.deepEqual(out.body, {
    jsonrpc: '2.0', id: 1, method: 'SendMessage',
    params: {
      message: {
        role: 'ROLE_USER',
        parts: [
          { text: 'Summarise this' },
          { url: 'https://example.com/a.pdf', mediaType: 'application/pdf', filename: 'a.pdf' },
          { data: { k: 1 } },
        ],
        messageId: 'm1',
        contextId: 'c1',
      },
      configuration: { returnImmediately: true, historyLength: 2 },
    },
  })
})

test('legacy tasks/send → 1.0 SendMessage starts a task and keeps the caller ids for the answer', () => {
  const out = translateRequest(
    {
      jsonrpc: '2.0', id: 'r1', method: 'tasks/send',
      params: { id: 'my-task', sessionId: 'my-session', message: { role: 'user', parts: [{ type: 'text', text: 'hi' }] } },
    },
    'legacy', 'v10', { newId: () => 'msg-x' },
  )
  assert.equal(out.ok, true)
  if (!out.ok) return
  assert.equal(out.callerTaskId, 'my-task')
  assert.equal(out.callerContextId, 'my-session')
  assert.deepEqual(out.body, {
    jsonrpc: '2.0', id: 'r1', method: 'SendMessage',
    params: {
      message: { role: 'ROLE_USER', parts: [{ text: 'hi' }], messageId: 'msg-x', contextId: 'my-session' },
      configuration: { returnImmediately: false },
    },
  })
})

test('legacy tasks/send for a task the relay has seen continues the target task', () => {
  const out = translateRequest(
    { jsonrpc: '2.0', id: 2, method: 'tasks/send', params: { id: 'my-task', message: { role: 'user', parts: [{ type: 'text', text: 'yes' }] } } },
    'legacy', 'v03', { newId: () => 'm', knownTaskId: 'target-task-9' },
  )
  assert.equal(out.ok, true)
  if (!out.ok) return
  const message = (out.body.params as { message: Record<string, unknown> }).message
  assert.equal(message.taskId, 'target-task-9')
  assert.equal(message.kind, 'message')
  assert.deepEqual((out.body.params as { configuration: unknown }).configuration, { blocking: true })
})

test('1.0 SendMessage → legacy tasks/send makes the ids a legacy agent needs', () => {
  const out = translateRequest(
    { jsonrpc: '2.0', id: 3, method: 'SendMessage', params: { message: { messageId: 'm', role: 'ROLE_USER', contextId: 'ctx', parts: [{ text: 'hello' }] } } },
    'v10', 'legacy', { newId: () => 'new-task' },
  )
  assert.equal(out.ok, true)
  if (!out.ok) return
  assert.deepEqual(out.body, {
    jsonrpc: '2.0', id: 3, method: 'tasks/send',
    params: { id: 'new-task', sessionId: 'ctx', message: { role: 'user', parts: [{ type: 'text', text: 'hello' }] } },
  })
})

test('1.0 SendMessage without returnImmediately waits on a 0.3 agent too', () => {
  const out = translateRequest(
    { jsonrpc: '2.0', id: 4, method: 'SendMessage', params: { message: { messageId: 'm', role: 'ROLE_USER', parts: [{ raw: 'aGk=', mediaType: 'text/plain' }] } } },
    'v10', 'v03', { newId },
  )
  assert.equal(out.ok, true)
  if (!out.ok) return
  const params = out.body.params as { message: { parts: unknown[] }; configuration: unknown }
  assert.deepEqual(params.configuration, { blocking: true })
  assert.deepEqual(params.message.parts, [{ kind: 'file', file: { bytes: 'aGk=', mimeType: 'text/plain' } }])
})

test('get and cancel carry the task id; a legacy caller is mapped to the target id', () => {
  const get = translateRequest({ jsonrpc: '2.0', id: 5, method: 'tasks/get', params: { id: 'my-task', historyLength: 0 } }, 'legacy', 'v10', { newId, knownTaskId: 't-9' })
  assert.deepEqual(get.ok && get.body, { jsonrpc: '2.0', id: 5, method: 'GetTask', params: { id: 't-9', historyLength: 0 } })
  assert.equal(get.ok && get.callerTaskId, 'my-task')

  const cancel = translateRequest({ jsonrpc: '2.0', id: 6, method: 'CancelTask', params: { id: 't-1' } }, 'v10', 'v03', { newId })
  assert.deepEqual(cancel.ok && cancel.body, { jsonrpc: '2.0', id: 6, method: 'tasks/cancel', params: { id: 't-1' } })

  const rcName = translateRequest({ jsonrpc: '2.0', id: 7, method: 'GetTask', params: { name: 'tasks/t-2' } }, 'v10', 'v03', { newId })
  assert.deepEqual(rcName.ok && rcName.body.params, { id: 't-2' })
})

test('what cannot cross generations is refused with a JSON-RPC error that says what to do', () => {
  const stream = translateRequest({ jsonrpc: '2.0', id: 8, method: 'message/stream', params: {} }, 'v03', 'v10', { newId })
  assert.equal(stream.ok, false)
  if (stream.ok) return
  assert.equal(stream.error.code, -32004)
  assert.match(stream.error.message, /message\/send.*tasks\/get/)

  const noMessage = translateRequest({ jsonrpc: '2.0', id: 9, method: 'message/send', params: {} }, 'v03', 'v10', { newId })
  assert.equal(noMessage.ok === false && noMessage.error.code, -32602)

  const noId = translateRequest({ jsonrpc: '2.0', id: 10, method: 'tasks/get', params: {} }, 'v03', 'v10', { newId })
  assert.equal(noId.ok === false && noId.error.code, -32602)
})

// ─── Responses ─────────────────────────────────────────────────────────────

test("Dokki's finished SendMessage answer, read by a 0.3 caller", () => {
  const out = translateResponse(DOKKI_SEND_COMPLETED, 'send', 'v10', 'v03')
  assert.equal(out.task?.state, 'completed')
  assert.deepEqual(out.body, {
    jsonrpc: '2.0', id: 7,
    result: {
      kind: 'task',
      id: 'task-123',
      contextId: 'ctx-9',
      status: {
        state: 'completed',
        message: { kind: 'message', role: 'agent', parts: [{ kind: 'text', text: 'Hello from Dokki' }], messageId: 'm-agent-1', contextId: 'ctx-9', taskId: 'task-123' },
        timestamp: '2026-10-16T00:00:00.000Z',
      },
      artifacts: [{ artifactId: 'reply', name: 'reply', parts: [{ kind: 'text', text: 'Hello from Dokki' }] }],
      metadata: { dokki_response_id: 'run-1' },
    },
  })
})

test("Dokki's finished answer, read by a legacy caller under its own ids", () => {
  const out = translateResponse(DOKKI_SEND_COMPLETED, 'send', 'v10', 'legacy', { callerTaskId: 'my-task', callerContextId: 'my-session' })
  const result = (out.body as { result: Record<string, unknown> }).result
  assert.equal(result.id, 'my-task')
  assert.equal(result.sessionId, 'my-session')
  assert.equal((result.status as { state: string }).state, 'completed')
  assert.deepEqual(result.artifacts, [{ name: 'reply', parts: [{ type: 'text', text: 'Hello from Dokki' }], index: 0 }])
  // The relay records the alias from the neutral task, which keeps the target id.
  assert.equal(out.task?.id, 'task-123')
})

test('a long Dokki turn comes back WORKING; the caller polls and sees a non-terminal state', () => {
  const out = translateResponse(DOKKI_GET_WORKING, 'get', 'v10', 'v03')
  assert.equal(out.task?.state, 'working')
  const result = (out.body as { result: { status: { state: string } } }).result
  assert.equal(result.status.state, 'working')
  assert.equal(taskStateIn(DOKKI_GET_WORKING), 'working')
  assert.equal(taskStateIn(DOKKI_SEND_COMPLETED), 'completed')
})

test('a 0.3 answer is wrapped as { task } for a 1.0 caller', () => {
  const out = translateResponse(
    { jsonrpc: '2.0', id: 1, result: { kind: 'task', id: 't', contextId: 'c', status: { state: 'input-required', message: { kind: 'message', role: 'agent', messageId: 'a', parts: [{ kind: 'text', text: 'Which city?' }] } } } },
    'send', 'v03', 'v10',
  )
  assert.deepEqual(out.body, {
    jsonrpc: '2.0', id: 1,
    result: {
      task: {
        id: 't', contextId: 'c',
        status: { state: 'TASK_STATE_INPUT_REQUIRED', message: { role: 'ROLE_AGENT', parts: [{ text: 'Which city?' }], messageId: 'a' } },
      },
    },
  })
})

test('a message answer becomes { message } for 1.0, a finished task for legacy', () => {
  const v10Message = { jsonrpc: '2.0', id: 2, result: { message: { messageId: 'a', role: 'ROLE_AGENT', parts: [{ text: 'Done.' }] } } }
  assert.deepEqual(translateResponse(v10Message, 'send', 'v10', 'v03').body, {
    jsonrpc: '2.0', id: 2, result: { kind: 'message', role: 'agent', parts: [{ kind: 'text', text: 'Done.' }], messageId: 'a' },
  })
  const legacy = translateResponse(v10Message, 'send', 'v10', 'legacy', { callerTaskId: 'mine', now: () => 'T' })
  assert.deepEqual(legacy.body, {
    jsonrpc: '2.0', id: 2,
    result: {
      id: 'mine',
      status: { state: 'completed', message: { role: 'agent', parts: [{ type: 'text', text: 'Done.' }] }, timestamp: 'T' },
      artifacts: [{ name: 'result', parts: [{ type: 'text', text: 'Done.' }], index: 0 }],
    },
  })
})

test('errors and shapes the relay does not know pass unchanged', () => {
  const error = { jsonrpc: '2.0', id: 3, error: { code: -32001, message: 'Task not found' } }
  assert.equal(translateResponse(error, 'get', 'v10', 'v03').body, error)
  const odd = { jsonrpc: '2.0', id: 4, result: { hello: 'world' } }
  assert.equal(translateResponse(odd, 'send', 'v10', 'v03').body, odd)
  assert.equal(translateResponse('not json-rpc', 'send', 'v10', 'v03').body, 'not json-rpc')
})

// ─── Cards ─────────────────────────────────────────────────────────────────

test("a Dokki Agent's 1.0 card fills a LinkAgora profile", () => {
  const facts = readAgentCard(DOKKI_CARD)
  assert.ok(facts)
  assert.equal(facts.name, 'Research Aide')
  assert.equal(facts.url, 'https://dokki.one/api/agent-api/a2a/0b6c2f1e-1111-4222-8333-944455556666')
  assert.equal(facts.generation, 'v10')
  assert.equal(facts.provider, 'Dokki')
  assert.equal(facts.requiresAuth, true)
  assert.deepEqual(facts.capabilities, ['streaming'])
  assert.deepEqual(facts.skills, [{ name: 'Research Aide', description: 'Answers questions', tags: ['dokki', 'public'] }])
})

test('0.3 and older cards', () => {
  const v03 = readAgentCard({
    name: 'Weather', url: 'https://w.example/a2a', protocolVersion: '0.3.0', preferredTransport: 'JSONRPC',
    skills: [{ id: 'forecast', name: 'Forecast' }], security: [{ apiKey: [] }],
  })
  assert.equal(v03?.generation, 'v03')
  assert.equal(v03?.url, 'https://w.example/a2a')
  assert.equal(v03?.requiresAuth, true)

  const grpcFirst = readAgentCard({
    name: 'G', url: 'https://g.example/grpc', protocolVersion: '0.3.0', preferredTransport: 'GRPC',
    additionalInterfaces: [{ url: 'https://g.example/jsonrpc', transport: 'JSONRPC' }],
  })
  assert.equal(grpcFirst?.url, 'https://g.example/jsonrpc')

  const old = readAgentCard({ name: 'Old', url: 'https://old.example/', capabilities: { streaming: false } })
  assert.equal(old?.generation, null)
  assert.equal(old?.requiresAuth, false)

  assert.equal(readAgentCard({ description: 'no name' }), null)
  assert.equal(readAgentCard([1, 2]), null)
})

test('slugFromName', () => {
  assert.equal(slugFromName('Research Aide'), 'research-aide')
  assert.equal(slugFromName('  Café Bot 2.0! '), 'cafe-bot-2-0')
  assert.equal(slugFromName('研究助手'), null)
  assert.equal(slugFromName('ab'), null)
})
