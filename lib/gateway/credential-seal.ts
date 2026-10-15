import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/**
 * The credential an agent's owner gives the relay (e.g. a Dokki Agent's
 * `Bearer dka_...`) is stored sealed: AES-256-GCM under RELAY_CREDENTIALS_KEY,
 * with the agent id and header name as additional authenticated data, so a
 * sealed value copied onto another agent's row does not open.
 *
 * Pure apart from randomness; only node: builtins, so `node --test` loads it.
 */

const VERSION = 'v1'
const IV_BYTES = 12
const TAG_BYTES = 16

/**
 * RELAY_CREDENTIALS_KEY → 32-byte key, or null when unset or malformed.
 * Accepts base64 (`openssl rand -base64 32`) or hex (`openssl rand -hex 32`).
 */
export function parseCredentialsKey(raw: string | undefined | null): Buffer | null {
  const value = raw?.trim()
  if (!value) return null
  if (/^[0-9a-f]{64}$/i.test(value)) return Buffer.from(value, 'hex')
  if (/^[A-Za-z0-9+/_-]+={0,2}$/.test(value)) {
    const bytes = Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
    if (bytes.length === 32) return bytes
  }
  return null
}

function aad(agentId: string, header: string): Buffer {
  return Buffer.from(`linkagora-outbound:${agentId}:${header.toLowerCase()}`, 'utf8')
}

export function sealCredential(key: Buffer, agentId: string, header: string, value: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(aad(agentId, header))
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return `${VERSION}:${Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64')}`
}

/** The plaintext, or null when the key, agent, header or bytes do not match. */
export function openCredential(key: Buffer, agentId: string, header: string, sealed: string): string | null {
  if (!sealed.startsWith(`${VERSION}:`)) return null
  const bytes = Buffer.from(sealed.slice(VERSION.length + 1), 'base64')
  if (bytes.length < IV_BYTES + TAG_BYTES) return null
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, IV_BYTES))
    decipher.setAAD(aad(agentId, header))
    decipher.setAuthTag(bytes.subarray(IV_BYTES, IV_BYTES + TAG_BYTES))
    return Buffer.concat([decipher.update(bytes.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}

const TOKEN = /^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,64}$/

/**
 * Headers the relay sets itself or that change how the request travels; a
 * stored credential may not replace them.
 */
const RESERVED = new Set([
  'host', 'content-length', 'content-type', 'transfer-encoding', 'connection',
  'keep-alive', 'upgrade', 'te', 'trailer', 'expect', 'proxy-authorization',
  'proxy-authenticate', 'a2a-version', 'payment-signature', 'payment-response',
  'payment-required',
])

export type CredentialInputError = string

/** A header name we will store, or why not. */
export function checkHeaderName(name: unknown): { ok: true; name: string } | { ok: false; error: CredentialInputError } {
  if (typeof name !== 'string' || !TOKEN.test(name.trim())) {
    return { ok: false, error: 'header must be an HTTP header name such as Authorization or X-API-Key' }
  }
  const trimmed = name.trim()
  const lower = trimmed.toLowerCase()
  if (RESERVED.has(lower) || lower.startsWith('x-openagora-') || lower.startsWith('proxy-') || lower.startsWith('sec-')) {
    return { ok: false, error: `The relay sets ${trimmed} itself; use the header your agent reads its key from` }
  }
  return { ok: true, name: trimmed }
}

/** A header value we will store, or why not. */
export function checkHeaderValue(value: unknown): { ok: true; value: string } | { ok: false; error: CredentialInputError } {
  if (typeof value !== 'string' || value.trim() === '') return { ok: false, error: 'value is required' }
  const trimmed = value.trim()
  if (trimmed.length > 4096) return { ok: false, error: 'value is longer than 4096 characters' }
  // Header values may hold visible ASCII, spaces and tabs; no line breaks.
  if (/[^\t\x20-\x7e\x80-\xff]/.test(trimmed)) return { ok: false, error: 'value may not contain line breaks or control characters' }
  return { ok: true, value: trimmed }
}

/**
 * The body of a set-credential request → header and value. Accepts
 * `{ bearer: "dka_..." }` as a shorthand for `Authorization: Bearer dka_...`.
 */
export function credentialFromInput(input: unknown):
  | { ok: true; header: string; value: string }
  | { ok: false; error: CredentialInputError } {
  if (typeof input !== 'object' || input === null) return { ok: false, error: 'Send { "bearer": "<key>" } or { "header": "...", "value": "..." }' }
  const body = input as Record<string, unknown>
  if (body.bearer !== undefined) {
    const v = checkHeaderValue(body.bearer)
    if (!v.ok) return { ok: false, error: `bearer: ${v.error}` }
    if (/\s/.test(v.value)) return { ok: false, error: 'bearer is the key alone, without "Bearer "' }
    return { ok: true, header: 'Authorization', value: `Bearer ${v.value}` }
  }
  const h = checkHeaderName(body.header ?? 'Authorization')
  if (!h.ok) return h
  const v = checkHeaderValue(body.value)
  if (!v.ok) return v
  return { ok: true, header: h.name, value: v.value }
}

/** scheme://host[:port] of an http(s) URL, as the browser would write it; null otherwise. */
export function originOf(url: string): string | null {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.origin : null
  } catch {
    return null
  }
}
