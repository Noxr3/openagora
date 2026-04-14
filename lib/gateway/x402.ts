import { HTTPFacilitatorClient } from '@x402/core/http'
import {
  decodePaymentSignatureHeader,
  encodePaymentResponseHeader,
} from '@x402/core/http'
import { createFacilitatorConfig } from '@coinbase/x402'

// ─── Facilitator client (Coinbase CDP) ───────────────────────────────────────

let _client: HTTPFacilitatorClient | null = null

function getClient(): HTTPFacilitatorClient {
  if (!_client) {
    const config = createFacilitatorConfig(
      process.env.CDP_API_KEY_ID,
      process.env.CDP_API_KEY_SECRET,
    )
    _client = new HTTPFacilitatorClient(config)
  }
  return _client
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface PaymentVerifyResult {
  isValid: boolean
  invalidReason?: string
  payer?: string
}

export interface PaymentSettleResult {
  success: boolean
  transaction: string
  network: string
  payer?: string
  errorReason?: string
}

/**
 * Verify a payment signature. Uses the `accepted` requirements embedded
 * in the signature payload itself — not a separately constructed requirements
 * object — so there's no mismatch between what the caller signed and what
 * we verify against.
 */
export async function verifyPayment(
  paymentSignatureHeader: string,
): Promise<PaymentVerifyResult> {
  try {
    const client = getClient()
    const payload = decodePaymentSignatureHeader(paymentSignatureHeader)

    // The payload contains `accepted` — the requirements the caller agreed to
    if (!payload.accepted) {
      return { isValid: false, invalidReason: 'Payment payload missing "accepted" requirements' }
    }

    const result = await client.verify(payload, payload.accepted)
    return {
      isValid: result.isValid,
      invalidReason: result.invalidReason,
      payer: result.payer,
    }
  } catch (err) {
    return {
      isValid: false,
      invalidReason: `Verification error: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

/**
 * Settle a verified payment on-chain via Coinbase facilitator.
 * Uses `payload.accepted` as the requirements — same as verify.
 */
export async function settlePayment(
  paymentSignatureHeader: string,
): Promise<PaymentSettleResult> {
  try {
    const client = getClient()
    const payload = decodePaymentSignatureHeader(paymentSignatureHeader)

    if (!payload.accepted) {
      return { success: false, transaction: '', network: '', errorReason: 'Payment payload missing "accepted" requirements' }
    }

    const result = await client.settle(payload, payload.accepted)
    return {
      success: result.success,
      transaction: result.transaction,
      network: result.network,
      payer: result.payer,
      errorReason: result.errorReason,
    }
  } catch (err) {
    return {
      success: false,
      transaction: '',
      network: '',
      errorReason: `Settlement error: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

/**
 * Extract payment details from a PAYMENT-SIGNATURE header for logging.
 */
export function extractPaymentDetails(paymentSignatureHeader: string): {
  network: string; asset: string; amount: string; payTo: string
} {
  try {
    const payload = decodePaymentSignatureHeader(paymentSignatureHeader)
    const a = payload.accepted
    return {
      network: a?.network ?? 'unknown',
      asset:   a?.asset ?? 'unknown',
      amount:  a?.amount ?? '0',
      payTo:   a?.payTo ?? '',
    }
  } catch {
    return { network: 'unknown', asset: 'unknown', amount: '0', payTo: '' }
  }
}

/**
 * Encode a settlement result into a PAYMENT-RESPONSE header value.
 */
export function encodeSettlementHeader(result: PaymentSettleResult): string {
  return encodePaymentResponseHeader({
    success: result.success,
    transaction: result.transaction,
    network: result.network as `${string}:${string}`,
    payer: result.payer,
    errorReason: result.errorReason,
  })
}
