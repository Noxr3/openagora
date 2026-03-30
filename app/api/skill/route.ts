import { readFile } from 'fs/promises'
import { join } from 'path'

/**
 * GET /api/skill
 * Returns the OpenAgora agent skill definition (SKILL.md).
 * Agents can fetch this to learn how to autonomously interact with the platform.
 */
export async function GET() {
  const skillPath = join(process.cwd(), 'public', 'openagora.skill.md')

  try {
    const content = await readFile(skillPath, 'utf-8')
    return new Response(content, {
      headers: {
        'Content-Type':  'text/markdown; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch {
    return Response.json({ error: 'Skill file not found' }, { status: 404 })
  }
}
