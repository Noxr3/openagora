import Link from 'next/link'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
}

function textOf(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (node && typeof node === 'object' && 'props' in node) {
    return textOf((node as { props: { children?: React.ReactNode } }).props.children)
  }
  return ''
}

const heading =
  (Tag: 'h2' | 'h3' | 'h4') =>
  // eslint-disable-next-line react/display-name
  ({ children }: { children?: React.ReactNode }) => {
    const id = slugify(textOf(children))
    return (
      <Tag id={id} className="group scroll-mt-20">
        <a href={`#${id}`} className="no-underline">
          {children}
        </a>
      </Tag>
    )
  }

const components: Components = {
  // The page renders the title; a body H1 would be a second one.
  h1: heading('h2'),
  h2: heading('h2'),
  h3: heading('h3'),
  h4: heading('h4'),
  a: ({ href = '', children }) =>
    href.startsWith('/') || href.startsWith('#') ? (
      <Link href={href}>{children}</Link>
    ) : (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ),
  table: ({ children }) => (
    <div className="docs-table">
      <table>{children}</table>
    </div>
  ),
  // eslint-disable-next-line @next/next/no-img-element
  img: ({ src, alt }) => <img src={typeof src === 'string' ? src : undefined} alt={alt ?? ''} loading="lazy" />,
}

/** Docs Markdown, GitHub-flavoured. Raw HTML in a doc is not rendered. */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="docs-prose">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  )
}
