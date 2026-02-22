package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"math/rand"
	"net"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
	"google.golang.org/grpc"

	pb "polyping/proto/pingpb"
)

// gRPC server

type pingServer struct {
	pb.UnimplementedPingServiceServer
}

func (s *pingServer) Ping(ctx context.Context, req *pb.PingRequest) (*pb.PingResponse, error) {
	log.Printf("[grpc] received: %s", req.Message)
	return &pb.PingResponse{Message: "pong"}, nil
}

// HTTP handlers

func restHandler(w http.ResponseWriter, r *http.Request) {
	log.Println("[rest] ping received")
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "pong"})
}

var buildSteps = []string{
	"cloning repository...",
	"installing dependencies...",
	"compiling src/main.go...",
	"compiling src/handler.go...",
	"compiling src/middleware.go...",
	"running tests... 14 passed, 0 failed",
	"building docker image...",
	"pushing to registry...",
	"deploying to staging...",
	"health check passed",
	"build #42 complete",
}

func sseHandler(w http.ResponseWriter, r *http.Request) {
	log.Println("[sse] client connected")
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	for _, step := range buildSteps {
		select {
		case <-r.Context().Done():
			log.Println("[sse] client disconnected")
			return
		default:
			log.Printf("[sse] pushing: %s", step)
			fmt.Fprintf(w, "data: %s\n\n", step)
			flusher.Flush()
			delay := time.Duration(500+rand.Intn(2000)) * time.Millisecond
			time.Sleep(delay)
		}
	}
	log.Println("[sse] build stream finished")
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type tick struct {
	Symbol string  `json:"symbol"`
	Open   float64 `json:"open"`
	High   float64 `json:"high"`
	Low    float64 `json:"low"`
	Close  float64 `json:"close"`
	Time   string  `json:"time"`
}

func wsHandler(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[ws] upgrade error: %v", err)
		return
	}
	defer conn.Close()
	log.Println("[ws] client connected — streaming 2330 prices")

	// read goroutine: detects client close frame
	done := make(chan struct{})
	go func() {
		defer close(done)
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
		}
	}()

	price := 1800.0 + rand.Float64()*30 // start around 1800~1830

	for {
		select {
		case <-done:
			log.Println("[ws] client disconnected")
			return
		default:
		}
		// simulate OHLC candle
		open := price
		change1 := (rand.Float64() - 0.5) * 6
		change2 := (rand.Float64() - 0.5) * 6
		change3 := (rand.Float64() - 0.5) * 6
		prices := []float64{open, open + change1, open + change2, open + change3}

		high, low := prices[0], prices[0]
		for _, p := range prices {
			if p > high {
				high = p
			}
			if p < low {
				low = p
			}
		}
		close := prices[3]
		price = close // next candle opens here

		t := tick{
			Symbol: "2330",
			Open:   math.Round(open*100) / 100,
			High:   math.Round(high*100) / 100,
			Low:    math.Round(low*100) / 100,
			Close:  math.Round(close*100) / 100,
			Time:   time.Now().Format("15:04:05"),
		}

		data, _ := json.Marshal(t)
		if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
			log.Println("[ws] client disconnected")
			return
		}
		log.Printf("[ws] 2330 close=%.2f", t.Close)
		time.Sleep(1 * time.Second)
	}
}

var longPollCh = make(chan string, 1)

func longPollHandler(w http.ResponseWriter, r *http.Request) {
	log.Println("[longpoll] client waiting...")

	// simulate: event arrives after 1~8 seconds randomly
	delay := time.Duration(1+rand.Intn(8)) * time.Second

	events := []string{
		"user lin joined the room",
		"order #4821 payment confirmed",
		"build #37 passed",
		"sensor-12 temperature alert: 78°C",
		"deployment v2.3.1 rolled out",
	}

	select {
	case msg := <-longPollCh:
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"event": "manual", "message": msg})
		log.Printf("[longpoll] responded (manual trigger): %s", msg)
	case <-time.After(delay):
		event := events[rand.Intn(len(events))]
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"event": "auto", "message": event})
		log.Printf("[longpoll] responded after %s: %s", delay, event)
	case <-r.Context().Done():
		log.Println("[longpoll] client disconnected")
	}
}

// POST /poll/send — simulate an event arriving
func longPollSendHandler(w http.ResponseWriter, r *http.Request) {
	select {
	case longPollCh <- "pong":
		log.Println("[longpoll] event sent")
		w.Write([]byte("sent"))
	default:
		log.Println("[longpoll] no client waiting")
		w.Write([]byte("no client waiting"))
	}
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func main() {
	// Start gRPC server
	go func() {
		lis, err := net.Listen("tcp", ":50051")
		if err != nil {
			log.Fatalf("failed to listen on :50051: %v", err)
		}
		s := grpc.NewServer()
		pb.RegisterPingServiceServer(s, &pingServer{})
		log.Println("gRPC server listening on :50051")
		if err := s.Serve(lis); err != nil {
			log.Fatalf("gRPC serve error: %v", err)
		}
	}()

	// HTTP routes
	mux := http.NewServeMux()
	mux.HandleFunc("/rest/ping", restHandler)
	mux.HandleFunc("/sse/ping", sseHandler)
	mux.HandleFunc("/ws/ping", wsHandler)
	mux.HandleFunc("/poll/ping", longPollHandler)
	mux.HandleFunc("/poll/send", longPollSendHandler)

	log.Println("HTTP server listening on :8080")
	if err := http.ListenAndServe(":8080", corsMiddleware(mux)); err != nil {
		log.Fatalf("HTTP serve error: %v", err)
	}
}
