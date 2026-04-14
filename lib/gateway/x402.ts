import { HTTPFacilitatorClient } from '@x402/core/http'
import {
  decodePaymentRequiredHeader,
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
 * Verify a payment signature against payment requirements.
 * Returns whether the signature is valid and the payer address.
 */
export async function verifyPayment(
  paymentSignatureHeader: string,
  paymentRequiredHeader: string,
): Promise<PaymentVerifyResult> {
  try {
    const client = getClient()
    const payload = decodePaymentSignatureHeader(paymentSignatureHeader)
    const required = decodePaymentRequiredHeader(paymentRequiredHeader)

    // Match the first accepted payment option
    const requirements = required.accepts?.[0]
    if (!requirements) {
      return { isValid: false, invalidReason: 'No payment requirements in PAYMENT-REQUIRED header' }
    }

    const result = await client.verify(payload, requirements)
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
 * Returns the transaction hash and network.
 */
export async function settlePayment(
  paymentSignatureHeader: string,
  paymentRequiredHeader: string,
): Promise<PaymentSettleResult> {
  try {
    const client = getClient()
    const payload = decodePaymentSignatureHeader(paymentSignatureHeader)
    const required = decodePaymentRequiredHeader(paymentRequiredHeader)

    const requirements = required.accepts?.[0]
    if (!requirements) {
      return { success: false, transaction: '', network: '', errorReason: 'No payment requirements' }
    }

    const result = await client.settle(payload, requirements)
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
