package main

import (
	"context"
	"fmt"
	"log"

	pb "polyping/proto/pingpb"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

func main() {
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
