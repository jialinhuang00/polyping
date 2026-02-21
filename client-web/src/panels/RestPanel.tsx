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
    <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
      <h2 className="text-lg font-semibold mb-1">REST</h2>
      <p className="text-sm text-gray-500 mb-4">GET /rest/ping</p>
      <button
        onClick={sendPing}
        disabled={loading}
        className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 rounded text-sm font-medium mb-4"
      >
        {loading ? 'Sending...' : 'Send Ping'}
      </button>
      <div className="bg-gray-950 rounded p-3 h-32 overflow-y-auto font-mono text-sm">
        {logs.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    </div>
  )
}
