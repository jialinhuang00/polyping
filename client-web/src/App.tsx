import { useState, useEffect } from 'react'
import RestPanel from './panels/rest-panel'
import SsePanel from './panels/sse-panel'
import WsPanel from './panels/ws-panel'
import GrpcPanel from './panels/grpc-panel'
import LongPollPanel from './panels/long-poll-panel'

function ThemeToggle() {
  const [dark, setDark] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme')
      if (saved) return saved === 'dark'
      return window.matchMedia('(prefers-color-scheme: dark)').matches
    }
    return true
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])

  return (
    <button
      onClick={() => setDark(!dark)}
      className="inline-flex items-center justify-center rounded-md border px-3 py-1.5 text-sm transition-colors hover:opacity-80"
      style={{
        borderColor: 'var(--border)',
        color: 'var(--fg-muted)',
        background: 'var(--bg-card)',
      }}
    >
      {dark ? 'Light' : 'Dark'}
    </button>
  )
}

export default function App() {
  return (
    <div className="min-h-screen p-6 md:p-10" style={{ background: 'var(--bg)', color: 'var(--fg)' }}>
      <header className="max-w-5xl mx-auto mb-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">polyping</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--fg-muted)' }}>
              Browser can only do HTTP-based protocols. For gRPC, use client-go or client-cli.
            </p>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="max-w-5xl mx-auto space-y-4">
        {/* Row 1: REST + SSE side by side */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <RestPanel />
          <SsePanel />
        </div>

        {/* Row 2: WebSocket full width */}
        <WsPanel />

        {/* Row 3: gRPC + Long Polling side by side */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <GrpcPanel />
          <LongPollPanel />
        </div>
      </main>
    </div>
  )
}
