package intervention

import (
	"testing"
	"time"

	"crowd-flow-optimiser/backend/internal/models"
)

func TestApplyEnrichesAndRecords(t *testing.T) {
	s := NewService()
	iv := s.Apply(models.Intervention{
		ZoneID: "GATE_A",
		Type:   models.InterventionSignageReroute,
	})
	if iv.ID == "" {
		t.Fatal("Apply must assign an ID")
	}
	if iv.AppliedAt.IsZero() {
		t.Fatal("Apply must assign AppliedAt")
	}
	if iv.Message == "" {
		t.Fatal("Apply must fill a default message")
	}
	if len(s.List()) != 1 {
		t.Fatalf("expected 1 recorded intervention, got %d", len(s.List()))
	}
}

func TestListReturnsCopy(t *testing.T) {
	s := NewService()
	s.Apply(models.Intervention{ZoneID: "A", Type: models.InterventionHoldInflow})
	got := s.List()
	got[0].ZoneID = "MUTATED"
	if s.List()[0].ZoneID == "MUTATED" {
		t.Fatal("List must not alias the internal log")
	}
}

func TestApplyFansOutToSubscribers(t *testing.T) {
	s := NewService()
	sub, unsub := s.Subscribe()
	defer unsub()

	s.Apply(models.Intervention{ZoneID: "A", Type: models.InterventionDispatchStaff})
	select {
	case got := <-sub:
		if got.ZoneID != "A" {
			t.Fatalf("unexpected intervention broadcast: %+v", got)
		}
	case <-time.After(time.Second):
		t.Fatal("subscriber did not receive intervention")
	}
}

func TestLogOnlyClientDoesNotError(t *testing.T) {
	c := LogOnlyClient{}
	if err := c.SetMessage("sign-1", "reroute", "HIGH"); err != nil {
		t.Fatalf("LogOnlyClient must not error: %v", err)
	}
}
