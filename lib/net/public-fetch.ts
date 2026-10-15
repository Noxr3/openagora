import { BlockList, isIP } from 'node:net'
import { lookup as dnsLookup, type LookupAddress } from 'node:dns'
import { request as httpsRequest } from 'node:https'

/**
 * Fetching a URL someone else gave us (an Agent Card) without letting them
 * point the server at itself or its network.
 *
 * - https only, no user:pass@, standard request on a public address
 * - every address the name resolves to must be public; a name with one
 *   private record is refused whole
 * - the check runs inside the connection's own DNS lookup, so the address
 *   checked is the address connected to (no rebinding between check and use)
 * - redirects are followed by hand, each hop checked the same way
 * - one deadline for the whole fetch, and a size cap on the body
 *
 * Only node: builtins, so `node --test` loads it as it is.
 */

const BLOCKED = new BlockList()
for (const [net, prefix] of [
  ['0.0.0.0', 8],        // "this network"
  ['10.0.0.0', 8],       // private
  ['100.64.0.0', 10],    // carrier-grade NAT
  ['127.0.0.0', 8],      // loopback
  ['169.254.0.0', 16],   // link-local, cloud metadata
  ['172.16.0.0', 12],    // private
  ['192.0.0.0', 24],     // IETF protocol assignments
  ['192.0.2.0', 24],     // documentation
  ['192.88.99.0', 24],   // 6to4 relay anycast
  ['192.168.0.0', 16],   // private
  ['198.18.0.0', 15],    // benchmarking
  ['198.51.100.0', 24],  // documentation
  ['203.0.113.0', 24],   // documentation
  ['224.0.0.0', 4],      // multicast
  ['240.0.0.0', 4],      // reserved, broadcast
] as const) BLOCKED.addSubnet(net, prefix, 'ipv4')
for (const [net, prefix] of [
  ['::', 128],           // unspecified
  ['::1', 128],          // loopback
  ['100::', 64],         // discard
  ['2001:db8::', 32],    // documentation
  ['fc00::', 7],         // unique local
  ['fe80::', 10],        // link-local
  ['fec0::', 10],        // site-local (deprecated)
  ['ff00::', 8],         // multicast
] as const) BLOCKED.addSubnet(net, prefix, 'ipv6')

/** The IPv4 address an IPv6 address carries, for the forms that carry one. */
function embeddedIPv4(ip: string): string | null {
  const lower = ip.toLowerCase()
  // ::ffff:a.b.c.d (mapped), ::a.b.c.d (compatible), 64:ff9b::a.b.c.d (NAT64)
  const dotted = lower.match(/^(?:::ffff:|::|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/)
  if (dotted) return dotted[1]
  // The same in hex: ::ffff:7f00:1, 64:ff9b::7f00:1
  const hex = lower.match(/^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (hex) {
    const hi = parseInt(hex[1], 16)
    const lo = parseInt(hex[2], 16)
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`
  }
  // 6to4: 2002:AABB:CCDD::/48 carries AA.BB.CC.DD
  const sixToFour = lower.match(/^2002:([0-9a-f]{1,4}):([0-9a-f]{1,4})(?::|$)/)
  if (sixToFour) {
    const hi = parseInt(sixToFour[1], 16)
    const lo = parseInt(sixToFour[2], 16)
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`
  }
  return null
}

/** Is this IP literal an address on the public internet? */
export function isPublicAddress(ip: string): boolean {
  const bare = ip.replace(/^\[|\]$/g, '').replace(/%.*$/, '')
  const family = isIP(bare)
  if (family === 4) return !BLOCKED.check(bare, 'ipv4')
  if (family === 6) {
    if (BLOCKED.check(bare, 'ipv6')) return false
    const v4 = embeddedIPv4(bare)
    if (v4 !== null) return isIP(v4) === 4 && !BLOCKED.check(v4, 'ipv4')
    // ::ffff:0:0/96 and ::/96 forms we could not read are refused outright.
    if (/^::(ffff:)?[0-9a-f]/i.test(bare)) return false
    return true
  }
  return false
}

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsafeUrlError'
  }
}

/** A URL we may fetch: https, no credentials, and not a private IP literal. */
export function assertFetchableUrl(raw: string, base?: string): URL {
  let url: URL
  try {
    url = base ? new URL(raw, base) : new URL(raw)
  } catch {
    throw new UnsafeUrlError('Not a valid URL')
  }
  if (url.protocol !== 'https:') throw new UnsafeUrlError('Only https:// URLs are accepted')
  if (url.username || url.password) throw new UnsafeUrlError('URLs with a user name or password are not accepted')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (isIP(host) !== 0 && !isPublicAddress(host)) throw new UnsafeUrlError('That address is not on the public internet')
  if (/^localhost$|\.localhost$|\.local$|\.internal$/i.test(host)) {
    throw new UnsafeUrlError('That address is not on the public internet')
  }
  return url
}

