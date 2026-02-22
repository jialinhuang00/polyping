package main

import (
	"bufio"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"
)

func main() {
	fmt.Println("connecting to build log stream...")
	resp, err := http.Get("http://localhost:8080/sse/ping")
	if err != nil {
		log.Fatal(err)
	}
	defer resp.Body.Close()
	fmt.Println("connected. watching build output.\n")

	n := 0
	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "data: ") {
			n++
			msg := strings.TrimPrefix(line, "data: ")
			fmt.Printf("[%s] %s\n", time.Now().Format("15:04:05"), msg)
		}
	}
	fmt.Println("\nbuild stream ended.")
	if err := scanner.Err(); err != nil {
		log.Fatal(err)
	}
}
