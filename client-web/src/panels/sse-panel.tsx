import { useState, useRef } from 'react'

export default function SsePanel() {
  const [logs, setLogs] = useState<string[]>([])
  const [connected, setConnected] = useState(false)
  const sourceRef = useRef<EventSource | null>(null)

  function toggle() {
    if (connected && sourceRef.current) {
      sourceRef.current.close()
      sourceRef.current = null
      setConnected(false)
      setLogs((prev) => [...prev, 'disconnected'])
      return
    }

    const es = new EventSource('/sse/ping')
    sourceRef.current = es
    setConnected(true)
    setLogs(['build started'])

    es.onmessage = (e) => {
      setLogs((prev) => [...prev, e.data])
    }
    es.onerror = () => {
      setConnected(false)
      sourceRef.current?.close()
      sourceRef.current = null
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">SSE / Build Log</h2>
        <button onClick={toggle} className="badge-btn">
          {connected ? 'Cancel' : 'GET /sse/ping'}
        </button>
      </div>
      <div className="hint">
        <p>One HTTP response that never ends.</p>
        <p>Client opens with EventSource. Server responds with Content-Type: text/event-stream.</p>
        <p>Server keeps writing, connection stays open.</p>
      </div>
      <div className="card-body">
        <div className="log-area h-40">
          {logs.map((line, i) => {
            const isComplete = line.includes('complete')
            const isFail = line.startsWith('!')
            const color = isComplete
              ? 'var(--status-success)'
              : isFail
                ? 'var(--status-error)'
                : undefined
            return (
              <div key={i} style={color ? { color } : undefined}>
                {line}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
