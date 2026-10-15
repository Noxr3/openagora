import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

/**
 * Docs live in the repository as Markdown under content/docs/. One file per
 * page, its slug is the file name. The same file serves people (/docs/<slug>)
 * and agents (/docs/<slug>.md, listed in /llms.txt).
 */
export const DOCS_DIR = join(process.cwd(), 'content', 'docs')

export type DocSection = 'guide' | 'api' | 'blog'

export const SECTION_LABEL: Record<DocSection, string> = {
  guide: 'Guides',
  api: 'API reference',
  blog: 'Blog',
}

export interface DocMeta {
  slug: string
  title: string
  description: string
  section: DocSection
  order: number
  date?: string
}

export interface Doc extends DocMeta {
  body: string
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/

/** Minimal frontmatter reader: `key: value` lines between two `---` fences. */
function parseFrontmatter(raw: string): { data: Record<string, string>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!match) return { data: {}, body: raw }
  const data: Record<string, string> = {}
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/)
    if (!kv) continue
    let value = kv[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1).replace(/\\"/g, '"')
    }
    data[kv[1]] = value
  }
  return { data, body: raw.slice(match[0].length) }
}

function toSection(value: string | undefined): DocSection {
  return value === 'api' || value === 'blog' ? value : 'guide'
}

function readDoc(slug: string): Doc | null {
  if (!SLUG_RE.test(slug)) return null
  let raw: string
  try {
    raw = readFileSync(join(DOCS_DIR, `${slug}.md`), 'utf8')
  } catch {
    return null
  }
  const { data, body } = parseFrontmatter(raw)
  return {
    slug,
    title: data.title || slug,
    description: data.description || '',
    section: toSection(data.section),
    order: Number.parseInt(data.order ?? '', 10) || 999,
    date: data.date || undefined,
    body,
  }
}

let cache: Doc[] | null = null

export function getAllDocs(): Doc[] {
  if (cache && process.env.NODE_ENV === 'production') return cache
  let files: string[] = []
  try {
    files = readdirSync(DOCS_DIR).filter((f) => f.endsWith('.md'))
  } catch {
    files = []
  }
  const docs = files
    .map((f) => readDoc(f.replace(/\.md$/, '')))
    .filter((d): d is Doc => d !== null)
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
  cache = docs
  return docs
}

export function getDoc(slug: string): Doc | null {
  return getAllDocs().find((d) => d.slug === slug) ?? null
}

export function docsBySection(): { section: DocSection; docs: Doc[] }[] {
  const all = getAllDocs()
  return (['guide', 'api', 'blog'] as const)
    .map((section) => ({ section, docs: all.filter((d) => d.section === section) }))
    .filter((g) => g.docs.length > 0)
}

/** The Markdown an agent gets: title and description restored above the body. */
export function docAsMarkdown(doc: Doc): string {
  const head = [`# ${doc.title}`, doc.description ? `> ${doc.description}` : ''].filter(Boolean).join('\n\n')
  return `${head}\n\n${doc.body.trim()}\n`
}
