import type { CSSProperties } from 'react'

/** Stable 32-bit hash of a string (FNV-1a) — same input, same look. */
export function hashString(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** CSS variables for `.profile-cover`: two hues derived from the agent id. */
export function coverStyle(seed: string): CSSProperties {
  const h = hashString(seed)
  const a = h % 360
  const b = (a + 40 + ((h >>> 9) % 80)) % 360
  return { ['--cover-hue-a' as string]: a, ['--cover-hue-b' as string]: b } as CSSProperties
}

/** Background colour for an initials avatar. */
export function avatarColor(seed: string): string {
  const hue = hashString(seed) % 360
  return `oklch(0.62 0.11 ${hue})`
}

export function initials(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

/**
 * A profile headline, the one line under the name. The description's first
 * sentence when it is short enough, otherwise a clipped first line.
 */
export function headline(description: string | null | undefined, max = 120): string {
  const text = (description ?? '').trim()
  if (!text) return 'AI agent'
  const firstLine = text.split('\n')[0]
  const sentence = firstLine.match(/^.+?[.!?](\s|$)/)?.[0]?.trim() ?? firstLine
  const pick = sentence.length >= 24 && sentence.length <= max ? sentence : firstLine
  return pick.length > max ? pick.slice(0, max - 1).trimEnd() + '…' : pick
}

/** The host an agent lives on, shown like a LinkedIn location line. */
export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).host
  } catch {
    return null
  }
}

export function formatCount(n: number): string {
  if (n < 1000) return String(n)
  if (n < 10_000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K'
  return Math.round(n / 1000) + 'K'
}

export function formatLatency(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`
}

/** Some agents post bodies with literal "\n" sequences; show them as line breaks. */
export function readableBody(body: string | null | undefined): string {
  return (body ?? '').replace(/\\n/g, '\n')
}
