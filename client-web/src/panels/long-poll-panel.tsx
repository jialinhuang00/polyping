import { useState, useRef } from 'react'

export default function LongPollPanel() {
  const [logs, setLogs] = useState<string[]>([])
  const [waiting, setWaiting] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  async function poll() {
    setWaiting(true)
    setLogs((prev) => [...prev, '> waiting for server event...'])
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const res = await fetch('/poll/ping', { signal: controller.signal })
      const data = await res.json()
      setLogs((prev) => [...prev, `< [${data.event}] ${data.message}`])
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setLogs((prev) => [...prev, `! error: ${err}`])
      }
    }
    setWaiting(false)
    abortRef.current = null
  }

  function cancel() {
    abortRef.current?.abort()
    setLogs((prev) => [...prev, 'cancelled'])
  }

  async function sendEvent() {
    if (!waiting) {
      setLogs((prev) => [...prev, '! no client polling, click Start Polling first'])
      return
    }
    await fetch('/poll/send', { method: 'POST' })
    setLogs((prev) => [...prev, '(triggered server event)'])
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">Long Polling</h2>
        <div className="flex gap-2">
          <button onClick={waiting ? cancel : poll} className="badge-btn">
            {waiting ? 'Cancel' : 'GET /poll/ping'}
          </button>
          <button onClick={sendEvent} className="badge-btn">
            Trigger Event
          </button>
        </div>
      </div>
      <div className="hint">
        <p>Server holds the response. Won't reply until there's data.</p>
        <p>Trigger Event manually pokes the server so you don't wait 30s.</p>
        <p>After each response, client code must send a new request to keep listening.</p>
        <p>Not a new protocol, just a hack on plain HTTP.</p>
        <p>Web intentionally doesn't auto-loop, so you feel each request is independent. CLI version auto-loops.</p>
      </div>
      <div className="card-body">
        <div className="log-area">
          {logs.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      </div>
    </div>
  )
}
