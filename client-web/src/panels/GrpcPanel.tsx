import { useState } from 'react'

export default function GrpcPanel() {
  const [logs, setLogs] = useState<string[]>([])

  return (
    <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
      <h2 className="text-lg font-semibold mb-1">gRPC</h2>
      <p className="text-sm text-gray-500 mb-4">RPC PingService.Ping</p>
      <button
        disabled
        className="bg-gray-700 px-4 py-2 rounded text-sm font-medium mb-4 opacity-50 cursor-not-allowed"
      >
        CLI only
      </button>
      <p className="text-xs text-gray-500 mb-2">
        gRPC uses HTTP/2 binary frames. Use the Go client instead:
      </p>
      <code className="text-xs text-gray-400 block bg-gray-950 rounded p-3">
        go run client-go/grpc/main.go
      </code>
      <div className="bg-gray-950 rounded p-3 h-16 overflow-y-auto font-mono text-sm mt-3">
        {logs.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    </div>
  )
}
