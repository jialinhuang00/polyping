package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
)

func main() {
	fmt.Println("waiting for response...")
	resp, err := http.Get("http://localhost:8080/poll/ping")
	if err != nil {
		log.Fatal(err)
	}
	defer resp.Body.Close()

	var result map[string]string
	json.NewDecoder(resp.Body).Decode(&result)
	fmt.Println(result["message"])
}
