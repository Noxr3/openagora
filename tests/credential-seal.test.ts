import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import {
  checkHeaderName,
  checkHeaderValue,
  credentialFromInput,
  openCredential,
  originOf,
  parseCredentialsKey,
  sealCredential,
} from '../lib/gateway/credential-seal.ts'

const key = randomBytes(32)
const AGENT = '7d4c1e8a-0000-4000-8000-000000000001'
const OTHER = '7d4c1e8a-0000-4000-8000-000000000002'

test('parseCredentialsKey takes 32 bytes as base64 or hex, nothing else', () => {
  assert.equal(parseCredentialsKey(key.toString('base64'))?.equals(key), true)
  assert.equal(parseCredentialsKey(key.toString('hex'))?.equals(key), true)
  assert.equal(parseCredentialsKey(key.toString('base64url'))?.equals(key), true)
  assert.equal(parseCredentialsKey(undefined), null)
  assert.equal(parseCredentialsKey(''), null)
  assert.equal(parseCredentialsKey('too-short'), null)
  assert.equal(parseCredentialsKey(randomBytes(16).toString('base64')), null)
})

test('a sealed credential opens only for the same key, agent and header', () => {
  const sealed = sealCredential(key, AGENT, 'Authorization', 'Bearer dka_secret')
  assert.match(sealed, /^v1:/)
  assert.ok(!sealed.includes('dka_secret'))
  assert.equal(openCredential(key, AGENT, 'Authorization', sealed), 'Bearer dka_secret')
  assert.equal(openCredential(key, AGENT, 'authorization', sealed), 'Bearer dka_secret', 'header names are case-insensitive')
  assert.equal(openCredential(key, OTHER, 'Authorization', sealed), null, 'copied onto another agent')
  assert.equal(openCredential(key, AGENT, 'X-API-Key', sealed), null, 'moved to another header')
  assert.equal(openCredential(randomBytes(32), AGENT, 'Authorization', sealed), null, 'another key')
  const bytes = Buffer.from(sealed.slice(3), 'base64')
  bytes[bytes.length - 1] ^= 1
  assert.equal(openCredential(key, AGENT, 'Authorization', `v1:${bytes.toString('base64')}`), null, 'tampered')
  assert.equal(openCredential(key, AGENT, 'Authorization', 'v2:abc'), null)
  // Fresh IV each time.
  assert.notEqual(sealCredential(key, AGENT, 'Authorization', 'x'), sealCredential(key, AGENT, 'Authorization', 'x'))
})

test('header names the relay owns cannot be replaced', () => {
  assert.deepEqual(checkHeaderName('X-API-Key'), { ok: true, name: 'X-API-Key' })
  for (const bad of ['Host', 'content-type', 'X-OpenAgora-Caller-ID', 'A2A-Version', 'Payment-Signature', 'Transfer-Encoding', 'Proxy-Authorization', 'Sec-Fetch-Mode', 'Bad Header', 'a\r\nb', '', 42]) {
    assert.equal(checkHeaderName(bad).ok, false, String(bad))
  }
})

test('header values: no line breaks, no control characters, bounded', () => {
  assert.deepEqual(checkHeaderValue('  Bearer dka_x  '), { ok: true, value: 'Bearer dka_x' })
  for (const bad of ['', '   ', 'a\r\nInjected: 1', 'a\nb', 'a\u0000b', 'x'.repeat(4097), '中文', null]) {
    assert.equal(checkHeaderValue(bad).ok, false, JSON.stringify(bad))
  }
})

test('credentialFromInput: bearer shorthand or header + value', () => {
  assert.deepEqual(credentialFromInput({ bearer: 'dka_abc' }), { ok: true, header: 'Authorization', value: 'Bearer dka_abc' })
  assert.deepEqual(credentialFromInput({ header: 'X-API-Key', value: 'k1' }), { ok: true, header: 'X-API-Key', value: 'k1' })
  assert.deepEqual(credentialFromInput({ value: 'Token t' }), { ok: true, header: 'Authorization', value: 'Token t' })
  assert.equal(credentialFromInput({ bearer: 'Bearer dka_abc' }).ok, false)
  assert.equal(credentialFromInput({ header: 'Host', value: 'x' }).ok, false)
  assert.equal(credentialFromInput(null).ok, false)
  assert.equal(credentialFromInput({}).ok, false)
})

test('originOf pins to scheme, host and port the way browsers write them', () => {
  assert.equal(originOf('https://Dokki.one:443/api/agent-api/a2a/x'), 'https://dokki.one')
  assert.equal(originOf('https://dokki.one:8443/a'), 'https://dokki.one:8443')
  assert.equal(originOf('http://agent.example/a2a'), 'http://agent.example')
  assert.equal(originOf('ftp://x.example/'), null)
  assert.equal(originOf('nonsense'), null)
  assert.notEqual(originOf('https://dokki.one/a'), originOf('https://dokki.one.evil.example/a'))
})
