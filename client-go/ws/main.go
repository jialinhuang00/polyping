package main

import (
	"encoding/json"
	"fmt"
	"log"

	"github.com/gorilla/websocket"
)

type tick struct {
	Symbol string  `json:"symbol"`
	Open   float64 `json:"open"`
	High   float64 `json:"high"`
	Low    float64 `json:"low"`
	Close  float64 `json:"close"`
	Time   string  `json:"time"`
}

func main() {
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
