package main

import (
	"bufio"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	pb "polyping/proto/pingpb"
)

func doRest() {
	resp, err := http.Get("http://localhost:8080/rest/ping")
	if err != nil {
		log.Fatal(err)
	}
	defer resp.Body.Close()
	var result map[string]string
	json.NewDecoder(resp.Body).Decode(&result)
	fmt.Println(result["message"])
}

func doSSE() {
	fmt.Println("connecting to build log stream...")
	resp, err := http.Get("http://localhost:8080/sse/ping")
	if err != nil {
		log.Fatal(err)
	}
	defer resp.Body.Close()
	fmt.Println("connected. watching build output.\n")
	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "data: ") {
			msg := strings.TrimPrefix(line, "data: ")
			fmt.Printf("[%s] %s\n", time.Now().Format("15:04:05"), msg)
		}
	}
	fmt.Println("\nbuild stream ended.")
}

type tick struct {
	Symbol string  `json:"symbol"`
	Open   float64 `json:"open"`
	High   float64 `json:"high"`
	Low    float64 `json:"low"`
	Close  float64 `json:"close"`
	Time   string  `json:"time"`
}

func doWS() {
	conn, _, err := websocket.DefaultDialer.Dial("ws://localhost:8080/ws/ping", nil)
	if err != nil {
		log.Fatal(err)
	}
	defer conn.Close()
	fmt.Println("connected. streaming 2330 prices. Ctrl+C to stop.")
	fmt.Printf("%-10s %-10s %-10s %-10s %-10s\n", "TIME", "OPEN", "HIGH", "LOW", "CLOSE")
	fmt.Println("---------------------------------------------------")

	var prev float64
	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			log.Fatal(err)
		}
		var t tick
		json.Unmarshal(msg, &t)
		arrow := "  "
		if prev > 0 {
			if t.Close > prev {
				arrow = "▲"
			} else if t.Close < prev {
				arrow = "▼"
			}
		}
		prev = t.Close
		fmt.Printf("%-10s %-10.2f %-10.2f %-10.2f %-10.2f %s\n",
			t.Time, t.Open, t.High, t.Low, t.Close, arrow)
	}
}

func doGRPC() {
	conn, err := grpc.NewClient("localhost:50051", grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		log.Fatal(err)
	}
	defer conn.Close()
	client := pb.NewPingServiceClient(conn)
	resp, err := client.Ping(context.Background(), &pb.PingRequest{Message: "ping"})
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(resp.Message)
}

func doLongPoll() {
	fmt.Println("long polling started. waiting for server events. Ctrl+C to stop.")
	fmt.Println("(trigger events with: curl -X POST localhost:8080/poll/send)\n")
	for i := 1; ; i++ {
		fmt.Printf("[%d] waiting...\n", i)
		resp, err := http.Get("http://localhost:8080/poll/ping")
		if err != nil {
			log.Fatal(err)
		}
		var result map[string]string
		json.NewDecoder(resp.Body).Decode(&result)
		resp.Body.Close()
		fmt.Printf("[%d] server → [%s] %s  (%s)\n", i, result["event"], result["message"], time.Now().Format("15:04:05"))
	}
}

func main() {
	mode := flag.String("mode", "", "ping mode: rest, sse, ws, grpc, longpoll")
	flag.Parse()

	switch *mode {
	case "rest":
		doRest()
	case "sse":
		doSSE()
	case "ws":
		doWS()
	case "grpc":
		doGRPC()
	case "longpoll":
		doLongPoll()
	default:
		fmt.Println("usage: polyping-cli --mode [rest|sse|ws|grpc|longpoll]")
	}
}
