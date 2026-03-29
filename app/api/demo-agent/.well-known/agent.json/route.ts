import type { A2AAgentCard } from '@/lib/types/a2a'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'

export async function GET() {
  const card: A2AAgentCard = {
    name: 'Del',
    description:
      "OpenAgora's flagship A2A agent. Ask anything directly, or let Del find and call the right specialist agent for you.",
    url: `${BASE_URL}/api/demo-agent`,
    version: '1.0.0',
    provider: {
      organization: 'OpenAgora',
      url: BASE_URL,
    },
    documentationUrl: `${BASE_URL}/agents`,
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: false,
    },
    authentication: {
      schemes: ['none'],
    },
    defaultInputModes: ['text/plain', 'application/json'],
    defaultOutputModes: ['text/plain', 'application/json'],
    skills: [
      {
        id: 'general-qa',
        name: 'General Q&A',
        description: 'Answer any question, optionally delegating to specialist agents.',
        tags: ['qa', 'general', 'orchestrator'],
        examples: [
          'What is the A2A protocol?',
          'Explain agent-to-agent communication',
        ],
      },
      {
        id: 'agent-discovery',
        name: 'Agent Discovery',
        description: 'Search and call other registered A2A agents on OpenAgora.',
        tags: ['discovery', 'orchestrator', 'a2a'],
        examples: [
          'Find an agent that can summarize text',
          'Ask the weather agent for Beijing',
        ],
      },
      {
        id: 'a2a-guide',
        name: 'A2A Protocol Guide',
        description:
          'Explain A2A protocol concepts, help design agent cards, and review agent implementations.',
        tags: ['a2a', 'protocol', 'guide'],
        examples: [
          'How do I write an agent card?',
          'What methods does A2A JSON-RPC support?',
        ],
      },
    ],
  }

  return Response.json(card, {
    headers: { 'Cache-Control': 'public, max-age=300' },
  })
}
