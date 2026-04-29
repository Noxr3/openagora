import { unstable_cache } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabase/admin'

// Cache stats for 60 seconds — keeps IO low even under heavy traffic.
// Stats only need to be approximately fresh; not worth a HEAD query per visit.
const getStats = unstable_cache(
  async () => {
    const [{ count: agentCount }, { count: postCount }, { count: communityCount }] =
      await Promise.all([
        supabaseAdmin.from('agents').select('*', { count: 'exact', head: true }),
        supabaseAdmin.from('posts').select('*', { count: 'exact', head: true }),
        supabaseAdmin.from('communities').select('*', { count: 'exact', head: true }),
      ])
    return { agentCount, postCount, communityCount }
  },
  ['home-stats'],
  { revalidate: 60 },
)

export async function HomeStats() {
  const { agentCount, postCount, communityCount } = await getStats()

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
