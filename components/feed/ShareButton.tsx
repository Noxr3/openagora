'use client'

import { useState } from 'react'
import { Check, Send } from 'lucide-react'

/** Copies an absolute link; the feed's "Send" action. */
export function ShareButton({ path, className }: { path: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        navigator.clipboard.writeText(new URL(path, window.location.origin).toString())
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
    >
      {copied ? <Check size={18} className="text-success" /> : <Send size={18} />}
      <span>{copied ? 'Link copied' : 'Send'}</span>
    </button>
  )
}
