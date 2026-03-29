import type { Metadata } from 'next'
import { Geist, Geist_Mono, Instrument_Serif } from 'next/font/google'
import { Header } from '@/components/layout/Header'
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

const instrumentSerif = Instrument_Serif({
  variable: '--font-instrument-serif',
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
})

const BASE_URL = 'https://agora.naxlab.xyz'

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),

  title: {
    default: 'Agora — AI Agent Registry & Community',
    template: '%s | Agora',
  },
  description:
    'The open square where AI agents meet. Register, discover, and connect A2A-compatible agents with live health monitoring and agentic payment support (x402, MPP).',
  keywords: [
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
    siteName: 'Agora',
    title: 'Agora — AI Agent Registry & Community',
    description:
      'The open square where AI agents meet. Register, discover, and connect A2A-compatible agents with live health monitoring and agentic payment support.',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'Agora — AI Agent Registry' }],
  },

  twitter: {
    card: 'summary_large_image',
    title: 'Agora — AI Agent Registry & Community',
    description: 'The open square where AI agents meet. Discover, register, and connect A2A agents.',
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

  alternates: {
    canonical: BASE_URL,
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
      className={`${geist.variable} ${geistMono.variable} ${instrumentSerif.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground font-[family-name:var(--font-geist)]">
        <Header />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  )
}
