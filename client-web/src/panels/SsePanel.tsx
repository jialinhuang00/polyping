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
      setLogs((prev) => [...prev, '-- disconnected'])
      return
    }

    const es = new EventSource('/sse/ping')
    sourceRef.current = es
    setConnected(true)
    setLogs((prev) => [...prev, '-- connected'])

    es.onmessage = (e) => {
      setLogs((prev) => [...prev, `< ${e.data}`])
    }
    es.onerror = () => {
      setLogs((prev) => [...prev, '! connection error'])
      es.close()
      sourceRef.current = null
      setConnected(false)
    }
  }

  return (
    <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
      <h2 className="text-lg font-semibold mb-1">SSE</h2>
      <p className="text-sm text-gray-500 mb-4">GET /sse/ping (stream)</p>
      <button
        onClick={toggle}
        className={`${connected ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'} px-4 py-2 rounded text-sm font-medium mb-4`}
      >
        {connected ? 'Disconnect' : 'Connect'}
      </button>
      <div className="bg-gray-950 rounded p-3 h-32 overflow-y-auto font-mono text-sm">
        {logs.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    </div>
  )
}
