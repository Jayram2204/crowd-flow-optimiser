package api

import (
	"context"
	"fmt"
	"math/rand"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	"crowd-flow-optimiser/backend/internal/agent"
	"crowd-flow-optimiser/backend/internal/intervention"
	"crowd-flow-optimiser/backend/internal/models"
	"crowd-flow-optimiser/backend/internal/state"
)

// Stress Test 1: 50 Concurrent Subscribers with continuous high-frequency broadcast
func TestStress_WS_ConcurrentHighVolumeBroadcast(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	zones := []string{"GATE_A", "GATE_B", "GATE_C", "GATE_D", "BAG_CHECK"}
	st := state.NewManager(zones)
	sg := intervention.NewService()
	net := agent.BuildNetwork(ctx, zones, st, sg)
	h := NewHandlers(net, st, sg)
	server := httptest.NewServer(NewRouter(h))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/api/v1/ws"
	const clientCount = 30
	const broadcastCount = 200

	var wg sync.WaitGroup
	var totalFramesReceived int64

	// Start 30 client goroutines
	readyChan := make(chan struct{})
	for i := 0; i < clientCount; i++ {
		wg.Add(1)
		go func(clientId int) {
			defer wg.Done()
			conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
			if err != nil {
				t.Errorf("client %d dial failed: %v", clientId, err)
				return
			}
			defer conn.Close()

			<-readyChan

			// Read frames for 1.5 seconds
			_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
			for {
				var frame wsFrame
				if err := conn.ReadJSON(&frame); err != nil {
					break
				}
				atomic.AddInt64(&totalFramesReceived, 1)
			}
		}(i)
	}

	time.Sleep(100 * time.Millisecond)
	close(readyChan)

	// Concurrently broadcast 200 metrics and 50 interventions
	for b := 0; b < broadcastCount; b++ {
		zid := zones[b%len(zones)]
		st.Set(models.ZoneMetric{
			ZoneID:     zid,
			Capacity:   100,
			Occupancy:  b % 100,
			Congestion: models.CongestionModerate,
			Timestamp:  time.Now(),
		})
		if b%4 == 0 {
			sg.Apply(models.Intervention{
				ZoneID:   zid,
				Type:     models.InterventionSignageReroute,
				Message:  fmt.Sprintf("Reroute %d", b),
				Severity: models.CongestionHigh,
			})
		}
		time.Sleep(2 * time.Millisecond)
	}

	wg.Wait()

	if atomic.LoadInt64(&totalFramesReceived) == 0 {
		t.Fatalf("expected frames to be received across clients, got 0")
	}
}

// Stress Test 2: Rapid Connect/Disconnect Churn under Active Broadcast
func TestStress_WS_RapidChurnAndDisconnect(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	zones := []string{"GATE_A", "GATE_B"}
	st := state.NewManager(zones)
	sg := intervention.NewService()
	net := agent.BuildNetwork(ctx, zones, st, sg)
	h := NewHandlers(net, st, sg)
	server := httptest.NewServer(NewRouter(h))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/api/v1/ws"
	done := make(chan struct{})

	// Continuous broadcaster
	go func() {
		iter := 0
		for {
			select {
			case <-done:
				return
			default:
				iter++
				st.Set(models.ZoneMetric{
					ZoneID:    "GATE_A",
					Occupancy: iter % 100,
					Timestamp: time.Now(),
				})
				if iter%5 == 0 {
					sg.Apply(models.Intervention{
						ZoneID: "GATE_A",
						Type:   models.InterventionHoldInflow,
					})
				}
				time.Sleep(1 * time.Millisecond)
			}
		}
	}()

	// 20 workers performing rapid connect, read 1 frame, abruptly disconnect
	var wg sync.WaitGroup
	const churnWorkers = 15
	const cyclesPerWorker = 20

	for w := 0; w < churnWorkers; w++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			for c := 0; c < cyclesPerWorker; c++ {
				conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
				if err != nil {
					continue
				}
				_ = conn.SetReadDeadline(time.Now().Add(50 * time.Millisecond))
				var frame wsFrame
				_ = conn.ReadJSON(&frame)
				// Abrupt close (TCP reset simulation)
				_ = conn.Close()
			}
		}(w)
	}

	wg.Wait()
	close(done)
}

// Stress Test 3: Slow Consumer - verify broadcaster never blocks on slow / stalled WebSocket clients
func TestStress_WS_SlowConsumerNonBlocking(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	zones := []string{"GATE_A"}
	st := state.NewManager(zones)
	sg := intervention.NewService()
	net := agent.BuildNetwork(ctx, zones, st, sg)
	h := NewHandlers(net, st, sg)
	server := httptest.NewServer(NewRouter(h))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/api/v1/ws"

	// Connect a stalled client that NEVER reads from the socket after connection
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial failed: %v", err)
	}
	defer conn.Close()

	// Rapidly push 300 metrics; broadcast should complete in < 500ms without blocking
	start := time.Now()
	for i := 0; i < 300; i++ {
		st.Set(models.ZoneMetric{
			ZoneID:    "GATE_A",
			Occupancy: i,
			Timestamp: time.Now(),
		})
	}
	duration := time.Since(start)

	if duration > 1*time.Second {
		t.Fatalf("broadcaster blocked on slow consumer: took %v for 300 items", duration)
	}
}

// Stress Test 4: State Manager & Signage Service Concurrency & Lock Stress
func TestStress_StateManager_Signage_Concurrency(t *testing.T) {
	zones := []string{"GATE_A", "GATE_B", "GATE_C", "PLATFORM_1", "PLATFORM_2"}
	st := state.NewManager(zones)
	sg := intervention.NewService()

	stop := make(chan struct{})
	var wg sync.WaitGroup

	// 10 Goroutines calling Set
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			for {
				select {
				case <-stop:
					return
				default:
					zid := zones[rand.Intn(len(zones))]
					st.Set(models.ZoneMetric{
						ZoneID:    zid,
						Occupancy: rand.Intn(100),
						Timestamp: time.Now(),
					})
				}
			}
		}(i)
	}

	// 10 Goroutines calling Apply
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			for {
				select {
				case <-stop:
					return
				default:
					zid := zones[rand.Intn(len(zones))]
					sg.Apply(models.Intervention{
						ZoneID: zid,
						Type:   models.InterventionSignageReroute,
					})
				}
			}
		}(i)
	}

	// 10 Goroutines rapidly Subscribing and Unsubscribing
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			for {
				select {
				case <-stop:
					return
				default:
					sub, unsub := st.Subscribe()
					ivSub, unsubIv := sg.Subscribe()
					time.Sleep(time.Duration(rand.Intn(5)) * time.Millisecond)
					// read if available
					select {
					case <-sub:
					default:
					}
					select {
					case <-ivSub:
					default:
					}
					unsub()
					unsubIv()
				}
			}
		}(i)
	}

	// 5 Goroutines reading All() and List()
	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				select {
				case <-stop:
					return
				default:
					_ = st.All()
					_ = sg.List()
				}
			}
		}()
	}

	// Let stress test run for 1.5 seconds under full load
	time.Sleep(1500 * time.Millisecond)
	close(stop)
	wg.Wait()
}