type Resolver = (
  hostname: string,
  options: { all: true; verbatim?: boolean },
  callback: (err: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void,
) => void

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void

/**
 * A drop-in for the `lookup` option of http(s).request / net.connect that
 * refuses names resolving to any non-public address. Node may ask for one
 * address or for all of them (autoSelectFamily); both are answered.
 */
export function guardedLookup(resolve: Resolver = dnsLookup as unknown as Resolver) {
  return (hostname: string, options: { all?: boolean; family?: number } | number, callback: LookupCallback) => {
    const wantAll = typeof options === 'object' && options !== null && options.all === true
    resolve(hostname, { all: true, verbatim: true }, (err, addresses) => {
      if (err) return callback(err, wantAll ? [] : '', undefined)
      if (!addresses || addresses.length === 0) {
        const e = new UnsafeUrlError(`${hostname} did not resolve`) as unknown as NodeJS.ErrnoException
        e.code = 'ENOTFOUND'
        return callback(e, wantAll ? [] : '', undefined)
      }
      const blocked = addresses.find((a) => !isPublicAddress(a.address))
      if (blocked) {
        const e = new UnsafeUrlError(`${hostname} resolves to an address that is not on the public internet`) as unknown as NodeJS.ErrnoException
        e.code = 'EADDRNOTAVAIL'
        return callback(e, wantAll ? [] : '', undefined)
      }
      if (wantAll) return callback(null, addresses)
      callback(null, addresses[0].address, addresses[0].family)
    })
  }
}

/** Resolve a name and require every address to be public, without connecting. */
export function assertPublicHost(hostname: string, resolve?: Resolver): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, '')
  if (isIP(host) !== 0) {
    return isPublicAddress(host) ? Promise.resolve() : Promise.reject(new UnsafeUrlError('That address is not on the public internet'))
  }
  const look = guardedLookup(resolve)
  return new Promise((ok, fail) => look(host, { all: true }, (err) => (err ? fail(err) : ok())))
}

export interface PublicFetchOptions {
  /** Deadline for the whole fetch, redirects included. */
  timeoutMs?: number
  maxBytes?: number
  maxRedirects?: number
  /** Swappable for tests. */
  resolve?: Resolver
}

/**
 * GET a JSON document from a public https URL. Resolves with the final URL
 * (after redirects) and the parsed body; rejects with UnsafeUrlError for an
 * address it will not fetch, or Error for everything else.
 */
export async function fetchPublicJson(
  rawUrl: string,
  { timeoutMs = 5_000, maxBytes = 256 * 1024, maxRedirects = 3, resolve }: PublicFetchOptions = {},
): Promise<{ url: string; json: unknown }> {
  const deadline = Date.now() + timeoutMs
  const lookup = guardedLookup(resolve)
  let url = assertFetchableUrl(rawUrl)

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const left = deadline - Date.now()
    if (left <= 0) throw new Error(`Timed out after ${timeoutMs} ms`)
    const answer = await new Promise<{ status: number; location?: string; body?: string }>((ok, fail) => {
      const req = httpsRequest(
        url,
        {
          method: 'GET',
          headers: { Accept: 'application/json', 'User-Agent': 'LinkAgora-CardFetcher/1.0 (+https://openagora.cc)' },
          lookup: lookup as never,
        },
        (res) => {
          const status = res.statusCode ?? 0
          if (status >= 300 && status < 400 && res.headers.location) {
            res.resume()
            return ok({ status, location: res.headers.location })
          }
          const chunks: Buffer[] = []
          let size = 0
          res.on('data', (chunk: Buffer) => {
            size += chunk.length
            if (size > maxBytes) {
              req.destroy(new Error(`The document is larger than ${maxBytes} bytes`))
              return
            }
            chunks.push(chunk)
          })
          res.on('end', () => ok({ status, body: Buffer.concat(chunks).toString('utf8') }))
          res.on('error', fail)
        },
      )
      const timer = setTimeout(() => req.destroy(new Error(`Timed out after ${timeoutMs} ms`)), left)
      req.on('close', () => clearTimeout(timer))
      req.on('error', fail)
      req.end()
    })

    if (answer.location !== undefined) {
      url = assertFetchableUrl(answer.location, url.toString())
      continue
    }
    if (answer.status < 200 || answer.status >= 300) throw new Error(`The server answered ${answer.status}`)
    try {
      return { url: url.toString(), json: JSON.parse(answer.body ?? '') }
    } catch {
      throw new Error('The document is not JSON')
    }
  }
  throw new Error(`More than ${maxRedirects} redirects`)
}
