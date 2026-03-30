import { createHmac, createHash, randomBytes } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase/admin'

// ─── API Key lifecycle ─────────────────────────────────────────────────────

/** Generate a new API key. Returns plaintext (store once) and its SHA-256 hash. */
export function generateApiKey(): { key: string; hash: string } {
  const key = `oag_${randomBytes(32).toString('hex')}`
  const hash = createHash('sha256').update(key).digest('hex')
  return { key, hash }
}

/** Resolve an Authorization: Bearer <key> header → caller's agentId, or null. */
export async function resolveApiKey(
  authHeader: string | null | undefined
): Promise<{ agentId: string; keyId: string } | null> {
  if (!authHeader?.startsWith('Bearer ')) return null
  const key = authHeader.slice(7).trim()
  if (!key.startsWith('oag_')) return null

  const hash = createHash('sha256').update(key).digest('hex')

  const { data } = await supabaseAdmin
    .from('api_keys')
    .select('id, agent_id')
    .eq('key_hash', hash)
    .single()

  if (!data) return null

  // Fire-and-forget last_used_at update
  supabaseAdmin
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)
    .then(() => {})

  return { agentId: data.agent_id, keyId: data.id }
}

// ─── Gateway header signing ────────────────────────────────────────────────

/**
 * Sign the injected gateway headers so target agents can verify they came
 * from OpenAgora and were not spoofed by the caller.
 *
 * Signature = HMAC-SHA256(OPENAGORA_GATEWAY_SECRET, requestId.timestamp.callerId)
 */
export function signGatewayHeaders(
  requestId: string,
  timestamp: string,
  callerId: string
): string {
  const secret = process.env.OPENAGORA_GATEWAY_SECRET ?? 'dev-gateway-secret'
  return createHmac('sha256', secret)
    .update(`${requestId}.${timestamp}.${callerId}`)
    .digest('hex')
}
