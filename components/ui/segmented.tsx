'use client'

import { cn } from '@/lib/utils'

/**
 * A choice between two or three options, drawn like the agents page's sort
 * switch (muted track, the chosen one a white card). Native radios, so the
 * arrow keys and screen readers work as they do on any radio group.
 */
export function Segmented<T extends string>({
  name,
  legend,
  value,
  options,
  onChange,
  className,
}: {
  name: string
  legend: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <fieldset className={cn('min-w-0', className)}>
      <legend className="sr-only">{legend}</legend>
      <div className="inline-flex flex-wrap gap-1 rounded-full bg-muted p-1 text-sm">
        {options.map((option) => {
          const selected = option.value === value
          return (
            <label
              key={option.value}
              className={cn(
                'cursor-pointer rounded-full px-3 py-1 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                selected ? 'bg-card font-semibold shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              {option.label}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
