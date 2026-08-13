package intervention

import (
	"fmt"
	"log"
	"sync"
	"time"

	"crowd-flow-optimiser/backend/internal/models"
)

// Client is the physical-action boundary: whatever the venue exposes to
// change crowd flow (signage controllers, gate hold systems, staff radio).
type Client interface {
	// SetMessage drives a physical signage unit. A real integration would
	// issue a gRPC/HTTP call to a signage controller; the prototype logs it.
	SetMessage(signID, message, severity string) error
}

// LogOnlyClient is the default prototype client. It makes no network call;
// it records the "physical" write to stderr for operators to observe.
type LogOnlyClient struct{}

func (LogOnlyClient) SetMessage(signID, message, severity string) error {
	log.Printf("[SIGNAGE-API] %s :: [%s] %s", signID, severity, message)
	return nil
}

// Service serialises every intervention applied to the venue and exposes
// the audit log to the API + UI. It is the "signage API" seam. It fans
// every applied intervention out to live-stream subscribers so the UI can
// show autonomous actions the moment they execute.
type Service struct {
	mu     sync.Mutex
	log    []models.Intervention
	client Client
	subs   map[chan models.Intervention]struct{}
}

// NewService returns an intervention service backed by a log-only signage
// client. Swap in a real client here for production.
func NewService() *Service {
	return &Service{
		client: LogOnlyClient{},
		subs:   make(map[chan models.Intervention]struct{}),
	}
}

// Apply records and "executes" an intervention, returning the enriched
// entity with ID and timestamp populated.
func (s *Service) Apply(iv models.Intervention) models.Intervention {
	if iv.ID == "" {
		iv.ID = fmt.Sprintf("iv-%d", time.Now().UnixNano())
	}
	iv.AppliedAt = time.Now()
	if iv.Message == "" {
		iv.Message = fmt.Sprintf("%s intervention on %s", iv.Type, iv.ZoneID)
	}
	_ = s.client.SetMessage(iv.ZoneID, iv.Message, string(iv.Severity))
	s.mu.Lock()
	s.log = append(s.log, iv)
	subs := make([]chan models.Intervention, 0, len(s.subs))
	for c := range s.subs {
		subs = append(subs, c)
	}
	s.mu.Unlock()
	for _, c := range subs {
		select {
		case c <- iv:
		default: // slow consumer; drop. never block the execution path.
		}
	}
	return iv
}

// List returns the full intervention audit trail.
func (s *Service) List() []models.Intervention {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]models.Intervention, len(s.log))
	copy(out, s.log)
	return out
}

// Subscribe registers a live-stream fan-out channel. The returned
// unsubscribe function must be called when the client disconnects.
func (s *Service) Subscribe() (<-chan models.Intervention, func()) {
	ch := make(chan models.Intervention, 64)
	s.mu.Lock()
	s.subs[ch] = struct{}{}
	s.mu.Unlock()
	return ch, func() {
		s.mu.Lock()
		delete(s.subs, ch)
		s.mu.Unlock()
	}
}
