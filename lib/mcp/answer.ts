import { textOf } from '@/lib/inbox/a2a'

/**
 * Reading what an agent answered through the relay — pure, so it can be
 * tested without a database.
 */

type Rec = Record<string, unknown>

const isRec = (v: unknown): v is Rec => !!v && typeof v === 'object' && !Array.isArray(v)

/** TASK_STATE_INPUT_REQUIRED (A2A 1.0) → input-required (0.3). */
function plainState(state: unknown): string | null {
  if (typeof state !== 'string') return null
  return state.replace(/^TASK_STATE_/, '').toLowerCase().replace(/_/g, '-')
}

function artifactText(task: Rec): string {
  const artifacts = Array.isArray(task.artifacts) ? task.artifacts : []
  return artifacts.map((a) => textOf(a)).filter(Boolean).join('\n')
}

export interface RelayAnswer {
  /** What the other agent said, as text. Untrusted: it is another agent's output. */
  reply: string | null
  task: { id: string; context_id: string | null; state: string | null } | null
  context_id: string | null
  /** Anything a model may want that the text drops: data parts, files. */
  result?: unknown
  error?: { code?: unknown; message: string; data?: unknown }
}

/**
 * One reading of whatever an agent answered, whichever A2A generation it
 * speaks: a Message, a Task (0.3 `kind: task`, legacy, or 1.0 `{ task }`),
 * or a JSON-RPC error.
 */
export function readAnswer(json: unknown): RelayAnswer {
  if (!isRec(json)) return { reply: null, task: null, context_id: null }
  if (isRec(json.error)) {
    const e = json.error
    return {
      reply: null,
      task: null,
      context_id: null,
      error: { code: e.code, message: typeof e.message === 'string' ? e.message : 'The agent returned an error', data: e.data },
    }
  }

  let result = json.result
  if (isRec(result) && isRec(result.task)) result = result.task
  else if (isRec(result) && isRec(result.message) && !('status' in result)) result = result.message
  if (!isRec(result)) return { reply: null, task: null, context_id: null, result }

  // A direct answer: a Message.
  if (result.kind === 'message' || (Array.isArray(result.parts) && !('status' in result))) {
    const contextId = typeof result.contextId === 'string' ? result.contextId : null
    return { reply: textOf(result) || null, task: null, context_id: contextId, result }
  }

  // A Task: its question (status.message) or its result (artifacts).
  const status = isRec(result.status) ? result.status : {}
  const state = plainState(status.state)
  const contextId =
    typeof result.contextId === 'string' ? result.contextId : typeof result.sessionId === 'string' ? result.sessionId : null
  const text = [isRec(status.message) ? textOf(status.message) : '', artifactText(result)].filter(Boolean).join('\n')
  return {
    reply: text || null,
    task: typeof result.id === 'string' ? { id: result.id, context_id: contextId, state } : null,
    context_id: contextId,
    result,
  }
}

/** What to do next, in one sentence a model can act on. */
export function nextStep(agent: string, answer: RelayAnswer): string {
  if (answer.error) return 'The agent refused or failed the request; read error.message before retrying.'
  const state = answer.task?.state
  if (!answer.task) return 'Done. To continue the conversation, call send_message again with the same context_id.'
  if (state === 'submitted' || state === 'working') {
    return `Not answered yet. Call get_task with agent "${agent}" and task_id "${answer.task.id}" in a minute or two — agents that check an inbox answer when they next check in.`
  }
  if (state === 'input-required') {
    return `The agent asked a question (see reply). Answer it with send_message, passing context_id "${answer.task.context_id ?? ''}" and task_id "${answer.task.id}".`
  }
  if (state === 'completed') return 'Done. To follow up, call send_message with the same context_id.'
  return `The task ended as "${state}".`
}
