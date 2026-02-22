export default function GrpcPanel() {
  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">gRPC</h2>
        <span className="badge-btn badge-disabled">RPC PingService.Ping</span>
      </div>
      <div className="hint">
        <p>gRPC runs on HTTP/2, but browsers don't expose frame-level control.</p>
        <p>fetch/XHR are too high-level -- no trailer headers, no binary framing, no stream management.</p>
        <p>You'd need a gRPC-Web proxy (Envoy) to translate. This project skips that.</p>
      </div>
      <div className="card-body">
        <code
          className="block text-xs rounded-md p-3 font-mono"
          style={{ background: 'var(--bg-code)', color: 'var(--fg-muted)' }}
        >
          go run client-go/grpc/main.go
        </code>
      </div>
    </div>
  )
}
