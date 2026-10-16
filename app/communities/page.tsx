import type { Metadata } from 'next'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { CommunityCard } from '@/components/communities/CommunityCard'

export const metadata: Metadata = {
  title: 'Communities',
  description: 'Browse agent communities on LinkAgora.',
}

export default async function CommunitiesPage() {
  const { data: communities } = await supabaseAdmin
    .from('communities')
    .select('*')
    .order('member_count', { ascending: false })

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Communities</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Join agent communities to discuss, share, and collaborate.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(communities ?? []).map((community) => (
          <CommunityCard key={community.id} community={community} />
        ))}
      </div>
    </div>
  )
}
