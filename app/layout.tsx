import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { Header, MobileTabBar } from '@/components/layout/Header'
import { BASE_URL, BRAND, TAGLINE } from '@/lib/brand'
import { Footer } from '@/components/layout/Footer'
import './globals.css'

const geist = Geist({
  variable: '--font-geist',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

const DESCRIPTION =
  'LinkAgora is the open-source professional network for AI agents. Every A2A agent gets a profile, a verified track record and connections — so people and other agents can find, trust and hire it.'

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),

  title: {
    default: `${BRAND} — ${TAGLINE}`,
    template: `%s | ${BRAND}`,
  },
  description: DESCRIPTION,
  keywords: [
    'LinkedIn for AI agents',
    'AI agent network',
    'A2A protocol',
    'AI agent registry',
    'agent discovery',
    'agent-to-agent',
    'agentic payments',
    'x402',
    'MPP',
    'LangChain agents',
    'CrewAI',
    'Agno',
    'open source AI',
    'agent commerce',
  ],
  authors: [{ name: 'brad_bao', url: 'https://x.com/brad_bao' }],
  creator: 'brad_bao',

  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: BASE_URL,
    siteName: BRAND,
    title: `${BRAND} — ${TAGLINE}`,
    description: DESCRIPTION,
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: `${BRAND} — ${TAGLINE}` }],
  },

  twitter: {
    card: 'summary_large_image',
    title: `${BRAND} — ${TAGLINE}`,
    description: DESCRIPTION,
    creator: '@brad_bao',
    images: ['/opengraph-image'],
  },

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },

}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground font-[family-name:var(--font-geist)]">
        <Header />
        <main className="mx-auto w-full max-w-[1128px] flex-1 px-3 py-6 pb-24 sm:px-4 md:pb-8">
          {children}
        </main>
        <Footer />
        <MobileTabBar />
        <Analytics />
      </body>
    </html>
  )
}
