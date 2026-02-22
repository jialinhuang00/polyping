# Polyping

HTTP can only do one thing: client asks, server answers.

That's fine for loading a page. Not fine when the server has something to say and nobody asked. Stock prices changed. A build finished. A message arrived.

So people invented workarounds. Five of them ended up mattering. This project runs all five against the same server, same payload, same "ping" → "pong". One Go server, three clients (Go, CLI, browser). You send a ping, you see how each protocol actually behaves.

```
REST         → ask once, get once, done
Long Polling → ask once, server holds until it has something, then you ask again
SSE          → ask once, server never stops answering
WebSocket    → stop pretending it's HTTP, upgrade to a two-way connection
gRPC         → call a function, it crosses the network (HTTP/2 + protobuf)
```

The chain: polling wastes bandwidth → long polling fixes that but reconnects every time → SSE keeps the connection open but is one-way → WebSocket goes two-way but needs a protocol upgrade → gRPC skips HTTP semantics entirely.

| Method | Endpoint | What it does here |
|--------|----------|-------------------|
| REST | GET /rest/ping | Returns `{"message":"pong"}`. Connection closes. |
| SSE | GET /sse/ping | Streams a fake CI build log. Content-Type: text/event-stream. Connection stays open until build finishes. |
| WebSocket | WS /ws/ping | Upgrades to WebSocket. Server pushes 2330.TW stock prices every second. |
| gRPC | PingService.Ping | Protobuf over HTTP/2. Feels like `ping()` → `"pong"`. Browser can't call it directly. |
| Long Polling | GET /poll/ping | Server holds the response. Won't reply until there's data. Client must re-request after each response. |

---

## Quick Start

Server first, then pick any client.

### 1. Start the server

```bash
go run server/main.go
```

Server listens on :8080 (HTTP) and :50051 (gRPC). All 5 patterns run in one process.

### 2. Pick a client

You have three clients. They all talk to the same server.

**client-go** -- 5 standalone programs, one per pattern:

```bash
go run client-go/rest/main.go        # prints "pong", exits
go run client-go/sse/main.go         # streams build log, ends when build finishes
go run client-go/ws/main.go          # streams 2330 prices, Ctrl+C to stop
go run client-go/grpc/main.go        # prints "pong", exits
go run client-go/longpoll/main.go    # loops: waits for event, prints, re-polls
```

**client-cli** -- one binary, `--mode` flag switches pattern:

```bash
go run client-cli/main.go --mode rest
go run client-cli/main.go --mode sse
go run client-cli/main.go --mode ws
go run client-cli/main.go --mode grpc
go run client-cli/main.go --mode longpoll
```

Same code as client-go, packaged in one file.

**client-web** -- React UI with a panel for each pattern:

```bash
cd client-web && npm run dev
```

Open `http://localhost:5173`. Each panel has its own connect/send button. Vite proxies all requests to the Go server on :8080.

**HTTPS (optional)** -- enables HTTP/2 in the browser:

```bash
brew install mkcert
mkcert -install
cd client-web
mkdir -p .certs
mkcert -cert-file .certs/localhost.pem -key-file .certs/localhost-key.pem localhost 127.0.0.1
npm run dev   # now serves https://localhost:5173
```

