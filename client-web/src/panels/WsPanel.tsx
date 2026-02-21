import { useState, useRef, useEffect } from 'react'

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
  const historyEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history])

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
        if (t.close > prev) {
          setFlash('up')
        } else if (t.close < prev) {
          setFlash('down')
        } else {
          setFlash(null)
        }
      }
      prevCloseRef.current = t.close

      setTimeout(() => setFlash(null), 600)
    }

    ws.onclose = () => {
      setConnected(false)
      wsRef.current = null
    }
  }

  const flashClass =
    flash === 'up'
      ? 'bg-red-900/60 transition-colors duration-300'
      : flash === 'down'
        ? 'bg-green-900/60 transition-colors duration-300'
        : 'transition-colors duration-300'

  return (
    <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 col-span-1 md:col-span-2 lg:col-span-3">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">WebSocket -- 2330.TW</h2>
          <p className="text-sm text-gray-500">WS /ws/ping (realtime price stream)</p>
        </div>
        <button
          onClick={toggle}
          className={`${connected ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'} px-4 py-2 rounded text-sm font-medium`}
        >
          {connected ? 'Disconnect' : 'Connect'}
        </button>
      </div>

      {tick && (
        <div className={`rounded-lg p-4 mb-4 ${flashClass}`}>
          <div className="flex items-baseline gap-4 mb-3">
            <span className="text-3xl font-bold font-mono">
              {tick.close.toFixed(2)}
            </span>
            <span className="text-sm text-gray-400">{tick.time}</span>
            {flash === 'up' && <span className="text-red-400 text-lg">▲</span>}
            {flash === 'down' && <span className="text-green-400 text-lg">▼</span>}
          </div>
          <div className="grid grid-cols-4 gap-4 text-sm font-mono">
            <div>
              <span className="text-gray-500 block">Open</span>
              {tick.open.toFixed(2)}
            </div>
            <div>
              <span className="text-gray-500 block">High</span>
              <span className="text-red-400">{tick.high.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-gray-500 block">Low</span>
              <span className="text-green-400">{tick.low.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-gray-500 block">Close</span>
              {tick.close.toFixed(2)}
            </div>
          </div>
        </div>
      )}

      <div className="bg-gray-950 rounded p-3 h-48 overflow-y-auto font-mono text-xs">
        <div className="grid grid-cols-5 gap-2 text-gray-500 mb-1 sticky top-0 bg-gray-950">
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
              ? 'text-gray-300'
              : t.close > prev
                ? 'text-red-400'
                : t.close < prev
                  ? 'text-green-400'
                  : 'text-gray-300'
          return (
            <div key={i} className={`grid grid-cols-5 gap-2 ${color}`}>
              <span>{t.time}</span>
              <span>{t.open.toFixed(2)}</span>
              <span>{t.high.toFixed(2)}</span>
              <span>{t.low.toFixed(2)}</span>
              <span>{t.close.toFixed(2)}</span>
            </div>
          )
        })}
        <div ref={historyEndRef} />
      </div>
    </div>
  )
}
