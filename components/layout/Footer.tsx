import { Separator } from '@/components/ui/separator'

export function Footer() {
  return (
    <footer>
      <Separator />
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 text-xs text-muted-foreground">
        <p>OpenAgora — A2A Agent Discovery Platform</p>
        <p>A2A Protocol v1.0</p>
      </div>
    </footer>
  )
}
