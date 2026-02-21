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

## Web vs Go Client: Communication Differences

Both clients talk to the same server. Most of the time, the server can't tell them apart. But the disconnect and cancellation paths differ.

| Pattern | Web client | Go client |
|---------|-----------|-----------|
| REST | No difference. Both send HTTP GET, both get JSON back. | |
| SSE disconnect | `EventSource` sends explicit signal. Auto-reconnects on drop. | `resp.Body.Close()` drops TCP. No auto-reconnect. |
| WS close | Browser sends close frame (opcode 0x8). `onclose` callback fires. | `conn.Close()` sends the same close frame. You handle the error from `ReadMessage`. |
| WS server-side | Needs a reader goroutine to detect the close frame. Without it, server pushes forever. | Same. |
| Long Poll cancel | `AbortController` aborts pending request. Server's `r.Context().Done()` fires. | No cancel. Blocks on `http.Get(...)` until response. Ctrl+C kills the process. |
| gRPC | Browser can't call gRPC. Needs a gRPC-Web proxy (Envoy) in between. | Calls `localhost:50051` directly over HTTP/2. |

---

## How Each Pattern Works

### REST

Client sends GET. Server returns JSON. Connection closes. Next request, new connection.

**How the server handles it**:

```go
func restHandler(w http.ResponseWriter, r *http.Request) {
    json.NewEncoder(w).Encode(map[string]string{"message": "pong"})
}
```

One function. Stateless. No difference whether the request came from a browser or a Go binary.

**Web vs Go client**: Identical communication. Web uses `fetch('/rest/ping')`, Go uses `http.Get(...)`. Both send the same HTTP GET, both get the same JSON back. Server can't tell them apart.

### SSE (Server-Sent Events)

Client opens one HTTP connection. Server never closes it. It keeps writing `data: pong\n\n` down the wire every second. Client just listens.

**How the server handles it**:

```go
for {
    fmt.Fprintf(w, "data: pong\n\n")
    flusher.Flush()
    time.Sleep(1 * time.Second)
}
```

It's a loop that writes to the response body and flushes. The HTTP response never "finishes." The connection stays open until the client disconnects or the server crashes.

**Web vs Go client -- the disconnect difference**:

The browser's `EventSource` API sends a proper close signal when you call `.close()`. The server's `r.Context().Done()` fires immediately.

The Go client has no such API. It just calls `resp.Body.Close()`. From the server's perspective, the next `Flush()` fails and the handler returns. Same result, but the mechanism is different: browser sends an explicit signal, Go just drops the TCP connection.

Another difference: `EventSource` auto-reconnects if the connection drops. The Go client doesn't -- you'd have to build that retry loop yourself.

### WebSocket

Starts as HTTP, upgrades to a persistent TCP connection. Both sides can send at any time. Server streams simulated 2330.TW (TSMC) stock prices every second.

**How the server handles it**:

Server runs two goroutines per connection:

```go
// goroutine 1: reads (detects client disconnect)
go func() {
    for {
        if _, _, err := conn.ReadMessage(); err != nil {
            return  // client sent close frame
        }
    }
}()

// goroutine 2: writes (pushes prices)
for {
    conn.WriteMessage(websocket.TextMessage, priceJSON)
    time.Sleep(1 * time.Second)
}
```

The reader goroutine exists only to detect disconnect. Without it, the server keeps pushing into the void forever -- `WriteMessage` doesn't fail just because the client is gone. It needs someone reading to catch the close frame.

**Web vs Go client -- the close frame**:

When the browser calls `ws.close()`, it sends a WebSocket close frame (opcode 0x8). The server's reader goroutine receives it, `ReadMessage` returns an error, the `done` channel closes, and the writer loop stops.

The Go client (`gorilla/websocket`) does the same thing when you call `conn.Close()`. Same close frame, same protocol. The difference is what happens next: the browser's `onclose` callback fires automatically. In Go, you handle the error from `ReadMessage` yourself.

**Web vs Go client -- the display**:

Web shows a live dashboard: big price number, red/green flash on change, scrolling OHLC history table.

Go prints a table:

```
TIME       OPEN       HIGH       LOW        CLOSE
---------------------------------------------------
22:15:03   603.21     605.89     601.44     604.73   ▲
22:15:04   604.73     606.11     602.88     602.88   ▼
```

Same JSON from the same server. Same WebSocket connection. Different rendering.

Key difference from SSE: the client can also send data back on the same connection. SSE is one-way. WebSocket is two-way.

### gRPC

Feels like a local function call. Actually crosses the network.

```go
resp, err := client.Ping(ctx, &PingRequest{Message: "ping"})
fmt.Println(resp.Message) // "pong"
```

What actually happens:

1. gRPC serializes `PingRequest` into protobuf bytes
2. Sends over HTTP/2 to `localhost:50051`
3. Server deserializes back into a Go struct
4. Your `Ping` method runs, returns `PingResponse`
5. Serializes, sends back over HTTP/2
6. Client deserializes, you get `resp.Message = "pong"`

**Web vs Go client -- completely different**:

The Go client calls `localhost:50051` directly over HTTP/2 with binary protobuf frames.

The browser can't do this. Browsers expose HTTP/2 for normal requests, but gRPC needs low-level control over HTTP/2 frames that the browser API doesn't provide. You'd need a gRPC-Web proxy (like Envoy) sitting between the browser and the gRPC server, translating HTTP/1.1 into gRPC's HTTP/2 framing.

This project doesn't set up that proxy. The web panel just shows the CLI command instead.

With REST, you wire up routes, parse JSON, handle errors yourself. With gRPC, `protoc` generates the client stub and server interface from your `.proto` file. Type-safe, binary, fast. The trade-off: harder to use from browsers.

### Long Polling

Client sends GET. Server doesn't respond. It holds the connection, waiting for an event. Event arrives -- could be 1 second, could be 20 -- server responds. Connection closes. Client sends another GET. Waits again.

**How the server handles it**:

```go
select {
case msg := <-longPollCh:              // manual trigger arrived
    json.NewEncoder(w).Encode(msg)
case <-time.After(delay):              // random 1-8s, simulates a real event
    json.NewEncoder(w).Encode(event)
case <-r.Context().Done():             // client gave up
    return
}
```

Three things can end the wait: an event, a timeout, or the client disconnecting. Whichever happens first wins.

**Web vs Go client -- the re-poll difference**:

The Go client runs a `for` loop. Each iteration sends `http.Get(...)`, blocks until server responds, then immediately sends another. Looks continuous:

```
[1] waiting...
[1] server -> [auto] order #4821 payment confirmed  (22:07:51)
[2] waiting...
[2] server -> [auto] build #37 passed  (22:08:04)
```

But it's not one connection. Each `waiting -> responded` pair is a separate HTTP cycle. Server log proves it:

```
22:07:43 [longpoll] client waiting...      <- connection 1
22:07:51 [longpoll] responded after 8s     <- connection 1 ends
22:07:51 [longpoll] client waiting...      <- connection 2 (new)
```

The web client makes you click "Start Polling" each time. This is intentional. If it auto-looped, it would look identical to SSE. The point is to see the request go pending, watch it hang in the network tab, and feel the moment the server finally responds.

**Web vs Go client -- cancellation**:

The web client uses `AbortController` to cancel a pending request. Browser sends a signal, server's `r.Context().Done()` fires, handler returns. Clean.

The Go client has no cancel button. It blocks on `http.Get(...)` until the server responds. You stop it with Ctrl+C, which kills the whole process.

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
