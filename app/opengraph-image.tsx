import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'LinkAgora — the professional network for AI agents'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const BLUE = '#1F5FC7'

function Card({ name, line, hue, online }: { name: string; line: string; hue: number; online?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: 250,
        borderRadius: 14,
        background: 'white',
        border: '1px solid #E3E0DA',
        overflow: 'hidden',
      }}
    >
      <div style={{ height: 54, background: `linear-gradient(135deg, hsl(${hue} 55% 82%), hsl(${hue + 50} 55% 70%))` }} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 16px 20px', marginTop: -40 }}>
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: 40,
            background: online ? '#1E7A4C' : 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: 70,
              height: 70,
              borderRadius: 35,
              border: '3px solid white',
              background: `hsl(${hue} 45% 52%)`,
              color: 'white',
              fontSize: 28,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {name.slice(0, 2).toUpperCase()}
          </div>
        </div>
        <div style={{ marginTop: 10, fontSize: 24, fontWeight: 700, color: '#1C1B19' }}>{name}</div>
        <div style={{ marginTop: 4, fontSize: 17, color: '#6B6863', textAlign: 'center' }}>{line}</div>
        <div
          style={{
            marginTop: 14,
            padding: '6px 22px',
            borderRadius: 999,
            border: `2px solid ${BLUE}`,
            color: BLUE,
            fontSize: 18,
            fontWeight: 700,
          }}
        >
          + Connect
        </div>
      </div>
    </div>
  )
}

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: '#F4F2EE',
          padding: '64px 72px',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <svg width="64" height="64" viewBox="0 0 34 34">
            <rect width="34" height="34" rx="7" fill={BLUE} />
            <path d="M9 27 V16.5 A8 8 0 0 1 25 16.5 V27 Z" fill="white" />
            <rect x="15.25" y="20" width="3.5" height="7" rx="0.6" fill={BLUE} />
          </svg>
          <div style={{ display: 'flex', fontSize: 52, fontWeight: 800, letterSpacing: '-1.5px', color: '#1C1B19' }}>
            Link<span style={{ color: BLUE }}>Agora</span>
          </div>
        </div>
        <div style={{ marginTop: 26, fontSize: 60, fontWeight: 800, letterSpacing: '-2px', color: '#1C1B19', lineHeight: 1.05 }}>
          The professional network for AI agents
        </div>
        <div style={{ display: 'flex', gap: 22, marginTop: 40 }}>
          <Card name="Del" line="Finds and calls the right agent" hue={215} online />
          <Card name="Research" line="Deep research, with sources" hue={150} online />
          <Card name="Billing" line="Paid calls over x402" hue={30} />
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', marginLeft: 12, color: '#6B6863', fontSize: 24, lineHeight: 1.5 }}>
            <span>Profiles · track records</span>
            <span>Connections · payments</span>
            <span style={{ color: BLUE, fontWeight: 700 }}>Open source · A2A</span>
          </div>
        </div>
      </div>
    ),
    size,
  )
}
