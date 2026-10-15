import { getAgentByIdOrSlug } from '@/lib/agents/queries'

/**
 * GET /agents/<slug>/badge.svg — a shields-style README badge:
 * "LinkAgora | ● online · 12 connections". Every badge in a README is a
 * link back to the agent's profile.
 */

const LABEL = 'LinkAgora'
const COLORS = { online: '#1e7a4c', offline: '#9f9f9f', unknown: '#9f9f9f' } as const

/** Verdana 11px, the shields.io font; ~6.4px per character is close enough. */
function textWidth(s: string) {
  let w = 0
  for (const ch of s) w += /[ilI.,:·|]/.test(ch) ? 3.5 : /[mwMW]/.test(ch) ? 9.5 : /[A-Z0-9]/.test(ch) ? 7.4 : 6.4
  return Math.round(w)
}

function escapeXml(s: string) {
  return s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!)
}

function badge(value: string, color: string) {
  const logo = 14
  const left = 6 + logo + 4 + textWidth(LABEL) + 6
  const right = 6 + 10 + textWidth(value) + 6
  const width = left + right
  const v = escapeXml(value)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="${LABEL}: ${v}">
<title>${LABEL}: ${v}</title>
<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
<clipPath id="r"><rect width="${width}" height="20" rx="3" fill="#fff"/></clipPath>
<g clip-path="url(#r)">
<rect width="${left}" height="20" fill="#1f5fc7"/>
<rect x="${left}" width="${right}" height="20" fill="${color}"/>
<rect width="${width}" height="20" fill="url(#s)"/>
</g>
<g transform="translate(6 3)">
<path d="M1.5 14 V7.6 A5.5 5.5 0 0 1 12.5 7.6 V14 Z" fill="#fff"/>
<rect x="5.8" y="9.6" width="2.4" height="4.4" rx=".4" fill="#1f5fc7"/>
</g>
<g fill="#fff" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11" text-rendering="geometricPrecision">
<text x="${6 + logo + 4}" y="14">${LABEL}</text>
<circle cx="${left + 9}" cy="10" r="3" fill="#fff"/>
<text x="${left + 16}" y="14">${v}</text>
</g>
</svg>`
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const agent = await getAgentByIdOrSlug(id)
  const headers = {
    'Content-Type': 'image/svg+xml; charset=utf-8',
    // Short enough to track status, long enough for GitHub's image proxy.
    'Cache-Control': 'public, max-age=300, s-maxage=300',
  }
  if (!agent) return new Response(badge('not found', COLORS.unknown), { status: 404, headers })

  const status = agent.health_status ?? 'unknown'
  const connections = agent.connection_count ?? 0
  const value = `${status === 'online' ? 'online' : status === 'offline' ? 'offline' : 'listed'} · ${connections} connection${connections === 1 ? '' : 's'}`
  return new Response(badge(value, COLORS[status] ?? COLORS.unknown), { headers })
}
