import { request as httpsRequest } from 'node:https'
import { assertFetchableUrl, guardedLookup } from '@/lib/net/public-fetch'
import { metadataCacheSeconds } from './rules'

/**
 * Fetching a Client ID Metadata Document: the client_id is a URL someone else
 * chose, so this is a request to an address an attacker picks.
 *
 * - https to a public address only — the check runs in the connection's own
 *   DNS lookup (lib/net/public-fetch.ts), so the address checked is the one
 *   connected to
 * - no redirects: the document's client_id must equal the URL it came from
 * - 8 KB at most (the draft recommends about 5), 5 seconds at most
 * - errors are never cached (draft §4.4)
 */

const MAX_BYTES = 8 * 1024
const TIMEOUT_MS = 5_000

export type FetchedDocument = { json: unknown; cacheSeconds: number }

export async function fetchClientMetadataDocument(clientId: string): Promise<FetchedDocument> {
  const url = assertFetchableUrl(clientId)
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      url,
      {
        method: 'GET',
        headers: { Accept: 'application/json', 'User-Agent': 'LinkAgora-OAuth/1.0 (+https://openagora.cc/docs/mcp)' },
        lookup: guardedLookup() as never,
      },
      (res) => {
        const status = res.statusCode ?? 0
        if (status < 200 || status >= 300) {
          res.resume()
          return reject(new Error(status >= 300 && status < 400 ? 'it redirects, and redirects are not followed' : `it answered HTTP ${status}`))
        }
        const chunks: Buffer[] = []
        let size = 0
        res.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > MAX_BYTES) {
            req.destroy(new Error(`it is larger than ${MAX_BYTES} bytes`))
            return
          }
          chunks.push(chunk)
        })
        res.on('end', () => {
          try {
            resolve({
              json: JSON.parse(Buffer.concat(chunks).toString('utf8')),
              cacheSeconds: metadataCacheSeconds(res.headers['cache-control']),
            })
          } catch {
            reject(new Error('it is not JSON'))
          }
        })
        res.on('error', reject)
      },
    )
    const timer = setTimeout(() => req.destroy(new Error(`it did not answer within ${TIMEOUT_MS / 1000} seconds`)), TIMEOUT_MS)
    req.on('close', () => clearTimeout(timer))
    req.on('error', reject)
    req.end()
  })
}
