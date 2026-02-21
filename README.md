# Polyping

5 ways to send "ping" and get "pong". Same result, different transport.

| Method | Endpoint | How it works |
|--------|----------|-------------|
| REST | GET /rest/ping | Request-response. One ping, one pong. |
| SSE | GET /sse/ping | Server pushes "pong" every second. Client just listens. |
| WebSocket | WS /ws/ping | One connection stays open. Server streams 2330.TW stock prices. |
| gRPC | PingService.Ping | Feels like a function call. Actually crosses the network. |
| Long Polling | GET /poll/ping | Server holds until an event happens, then responds. Client re-requests. |

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

## How Each Pattern Works

### REST

The simplest one. Client sends a request, server sends a response, connection closes. Every interaction is independent.

**Web**: Click "Send Ping". `fetch('/rest/ping')` fires, response shows in the log.

**Go client**: `http.Get(...)`, read JSON, print. One shot, exits.

Same thing. Both use HTTP GET. Both get JSON back. The only difference is one runs in a browser, the other in a terminal.

### SSE (Server-Sent Events)

Client opens one HTTP connection. Server never closes it. It keeps writing `data: pong\n\n` down the wire every second. The client doesn't talk back -- it just listens.

**Web**: Click "Connect". Browser opens an `EventSource`. Messages appear in the log, one per second. Click "Disconnect" to close.

**Go client**: `http.Get(...)` returns a response body that never ends. `bufio.Scanner` reads it line by line. Each `Scan()` blocks until the next line arrives. Prints `server -> pong (20:30:08)` with timestamps.

Browser has `EventSource` with auto-reconnect built in. Go has nothing -- you read the body with a scanner. Same stream, different API.

### WebSocket

Starts as HTTP, upgrades to a persistent TCP connection. Both sides can send at any time. Server streams simulated 2330.TW (TSMC) stock prices -- open, high, low, close every second.

**Web**: Click "Connect". Prices appear in a live dashboard. Close goes up, background flashes red. Close goes down, flashes green. History table scrolls with every tick. Click "Disconnect" to close.

**Go client**: Connects, prints an OHLC table. Each row shows the price and an arrow.

```
TIME       OPEN       HIGH       LOW        CLOSE
---------------------------------------------------
22:15:03   603.21     605.89     601.44     604.73   ▲
22:15:04   604.73     606.11     602.88     602.88   ▼
```

Same data from the same server. The web client makes it visual. The Go client keeps it tabular.

Key difference from SSE: the client can also send data back on the same connection. SSE is one-way. WebSocket is two-way.

### gRPC

Feels like a local function call. Actually crosses the network.

```go
resp, err := client.Ping(ctx, &PingRequest{Message: "ping"})
fmt.Println(resp.Message) // "pong"
```

What actually happens under the hood:

1. gRPC serializes `PingRequest` into protobuf bytes
2. Sends over HTTP/2 to `localhost:50051`
3. Server deserializes back into a Go struct
4. Your `Ping` method runs, returns `PingResponse`
5. Serializes, sends back over HTTP/2
6. Client deserializes, you get `resp.Message = "pong"`

**Web**: Can't call gRPC directly from a browser. gRPC uses HTTP/2 binary frames that browsers don't expose. The panel shows the CLI command instead.

**Go client**: `grpc.NewClient(...)`, call `client.Ping(...)`, print result. One shot, exits.

With REST, you wire up routes, parse JSON, handle errors yourself. With gRPC, `protoc` generates the client stub and server interface from your `.proto` file. Type-safe, binary, fast.

### Long Polling

Client sends a request. Server doesn't respond. It holds the connection and waits. When an event happens -- could be 1 second, could be 20 seconds -- server finally responds. Client gets the answer, connection closes. Client immediately sends another request. Waits again.

**Web**: Click "Start Polling". The request goes pending -- you can see it spinning. An event arrives (random 1-8s), the log shows `[auto] build #37 passed`. Or click "Trigger Event" to fire one manually. You have to click again to poll the next event.

**Go client**: Runs a `for` loop. Each iteration sends `http.Get(...)`, blocks until server responds, prints the event, then loops and sends another request. Looks continuous, but it's not -- each loop is a new HTTP connection.

**Why the difference?** The Go client auto-loops because it's a demo that runs until you Ctrl+C. The web client makes you click each time so you can see the request go pending, watch it hang, and feel the moment the server finally responds. If it auto-looped, it would look identical to SSE -- the whole point is to see each request-response cycle happen one at a time.

```
[1] waiting...
[1] server -> [auto] order #4821 payment confirmed  (22:07:51)
[2] waiting...
[2] server -> [auto] build #37 passed  (22:08:04)
```

It looks like the client is "always connected." It's not. Each `waiting -> responded` pair is a separate HTTP connection. Server log confirms it:

```
22:07:43 [longpoll] client waiting...      <- connection 1
22:07:51 [longpoll] responded after 8s     <- connection 1 ends
22:07:51 [longpoll] client waiting...      <- connection 2 (new)
```

This is the oldest trick in the book. Facebook's first Messenger used it. Works everywhere -- no special protocol needed, just plain HTTP.

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
