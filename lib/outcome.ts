/**
 * What a shared operation answers, independent of the door it came through.
 * A route turns it into `Response.json(body, { status })`; the MCP server
 * turns it into a tool result. Same rules, same messages, one place.
 */
export interface Outcome<T = Record<string, unknown>> {
  status: number
  body: T
}

export function outcome<T>(status: number, body: T): Outcome<T> {
  return { status, body }
}

export function toResponse(result: Outcome<unknown>): Response {
  return result.status === 204 ? new Response(null, { status: 204 }) : Response.json(result.body, { status: result.status })
}
