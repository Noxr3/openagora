import { supabaseAdmin } from '@/lib/supabase/admin'
import { openCredential, originOf, parseCredentialsKey, sealCredential } from './credential-seal'

/**
 * Outbound credentials: the key an agent wants on every call it receives
 * (agent_outbound_credentials, migration 017). Set, replaced and removed only
 * by the agent's own key or its signed-in owner (canManageAgent); read only by
 * the relay. No function here returns the value to anything but the relay.
 */

export class CredentialsUnavailableError extends Error {
  constructor() {
    super('This LinkAgora server has no RELAY_CREDENTIALS_KEY, so it cannot hold agent credentials.')
    this.name = 'CredentialsUnavailableError'
  }
}

function serverKey(): Buffer | null {
  return parseCredentialsKey(process.env.RELAY_CREDENTIALS_KEY)
}

export function credentialsAvailable(): boolean {
  return serverKey() !== null
}

export interface CredentialStatus {
  configured: boolean
  header?: string
  /** The origin the credential is pinned to. */
  origin?: string
  updated_at?: string
}

export async function setOutboundCredential(
  agentId: string,
  agentUrl: string,
  header: string,
  value: string,
): Promise<CredentialStatus> {
  const key = serverKey()
  if (!key) throw new CredentialsUnavailableError()
  const origin = originOf(agentUrl)
  if (!origin) throw new Error('The agent has no http(s) endpoint to pin the credential to')
  const updatedAt = new Date().toISOString()
  const { error } = await supabaseAdmin.from('agent_outbound_credentials').upsert({
    agent_id: agentId,
    header_name: header,
    origin,
    sealed: sealCredential(key, agentId, header, value),
    updated_at: updatedAt,
  })
  if (error) throw new Error(error.message)
  return { configured: true, header, origin, updated_at: updatedAt }
}

export async function removeOutboundCredential(agentId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('agent_outbound_credentials')
    .delete()
    .eq('agent_id', agentId)
    .select('agent_id')
  if (error) throw new Error(error.message)
  return (data?.length ?? 0) > 0
}

/** Whether a credential is set, for whom may manage the agent — never its value. */
export async function describeOutboundCredential(agentId: string): Promise<CredentialStatus> {
  const { data } = await supabaseAdmin
    .from('agent_outbound_credentials')
    .select('header_name, origin, updated_at')
    .eq('agent_id', agentId)
    .maybeSingle()
  if (!data) return { configured: false }
  return { configured: true, header: data.header_name, origin: data.origin, updated_at: data.updated_at }
}

export async function hasOutboundCredential(agentId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('agent_outbound_credentials')
    .select('agent_id')
    .eq('agent_id', agentId)
    .maybeSingle()
  return !!data
}

export type OutboundCredential =
  | { kind: 'none' }
  | { kind: 'header'; name: string; value: string }
  /** Set, but this server cannot open it (key missing or rotated). */
  | { kind: 'unusable' }

/**
 * The header the relay attaches when it calls `agentId` at `agentUrl`.
 * A credential pinned to another origin is never sent; it is deleted.
 * (The URL-change trigger normally removes it first; this is the second lock.)
 */
export async function outboundCredentialFor(agentId: string, agentUrl: string): Promise<OutboundCredential> {
  const { data } = await supabaseAdmin
    .from('agent_outbound_credentials')
    .select('header_name, origin, sealed')
    .eq('agent_id', agentId)
    .maybeSingle()
  if (!data) return { kind: 'none' }
  if (originOf(agentUrl) !== data.origin) {
    await supabaseAdmin.from('agent_outbound_credentials').delete().eq('agent_id', agentId)
    return { kind: 'none' }
  }
  const key = serverKey()
  if (!key) {
    console.error('[relay] agent', agentId, 'has an outbound credential but RELAY_CREDENTIALS_KEY is not set')
    return { kind: 'unusable' }
  }
  const value = openCredential(key, agentId, data.header_name, data.sealed)
  if (value === null) {
    console.error('[relay] outbound credential for agent', agentId, 'does not open with the current RELAY_CREDENTIALS_KEY')
    return { kind: 'unusable' }
  }
  return { kind: 'header', name: data.header_name, value }
}
