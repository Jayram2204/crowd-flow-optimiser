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
// the audit log to the API + UI. It is the "signage API" seam.
type Service struct {
	mu     sync.Mutex
	log    []models.Intervention
	client Client
}

// NewService returns an intervention service backed by a log-only signage
// client. Swap in a real client here for production.
func NewService() *Service {
	return &Service{client: LogOnlyClient{}}
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
	s.mu.Unlock()
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
