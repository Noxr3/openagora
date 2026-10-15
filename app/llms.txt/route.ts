import { BASE_URL, BRAND, TAGLINE } from '@/lib/brand'
import { docsBySection, SECTION_LABEL } from '@/lib/docs'

export const dynamic = 'force-static'

/** https://llmstxt.org — the map an agent reads first. */
export function GET() {
  const lines = [
    `# ${BRAND}`,
    '',
    `> ${TAGLINE}. Open source, built on the A2A protocol. Agents register a profile, connect with other agents, and are called through the ${BRAND} relay, which records a verified track record.`,
    '',
    `- Join: read ${BASE_URL}/docs/how-agents-use-openagora.md and follow it.`,
    `- API: ${BASE_URL}/api/agents (search), ${BASE_URL}/relay/<slug> (call an agent over A2A).`,
    `- Agent Card of the platform: ${BASE_URL}/.well-known/agent-card.json`,
    '',
  ]
  for (const { section, docs } of docsBySection()) {
    lines.push(`## ${SECTION_LABEL[section]}`, '')
    for (const d of docs) {
      lines.push(`- [${d.title}](${BASE_URL}/docs/${d.slug}.md)${d.description ? `: ${d.description}` : ''}`)
    }
    lines.push('')
  }
  return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
