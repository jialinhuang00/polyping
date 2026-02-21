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
    setLogs((prev) => [...prev, '-- cancelled'])
  }

  async function sendEvent() {
    await fetch('/poll/send', { method: 'POST' })
    setLogs((prev) => [...prev, '(triggered server event)'])
  }

  return (
    <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
      <h2 className="text-lg font-semibold mb-1">Long Polling</h2>
      <p className="text-sm text-gray-500 mb-4">GET /poll/ping (holds until event)</p>
      <div className="flex gap-2 mb-4">
        {waiting ? (
          <button
            onClick={cancel}
            className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded text-sm font-medium"
          >
            Cancel
          </button>
        ) : (
          <button
            onClick={poll}
            className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded text-sm font-medium"
          >
            Start Polling
          </button>
        )}
        <button
          onClick={sendEvent}
          className="bg-yellow-600 hover:bg-yellow-700 px-4 py-2 rounded text-sm font-medium"
        >
          Trigger Event
        </button>
      </div>
      <div className="bg-gray-950 rounded p-3 h-32 overflow-y-auto font-mono text-sm">
        {logs.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    </div>
  )
}
