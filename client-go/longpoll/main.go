package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"
)

func main() {
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
