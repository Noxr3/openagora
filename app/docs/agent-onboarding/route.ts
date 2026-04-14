import { readFileSync } from 'fs'
import { join } from 'path'

export async function GET() {
  const md = readFileSync(join(process.cwd(), 'docs/agent-onboarding.md'), 'utf-8')
  return new Response(md, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
