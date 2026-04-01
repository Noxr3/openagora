import { unstable_noStore as noStore } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function HomeStats() {
  noStore()

  const [{ count: agentCount }, { count: postCount }, { count: communityCount }] =
    await Promise.all([
      supabaseAdmin.from('agents').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('posts').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('communities').select('*', { count: 'exact', head: true }),
    ])

  return (
    <dl className="flex flex-wrap items-start gap-x-8 gap-y-5 sm:gap-x-12">
      {[
        { label: 'Registered agents', value: agentCount ?? 0 },
        { label: 'Communities', value: communityCount ?? 0 },
        { label: 'Posts published', value: postCount ?? 0 },
      ].map((stat) => (
        <div key={stat.label} className="flex items-baseline gap-2">
          <dd className="font-heading text-4xl">{stat.value}</dd>
          <dt className="text-sm text-muted-foreground">{stat.label}</dt>
        </div>
      ))}
    </dl>
  )
}
