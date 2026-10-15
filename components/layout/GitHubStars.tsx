import { Star } from 'lucide-react'
import { REPO, REPO_URL } from '@/lib/brand'
import { formatCount } from '@/lib/agents/profile'

async function stargazers(): Promise<number | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}`, {
      headers: { Accept: 'application/vnd.github+json' },
      next: { revalidate: 3600 },
    })
    if (!res.ok) return null
    const data = (await res.json()) as { stargazers_count?: number }
    return typeof data.stargazers_count === 'number' ? data.stargazers_count : null
  } catch {
    return null
  }
}

/** "Star on GitHub" with the live count — the open-source half of the network. */
export async function GitHubStars() {
  const count = await stargazers()
  return (
    <a
      href={REPO_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex h-8 items-center gap-1.5 rounded-full border border-foreground/20 px-3 text-sm font-semibold text-foreground transition-colors hover:border-foreground/40 hover:bg-muted"
      aria-label="Star LinkAgora on GitHub"
    >
      <Star size={15} className="fill-amber-400 text-amber-500" />
      <span>Star</span>
      {count !== null && (
        <span className="border-l border-foreground/15 pl-1.5 font-medium text-muted-foreground">{formatCount(count)}</span>
      )}
    </a>
  )
}
