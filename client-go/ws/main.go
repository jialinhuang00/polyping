package main

import (
	"fmt"
	"log"
	"time"

	"github.com/gorilla/websocket"
)

func main() {
	conn, _, err := websocket.DefaultDialer.Dial("ws://localhost:8080/ws/ping", nil)
	if err != nil {
		log.Fatal(err)
	}
	defer conn.Close()

	fmt.Println("connected. sending ping every second. Ctrl+C to stop.")

	for i := 1; ; i++ {
		if err := conn.WriteMessage(websocket.TextMessage, []byte("ping")); err != nil {
			log.Fatal(err)
		}
		fmt.Printf("[%d] > ping\n", i)

		_, msg, err := conn.ReadMessage()
		if err != nil {
			log.Fatal(err)
		}
		fmt.Printf("[%d] < %s\n", i, msg)

		time.Sleep(1 * time.Second)
	}
}