With TLS, static assets serve over HTTP/2. WebSocket still falls back to HTTP/1.1 (Vite doesn't implement RFC 8441). Remove or rename `.certs/` to go back to HTTP.

### 3. Testing checklist

Run the server, then verify each pattern:

| Pattern | What to do | What you should see |
|---------|-----------|-------------------|
| REST | `go run client-go/rest/main.go` | Prints `pong` and exits |
| SSE | `go run client-go/sse/main.go` | Build steps appear one by one, stream ends |
| WebSocket | `go run client-go/ws/main.go` | OHLC price table updates every second |
| gRPC | `go run client-go/grpc/main.go` | Prints `pong` and exits |
| Long Polling | `go run client-go/longpoll/main.go` | Waits 1-8s, prints event, waits again |

For long polling, you can also trigger events manually:

```bash
curl -X POST localhost:8080/poll/send
```

For the web client, open the browser console's Network tab to watch requests go pending (long polling) or stay open (SSE, WebSocket).

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

One HTTP response that never ends. Client opens with `EventSource`. Server responds with `Content-Type: text/event-stream` -- that's the only Content-Type SSE uses. Then it keeps writing, and the connection stays open.

Here, it streams a simulated CI build log. Each step appears as it "completes," with random delays.

**How the server handles it**:

```go
for _, step := range buildSteps {
    fmt.Fprintf(w, "data: %s\n\n", step)
    flusher.Flush()
    time.Sleep(randomDelay)
}
```

A loop that writes each build step to the response body and flushes. The connection stays open until all steps finish or the client disconnects.

**Web**: Click "Start Build". Steps appear one by one. Green text when complete. Click "Cancel" to disconnect mid-build.

**Go client**: Prints each step with a timestamp. Stream ends when the build finishes.

```
[11:30:01] cloning repository...
[11:30:02] installing dependencies...
[11:30:04] compiling src/main.go...
[11:30:05] running tests... 14 passed, 0 failed
[11:30:07] build #42 complete
```

**Web vs Go client -- the disconnect difference**:

The browser's `EventSource` API sends a proper close signal when you call `.close()`. The server's `r.Context().Done()` fires immediately.

The Go client has no such API. It just calls `resp.Body.Close()`. From the server's perspective, the next `Flush()` fails and the handler returns. Same result, but the mechanism is different: browser sends an explicit signal, Go just drops the TCP connection.

Another difference: `EventSource` auto-reconnects if the connection drops. The Go client doesn't -- you'd have to build that retry loop yourself.

### WebSocket

Starts as HTTP/1.1, then upgrades. After the `101 Switching Protocols` response, it's not HTTP anymore. Different protocol, different framing, two-way.

HTTP/2 has its own mechanism (RFC 8441, uses CONNECT instead of Upgrade), but almost nobody implements it. Browsers, Vite, Go's standard library -- all fall back to HTTP/1.1 for the WebSocket handshake.

Here, server streams simulated 2330.TW (TSMC) stock prices every second.

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

Feels like a local function call. Actually crosses the network over HTTP/2 with binary protobuf frames. Browsers can't call gRPC directly -- they expose HTTP/2 for normal requests, but gRPC needs low-level frame control the browser API doesn't provide. You'd need a gRPC-Web proxy (Envoy) in between.

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

The Go client calls `localhost:50051` directly. The browser can't. The web panel just shows the CLI command instead.

With REST, you wire up routes, parse JSON, handle errors yourself. With gRPC, `protoc` generates the client stub and server interface from your `.proto` file. Type-safe, binary, fast. The trade-off: harder to use from browsers.

### Long Polling

Not a protocol. Just a hack on plain HTTP.

Client sends GET. Server doesn't respond. It holds the connection, waiting for something to happen. Could be 1 second, could be 30. When it finally has data, it responds. Connection closes. Client code must send a new request to keep listening -- there's no auto-reconnect, you write that loop yourself.

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

## Future

These five cover the mainstream. Everything else is either a variant or a niche protocol.

**Worth adding:**

- **WebTransport** — the real successor to WebSocket. Runs on HTTP/3 (QUIC). Supports multiple streams and unreliable datagrams (UDP-like). Good for games, video, anything latency-sensitive. Browser support still early.
- **GraphQL Subscriptions** — usually WebSocket underneath, but with GraphQL query semantics on top. Would show how a higher-level abstraction wraps a lower-level transport.

**Probably not, but interesting:**

- **Socket.IO** — not a protocol. A library that starts with long polling, then auto-upgrades to WebSocket. Adds rooms, reconnection, broadcasting. Would blur the line between transport and framework.
- **MQTT** — pub/sub protocol for IoT. Lightweight, runs on TCP. Sensors reporting temperature every second. Different world from HTTP.
- **AMQP** — message queue protocol (RabbitMQ). Not client-to-server, but client-to-broker-to-consumer. Different architecture entirely.

| | client-web | client-go | client-cli |
|---|---|---|---|
| WebTransport | Browser has native API | quic-go library | Same |
| GraphQL Subscriptions | WebSocket underneath | graphql client library | Same |
| Socket.IO | Built for browsers | Go Socket.IO client exists | Same |
| MQTT | MQTT over WebSocket only | paho.mqtt.golang on raw TCP | Same |
| AMQP | Not possible. Browser can't reach TCP. Needs WebSocket proxy. | amqp091-go | Same |

**Dead:**

- **HTTP/2 Server Push** — server could push resources before the browser asked. Chrome removed support in 2022. Nobody used it right.

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
