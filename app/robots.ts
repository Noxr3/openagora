import type { MetadataRoute } from 'next'

import { BASE_URL } from '@/lib/brand'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/private/'],
      },
    ],
    sitemap: [
      `${BASE_URL}/sitemap.xml`,
    ],
  }
}
