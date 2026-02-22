import { useState } from 'react'

export default function RestPanel() {
  const [logs, setLogs] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  async function sendPing() {
    setLoading(true)
    try {
      const res = await fetch('/rest/ping')
      const data = await res.json()
      setLogs((prev) => [...prev, `< ${data.message}`])
    } catch (err) {
      setLogs((prev) => [...prev, `! error: ${err}`])
    }
    setLoading(false)
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">REST</h2>
        <button onClick={sendPing} disabled={loading} className="badge-btn">
          {loading ? 'Sending...' : 'GET /rest/ping'}
        </button>
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
