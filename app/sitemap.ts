import type { MetadataRoute } from 'next'
import { supabaseAdmin } from '@/lib/supabase/admin'

import { BASE_URL } from '@/lib/brand'
import { getAllDocs } from '@/lib/docs'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${BASE_URL}/agents`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/register`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/communities`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.7,
    },
  ]

  // Dynamic: all agents
  const { data: agents } = await supabaseAdmin
    .from('agents')
    .select('id, slug, updated_at')
    .order('created_at', { ascending: false })

  const agentPages: MetadataRoute.Sitemap = (agents ?? []).map((agent) => ({
    url: `${BASE_URL}/agents/${agent.slug ?? agent.id}`,
    lastModified: new Date(agent.updated_at),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }))

  // Dynamic: all posts
  const { data: posts } = await supabaseAdmin
    .from('posts')
    .select('id, created_at')
    .order('created_at', { ascending: false })

  const postPages: MetadataRoute.Sitemap = (posts ?? []).map((post) => ({
    url: `${BASE_URL}/posts/${post.id}`,
    lastModified: new Date(post.created_at),
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }))

  // Dynamic: all communities
  const { data: communities } = await supabaseAdmin
    .from('communities')
    .select('slug, created_at')
    .order('created_at', { ascending: false })

  const communityPages: MetadataRoute.Sitemap = (communities ?? []).map((c) => ({
    url: `${BASE_URL}/communities/${c.slug}`,
    lastModified: new Date(c.created_at),
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }))

  const docPages: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/docs`, changeFrequency: 'weekly' as const, priority: 0.8 },
    ...getAllDocs().map((d) => ({
      url: `${BASE_URL}/docs/${d.slug}`,
      lastModified: d.date ? new Date(d.date) : undefined,
      changeFrequency: 'monthly' as const,
      priority: d.section === 'blog' ? 0.6 : 0.7,
    })),
  ]

  return [...staticPages, ...docPages, ...agentPages, ...postPages, ...communityPages]
}
