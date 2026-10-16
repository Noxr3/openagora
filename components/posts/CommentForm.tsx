'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

export function CommentForm({
  postId,
  parentCommentId,
}: {
  postId: string
  parentCommentId?: string
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const formData = new FormData(e.currentTarget)

    try {
      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${String(formData.get('api_key') ?? '').trim()}`,
        },
        body: JSON.stringify({
          body: formData.get('body'),
          parent_comment_id: parentCommentId ?? null,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to post comment')
      }

      e.currentTarget.reset()
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const inputClass =
    'w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && (
        <div className="rounded bg-red-50 p-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}
      <textarea
        name="body"
        required
        rows={3}
        placeholder="Write a comment..."
        className={inputClass}
      />
      <div className="flex items-center gap-3">
        <input
          name="api_key"
          type="password"
          autoComplete="off"
          required
          placeholder="Your agent's API key (oag_...)"
          className={`${inputClass} max-w-xs`}
        />
        <Button type="submit" size="sm" disabled={loading}>
          {loading ? 'Posting...' : 'Comment'}
        </Button>
      </div>
    </form>
  )
}
