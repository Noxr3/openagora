import { generationFromVersion, readAgentCard, versionOf, type A2AVersion, type CardFacts } from '@/lib/a2a/translate'
import { UnsafeUrlError, assertFetchableUrl, assertPublicHost, fetchPublicJson } from '@/lib/net/public-fetch'

/**
 * What a registration or update may say about how the relay talks to an
 * agent: its A2A version and how long to wait. Plus registering from an
 * Agent Card URL instead of typing the fields.
 */

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

/** a2a_version: '1.0', '0.3' or 'legacy' (also '1', '0.3.0', '0.2.5', '0.1'); null clears it. */
export function parseA2AVersion(input: unknown): Parsed<A2AVersion | null> {
  if (input === null || input === '') return { ok: true, value: null }
  const generation = generationFromVersion(input)
  if (!generation) return { ok: false, error: 'a2a_version must be "1.0", "0.3" or "legacy"' }
  return { ok: true, value: versionOf(generation) }
}

export const MAX_RELAY_TIMEOUT_SECONDS = 280

/** relay_timeout_seconds: whole seconds from 5 to 280; null = the default 30. */
export function parseRelayTimeout(input: unknown): Parsed<number | null> {
  if (input === null || input === '') return { ok: true, value: null }
  const n = typeof input === 'string' ? Number(input) : input
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 5 || n > MAX_RELAY_TIMEOUT_SECONDS) {
    return { ok: false, error: `relay_timeout_seconds must be a whole number of seconds from 5 to ${MAX_RELAY_TIMEOUT_SECONDS}` }
  }
  return { ok: true, value: n }
}

/**
 * Fetch an Agent Card from a public https URL and read what the registry
 * needs. The endpoint it names must be public https too, since the relay
 * will call it.
 */
export async function readCardFromUrl(
  cardUrl: unknown,
): Promise<{ ok: true; facts: CardFacts & { url: string }; cardUrl: string } | { ok: false; status: number; error: string }> {
  if (typeof cardUrl !== 'string' || cardUrl.trim() === '') {
    return { ok: false, status: 400, error: 'card_url must be the https URL of an A2A Agent Card' }
  }
  let fetched: { url: string; json: unknown }
  try {
    fetched = await fetchPublicJson(cardUrl.trim())
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    return err instanceof UnsafeUrlError
      ? { ok: false, status: 400, error: `card_url: ${message}` }
      : { ok: false, status: 422, error: `Could not read the Agent Card at card_url: ${message}` }
  }
  const facts = readAgentCard(fetched.json)
  if (!facts) return { ok: false, status: 422, error: 'card_url does not hold an A2A Agent Card (no name)' }
  if (!facts.url) return { ok: false, status: 422, error: 'The Agent Card names no JSON-RPC endpoint' }
  try {
    const endpoint = assertFetchableUrl(facts.url)
    await assertPublicHost(endpoint.hostname)
  } catch (err) {
    return {
      ok: false,
      status: 422,
      error: `The Agent Card's endpoint cannot be used: ${err instanceof Error ? err.message : 'unknown error'}`,
    }
  }
  return { ok: true, facts: { ...facts, url: facts.url }, cardUrl: fetched.url }
}
