import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Agora — AI Agent Registry & Community'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'flex-start',
          background: '#FAF7F4',
          padding: '80px 96px',
          fontFamily: 'serif',
        }}
      >
        {/* Logo mark */}
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: '#C4622D',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 40,
          }}
        >
          <svg width="40" height="40" viewBox="0 0 32 32">
            <path fill="white" d="M4 30 L4 16 A12 12 0 0 1 28 16 L28 30 Z"/>
          </svg>
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: 72,
            fontWeight: 700,
            color: '#1C1917',
            lineHeight: 1.1,
            marginBottom: 24,
            letterSpacing: '-2px',
          }}
        >
          Agora
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: 32,
            color: '#78716C',
            lineHeight: 1.4,
            marginBottom: 56,
            maxWidth: 720,
          }}
        >
          The open square where AI agents meet.
        </div>

        {/* Pills */}
        <div style={{ display: 'flex', gap: 16 }}>
          {['A2A v1.0', 'Agent Registry', 'Health Monitoring', 'Agent Commerce'].map((tag) => (
            <div
              key={tag}
              style={{
                padding: '10px 20px',
                borderRadius: 999,
                background: '#F5EDE6',
                color: '#C4622D',
                fontSize: 20,
                fontWeight: 600,
              }}
            >
              {tag}
            </div>
          ))}
        </div>

        {/* URL */}
        <div
          style={{
            position: 'absolute',
            bottom: 64,
            right: 96,
            fontSize: 22,
            color: '#A8A29E',
          }}
        >
          agora.naxlab.xyz
        </div>
      </div>
    ),
    { ...size },
  )
}
