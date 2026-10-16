'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { Search } from 'lucide-react'

export function HeaderSearch() {
  const router = useRouter()
  const params = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault()
        const query = q.trim()
        router.push(query ? `/agents?q=${encodeURIComponent(query)}` : '/agents')
      }}
      className="relative w-full max-w-[280px]"
    >
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search agents, skills, providers"
        aria-label="Search agents"
        className="h-[34px] w-full rounded-md bg-accent pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/40"
      />
    </form>
  )
}
