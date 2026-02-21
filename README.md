# Polyping

5 ways to send "ping" and get "pong". Same result, different transport.

| Method | Endpoint | How it works |
|--------|----------|-------------|
| REST | GET /rest/ping | Request-response. One ping, one pong. |
| SSE | GET /sse/ping | Server pushes "pong" every second. |
| WebSocket | WS /ws/ping | Bidirectional. Send "ping", get "pong". |
| gRPC | PingService.Ping | Binary protocol over HTTP/2. |
| Long Polling | GET /poll/ping | Server holds 3 seconds, then responds. |

---

## Quick Start

```bash
# Terminal 1: start server
cd server && go run main.go

# Terminal 2: test each method
go run client-go/rest/main.go
go run client-go/sse/main.go
go run client-go/ws/main.go
go run client-go/grpc/main.go
go run client-go/longpoll/main.go

# Or use the CLI
go run client-cli/main.go --mode rest

# Terminal 3: web UI
cd client-web && npm run dev
```

Server listens on :8080 (HTTP) and :50051 (gRPC).

---

## Protobuf: What's Handwritten vs Codegen

You write one file. The toolchain generates the rest.

### You write this (by hand)

`proto/ping.proto` -- the contract between client and server:

```protobuf
syntax = "proto3";
package ping;
option go_package = "polyping/proto/pingpb";

service PingService {
  rpc Ping (PingRequest) returns (PingResponse);
}
message PingRequest { string message = 1; }
message PingResponse { string message = 1; }
```

That's it. 8 lines. Everything else is generated.

### The toolchain generates these

```
proto/pingpb/
  ping.pb.go         # message structs, serialization code
  ping_grpc.pb.go    # client stub + server interface
```

`ping.pb.go` gives you `PingRequest` and `PingResponse` as Go structs.
`ping_grpc.pb.go` gives you `PingServiceClient` (for calling) and `PingServiceServer` (for implementing).

### The command

```bash
protoc \
  --go_out=. --go_opt=paths=source_relative \
  --go-grpc_out=. --go-grpc_opt=paths=source_relative \
  proto/ping.proto
```

What each flag does:

| Flag | What it does |
|------|-------------|
| `--go_out=.` | Generate message code (`ping.pb.go`) |
| `--go-grpc_out=.` | Generate service code (`ping_grpc.pb.go`) |
| `paths=source_relative` | Put output next to the `.proto` file |

### Prerequisites

Three tools need to be installed before `protoc` works:

```bash
# 1. The protobuf compiler
brew install protobuf

# 2. Go code generator for messages
go install google.golang.org/protobuf/cmd/protoc-gen-go@latest

# 3. Go code generator for gRPC services
go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest
```

`protoc` is the compiler. It reads `.proto` files but doesn't know Go.
`protoc-gen-go` teaches it to output Go structs.
`protoc-gen-go-grpc` teaches it to output gRPC client/server code.

Without all three, the command fails silently or with cryptic errors.

---

## Project Structure

```
polyping/
├── server/main.go           # all endpoints, one process
├── client-go/               # 5 standalone Go clients
│   ├── rest/main.go
│   ├── sse/main.go
│   ├── ws/main.go
│   ├── grpc/main.go
│   └── longpoll/main.go
├── client-cli/main.go       # one binary, --mode flag
├── client-web/              # React + Vite + Tailwind
│   └── src/panels/          # one panel per method
├── proto/
│   ├── ping.proto           # you write this
│   └── pingpb/              # generated code lives here
│       ├── ping.pb.go
│       └── ping_grpc.pb.go
└── go.mod
```
