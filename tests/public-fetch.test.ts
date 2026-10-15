import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import {
  UnsafeUrlError,
  assertFetchableUrl,
  assertPublicHost,
  fetchPublicJson,
  guardedLookup,
  isPublicAddress,
} from '../lib/net/public-fetch.ts'

test('isPublicAddress refuses loopback, private, link-local and the IPv6 forms that hide them', () => {
  for (const ip of [
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254',
    '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '198.18.0.1', '192.0.2.1',
    '::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'ff02::1',
    '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:10.0.0.1', '64:ff9b::a9fe:a9fe', '2002:7f00:1::1',
    '[::1]', 'fe80::1%en0',
  ]) {
    assert.equal(isPublicAddress(ip), false, `${ip} should be refused`)
  }
  for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '100.128.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8']) {
    assert.equal(isPublicAddress(ip), true, `${ip} should be allowed`)
  }
  assert.equal(isPublicAddress('not-an-ip'), false)
})

test('assertFetchableUrl: https only, no credentials, no private literals', () => {
  assert.equal(assertFetchableUrl('https://dokki.one/api/agent-api/a2a/x/.well-known/agent-card.json').hostname, 'dokki.one')
  for (const bad of [
    'http://dokki.one/card.json',
    'ftp://dokki.one/card.json',
    'https://user:pw@dokki.one/card.json',
    'https://127.0.0.1/card.json',
    'https://[::1]/card.json',
    'https://169.254.169.254/latest/meta-data',
    'https://localhost/card.json',
    'https://api.localhost/card.json',
    'https://printer.local/card.json',
    'not a url',
  ]) {
    assert.throws(() => assertFetchableUrl(bad), UnsafeUrlError, bad)
  }
  // Relative redirect targets resolve against the page they came from.
  assert.equal(assertFetchableUrl('/next.json', 'https://a.example/x/card.json').href, 'https://a.example/next.json')
  assert.throws(() => assertFetchableUrl('http://a.example/', 'https://a.example/'), UnsafeUrlError)
})

type Addr = { address: string; family: number }
const fakeResolver = (answers: Record<string, Addr[]>) =>
  (host: string, _opts: unknown, cb: (err: NodeJS.ErrnoException | null, a: Addr[]) => void) => {
    const a = answers[host]
    if (!a) {
      const e = new Error('not found') as NodeJS.ErrnoException
      e.code = 'ENOTFOUND'
      return cb(e, [])
    }
    cb(null, a)
  }

test('guardedLookup answers both lookup forms and refuses a name with any private record', async () => {
  const lookup = guardedLookup(fakeResolver({
    'public.example': [{ address: '93.184.216.34', family: 4 }, { address: '2606:2800:220:1::1', family: 6 }],
    'mixed.example': [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.5', family: 4 }],
    'rebind.example': [{ address: '127.0.0.1', family: 4 }],
  }) as never)

  const one = await new Promise<[unknown, unknown, unknown]>((ok) => lookup('public.example', {}, (e, a, f) => ok([e, a, f])))
  assert.deepEqual(one, [null, '93.184.216.34', 4])

  const all = await new Promise<[unknown, unknown]>((ok) => lookup('public.example', { all: true }, (e, a) => ok([e, a])))
  assert.equal(all[0], null)
  assert.equal((all[1] as Addr[]).length, 2)

  for (const host of ['mixed.example', 'rebind.example']) {
    const err = await new Promise<unknown>((ok) => lookup(host, { all: true }, (e) => ok(e)))
    assert.ok(err instanceof UnsafeUrlError, host)
  }
  await assert.rejects(assertPublicHost('mixed.example', fakeResolver({ 'mixed.example': [{ address: '10.0.0.5', family: 4 }] }) as never), UnsafeUrlError)
  await assert.rejects(assertPublicHost('127.0.0.1'), UnsafeUrlError)
  await assertPublicHost('8.8.8.8')
})

test('fetchPublicJson never reaches a server on this machine', async () => {
  // A real server on loopback: every way of naming it must be refused before connecting.
  let hits = 0
  const server = createServer((_req, res) => {
    hits++
    res.end('{"name":"should never be read"}')
  })
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok))
  const { port } = server.address() as AddressInfo
  try {
    await assert.rejects(fetchPublicJson(`http://127.0.0.1:${port}/card.json`), UnsafeUrlError)
    await assert.rejects(fetchPublicJson(`https://127.0.0.1:${port}/card.json`), UnsafeUrlError)
    await assert.rejects(fetchPublicJson(`https://localhost:${port}/card.json`), UnsafeUrlError)
    // A public-looking name that resolves to loopback (DNS rebinding) is refused at connect time.
    await assert.rejects(
      fetchPublicJson(`https://card.example:${port}/card.json`, {
        resolve: fakeResolver({ 'card.example': [{ address: '127.0.0.1', family: 4 }] }) as never,
      }),
      (err: Error) => /not on the public internet/.test(err.message),
    )
    assert.equal(hits, 0)
  } finally {
    server.close()
  }
})
