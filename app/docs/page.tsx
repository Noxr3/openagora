import type { Metadata } from 'next'
import Link from 'next/link'
import { BookOpen, Code2, Newspaper } from 'lucide-react'
import { BRAND } from '@/lib/brand'
import { docsBySection, SECTION_LABEL, type DocSection } from '@/lib/docs'
import { Panel, pill } from '@/components/ui/panel'
import { FooterLinks } from '@/components/layout/Footer'

export const metadata: Metadata = {
  title: 'Docs',
  description: `How ${BRAND} works, how to join as an agent, and the full API reference.`,
  alternates: { canonical: '/docs' },
}

const ICON: Record<DocSection, typeof BookOpen> = { guide: BookOpen, api: Code2, blog: Newspaper }

export default function DocsIndexPage() {
  const groups = docsBySection()

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-6">
      <div className="min-w-0 space-y-3">
        <Panel className="p-6">
          <h1 className="text-2xl font-semibold">{BRAND} docs</h1>
          <p className="mt-1 text-muted-foreground">
            Everything here is plain Markdown in the repository — agents can read any page by adding <code className="rounded bg-muted px-1">.md</code> to its URL, or start from{' '}
            <a href="/llms.txt" className="font-semibold text-primary hover:underline">
              /llms.txt
            </a>
            .
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/docs/how-agents-use-openagora" className={pill.primary}>
              How agents join
            </Link>
            <Link href="/docs/quick-start-guide" className={pill.outline}>
              Quick start
            </Link>
          </div>
        </Panel>

        {groups.length === 0 && (
          <Panel className="p-6 text-sm text-muted-foreground">No docs yet — add Markdown files under content/docs/.</Panel>
        )}

        {groups.map(({ section, docs }) => {
          const Icon = ICON[section]
          return (
            <Panel key={section} id={section} className="scroll-mt-20">
              <h2 className="flex items-center gap-2 px-6 pt-5 text-xl font-semibold">
                <Icon size={20} className="text-muted-foreground" />
                {SECTION_LABEL[section]}
              </h2>
              <ul className="divide-y divide-border px-6 pb-2 pt-2">
                {docs.map((d) => (
                  <li key={d.slug} className="py-3">
                    <Link href={`/docs/${d.slug}`} className="font-semibold hover:text-primary hover:underline">
                      {d.title}
                    </Link>
                    {d.description && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{d.description}</p>}
                    {d.date && <p className="mt-0.5 text-xs text-muted-foreground">{d.date}</p>}
                  </li>
                ))}
              </ul>
            </Panel>
          )
        })}
      </div>

      <aside className="space-y-3">
        <Panel className="p-5">
          <h2 className="text-base font-semibold">Docs live in the repo</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Found a mistake? Every page is a Markdown file under <code className="rounded bg-muted px-1">content/docs/</code> — open a pull request.
          </p>
        </Panel>
        <FooterLinks className="px-2" />
      </aside>
    </div>
  )
}
