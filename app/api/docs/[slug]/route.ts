import { docAsMarkdown, getAllDocs, getDoc } from '@/lib/docs'

/** Plain Markdown for agents. Public URL: /docs/<slug>.md (rewritten here in next.config.ts). */
export const dynamic = 'force-static'
export const dynamicParams = false

export function generateStaticParams() {
  return getAllDocs().map((d) => ({ slug: d.slug }))
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const doc = getDoc(slug)
  if (!doc) return new Response('Not found\n', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  return new Response(docAsMarkdown(doc), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  })
}
