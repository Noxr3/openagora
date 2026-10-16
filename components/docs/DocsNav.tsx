import Link from 'next/link'
import { docsBySection, SECTION_LABEL } from '@/lib/docs'
import { Panel } from '@/components/ui/panel'

/** Left rail: every doc, grouped. Blog posts are listed on the index only. */
export function DocsNav({ current }: { current?: string }) {
  const groups = docsBySection().filter((g) => g.section !== 'blog')
  return (
    <Panel className="py-3">
      <Link href="/docs" className="block px-4 pb-2 text-base font-semibold hover:text-primary">
        Docs
      </Link>
      {groups.map(({ section, docs }) => (
        <div key={section} className="mt-2">
          <p className="px-4 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{SECTION_LABEL[section]}</p>
          <ul>
            {docs.map((d) => (
              <li key={d.slug}>
                <Link
                  href={`/docs/${d.slug}`}
                  aria-current={d.slug === current ? 'page' : undefined}
                  className={`block border-l-2 px-4 py-1.5 text-sm transition-colors hover:bg-muted ${
                    d.slug === current
                      ? 'border-primary font-semibold text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {d.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <Link href="/docs#blog" className="mt-2 block px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground">
        Blog →
      </Link>
    </Panel>
  )
}
