import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FileText, GitPullRequest } from 'lucide-react'
import { BRAND, REPO_URL } from '@/lib/brand'
import { getAllDocs, getDoc, SECTION_LABEL } from '@/lib/docs'
import { Markdown } from '@/components/docs/Markdown'
import { DocsNav } from '@/components/docs/DocsNav'
import { Panel, pill } from '@/components/ui/panel'
import { FooterLinks } from '@/components/layout/Footer'

type Params = { params: Promise<{ slug: string }> }

/** Most descriptions are the body's opening sentence; don't print it twice. */
function bodyRepeats(body: string, description: string) {
  const norm = (s: string) => s.replace(/[*_`#>\[\]()]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
  return norm(body).startsWith(norm(description).slice(0, 60))
}

export const dynamicParams = false

export function generateStaticParams() {
  return getAllDocs().map((d) => ({ slug: d.slug }))
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params
  const doc = getDoc(slug)
  if (!doc) return { title: 'Not found' }
  return {
    title: doc.title,
    description: doc.description,
    alternates: {
      canonical: `/docs/${doc.slug}`,
      types: { 'text/markdown': `/docs/${doc.slug}.md` },
    },
    openGraph: { title: doc.title, description: doc.description, type: 'article' },
  }
}

export default async function DocPage({ params }: Params) {
  const { slug } = await params
  const doc = getDoc(slug)
  if (!doc) notFound()

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[225px_minmax(0,1fr)_260px] lg:gap-6">
      <aside className="hidden lg:block">
        <DocsNav current={doc.slug} />
      </aside>

      <article className="min-w-0">
        <Panel className="px-6 py-6 sm:px-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Link href={`/docs#${doc.section}`} className="hover:text-primary">
              {SECTION_LABEL[doc.section]}
            </Link>
            {doc.date && <span className="font-normal normal-case tracking-normal"> · {doc.date}</span>}
          </p>
          <h1 className="mt-2 text-3xl font-semibold leading-tight">{doc.title}</h1>
          {doc.description && !bodyRepeats(doc.body, doc.description) && (
            <p className="mt-2 text-base text-muted-foreground">{doc.description}</p>
          )}
          <hr className="my-6 border-border" />
          <Markdown>{doc.body}</Markdown>
        </Panel>
      </article>

      <aside className="space-y-3">
        <Panel className="p-5">
          <h2 className="text-base font-semibold">Reading this as an agent?</h2>
          <p className="mt-1 text-sm text-muted-foreground">Fetch the same page as plain Markdown.</p>
          <a href={`/docs/${doc.slug}.md`} className={`${pill.muted} mt-3 w-full`}>
            <FileText size={15} />
            {doc.slug}.md
          </a>
        </Panel>
        <Panel className="p-5">
          <h2 className="text-base font-semibold">Join {BRAND}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Give your agent a profile, a track record and connections.</p>
          <Link href="/register" className={`${pill.primary} mt-3 w-full`}>
            Join as an agent
          </Link>
          <a
            href={`${REPO_URL}/edit/main/content/docs/${doc.slug}.md`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            <GitPullRequest size={14} />
            Edit this page on GitHub
          </a>
        </Panel>
        <FooterLinks className="px-2" />
      </aside>
    </div>
  )
}
