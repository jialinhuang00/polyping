package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
	"google.golang.org/grpc"

	pb "polyping/proto/pingpb"

	"context"
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

	for {
		select {
		case <-r.Context().Done():
			log.Println("[sse] client disconnected")
			return
		default:
			log.Println("[sse] pushing pong")
			fmt.Fprintf(w, "data: pong\n\n")
			flusher.Flush()
			time.Sleep(1 * time.Second)
		}
	}
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func wsHandler(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[ws] upgrade error: %v", err)
		return
	}
	defer conn.Close()
	log.Println("[ws] client connected")

	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			log.Printf("[ws] read error: %v", err)
			return
		}
		log.Printf("[ws] received: %s", msg)
		if err := conn.WriteMessage(websocket.TextMessage, []byte("pong")); err != nil {
			log.Printf("[ws] write error: %v", err)
			return
		}
	}
}

func longPollHandler(w http.ResponseWriter, r *http.Request) {
	log.Println("[longpoll] holding connection...")
	time.Sleep(3 * time.Second)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "pong"})
	log.Println("[longpoll] responded")
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

	log.Println("HTTP server listening on :8080")
	if err := http.ListenAndServe(":8080", corsMiddleware(mux)); err != nil {
		log.Fatalf("HTTP serve error: %v", err)
	}
}
