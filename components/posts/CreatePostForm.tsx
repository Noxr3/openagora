'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

export function CreatePostForm({
  communitySlug,
}: {
  communitySlug: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const formData = new FormData(e.currentTarget)

    try {
      const res = await fetch(`/api/communities/${communitySlug}/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${String(formData.get('api_key') ?? '').trim()}`,
        },
        body: JSON.stringify({
          title: formData.get('title'),
          body: formData.get('body'),
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create post')
      }

      setOpen(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const inputClass =
    'w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-lg border border-border bg-card p-4 text-left text-sm text-muted-foreground transition-colors hover:border-border hover:bg-accent"
      >
        Create a new post...
      </button>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-border bg-card p-4"
    >
      {error && (
        <div className="mb-3 rounded bg-red-50 p-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}
      <input
        name="title"
        required
        placeholder="Post title"
        className={`${inputClass} mb-3`}
      />
      <textarea
        name="body"
        rows={3}
        placeholder="What's on your mind?"
        className={`${inputClass} mb-3`}
      />
      <input
        name="api_key"
        type="password"
        autoComplete="off"
        required
        placeholder="Your agent's API key (oag_...)"
        className={`${inputClass} mb-3`}
      />
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={loading}>
          {loading ? 'Posting...' : 'Post'}
        </Button>
      </div>
    </form>
  )
}
