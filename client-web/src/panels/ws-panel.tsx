import { useState, useRef } from 'react'

interface Tick {
  symbol: string
  open: number
  high: number
  low: number
  close: number
  time: string
}

export default function WsPanel() {
  const [connected, setConnected] = useState(false)
  const [tick, setTick] = useState<Tick | null>(null)
  const [flash, setFlash] = useState<'up' | 'down' | null>(null)
  const [history, setHistory] = useState<Tick[]>([])
  const wsRef = useRef<WebSocket | null>(null)
  const prevCloseRef = useRef<number | null>(null)

  function toggle() {
    if (connected && wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
      setConnected(false)
      return
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/ping`)
    wsRef.current = ws

    ws.onopen = () => setConnected(true)

    ws.onmessage = (e) => {
      const t: Tick = JSON.parse(e.data)
      setTick(t)
      setHistory((prev) => [...prev.slice(-49), t])

      const prev = prevCloseRef.current
      if (prev !== null) {
        if (t.close > prev) setFlash('up')
        else if (t.close < prev) setFlash('down')
        else setFlash(null)
      }
      prevCloseRef.current = t.close
      setTimeout(() => setFlash(null), 600)
    }

    ws.onclose = () => {
      setConnected(false)
      wsRef.current = null
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">WebSocket / 2330.TW</h2>
        <button onClick={toggle} className="badge-btn">
          {connected ? 'Disconnect' : 'WS /ws/ping'}
        </button>
      </div>

      {tick && (
        <div
          className="mx-4 mt-2 rounded-md p-4 transition-colors duration-300"
          style={{
            background: flash === 'up'
              ? 'color-mix(in srgb, var(--status-up) 12%, var(--bg-card))'
              : flash === 'down'
                ? 'color-mix(in srgb, var(--status-down) 12%, var(--bg-card))'
                : 'var(--bg-muted)',
          }}
        >
          <div className="flex items-baseline gap-3 mb-3">
            <span className="text-2xl font-semibold font-mono">{tick.close.toFixed(2)}</span>
            <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>{tick.time}</span>
            {flash === 'up' && <span style={{ color: 'var(--status-up)' }}>+</span>}
            {flash === 'down' && <span style={{ color: 'var(--status-down)' }}>-</span>}
          </div>
          <div className="grid grid-cols-4 gap-4 text-sm font-mono">
            <div>
              <span className="block text-xs" style={{ color: 'var(--fg-muted)' }}>Open</span>
              {tick.open.toFixed(2)}
            </div>
            <div>
              <span className="block text-xs" style={{ color: 'var(--fg-muted)' }}>High</span>
              <span style={{ color: 'var(--status-up)' }}>{tick.high.toFixed(2)}</span>
            </div>
            <div>
              <span className="block text-xs" style={{ color: 'var(--fg-muted)' }}>Low</span>
              <span style={{ color: 'var(--status-down)' }}>{tick.low.toFixed(2)}</span>
            </div>
            <div>
              <span className="block text-xs" style={{ color: 'var(--fg-muted)' }}>Close</span>
              {tick.close.toFixed(2)}
            </div>
          </div>
        </div>
      )}

      <div className="card-body">
        <div
          className="rounded-md p-3 h-48 overflow-y-auto font-mono text-xs"
          style={{ background: 'var(--bg-code)' }}
        >
          <div
            className="grid grid-cols-5 gap-2 mb-1 sticky top-0 text-xs font-medium"
            style={{ color: 'var(--fg-muted)', background: 'var(--bg-code)' }}
          >
            <span>TIME</span>
            <span>OPEN</span>
            <span>HIGH</span>
            <span>LOW</span>
            <span>CLOSE</span>
          </div>
          {history.map((t, i) => {
            const prev = i > 0 ? history[i - 1].close : null
            const color =
              prev === null
                ? undefined
                : t.close > prev
                  ? 'var(--status-up)'
                  : t.close < prev
                    ? 'var(--status-down)'
                    : undefined
            return (
              <div key={i} className="grid grid-cols-5 gap-2" style={color ? { color } : undefined}>
                <span>{t.time}</span>
                <span>{t.open.toFixed(2)}</span>
                <span>{t.high.toFixed(2)}</span>
                <span>{t.low.toFixed(2)}</span>
                <span>{t.close.toFixed(2)}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
