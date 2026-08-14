package config

import (
	"os"
	"reflect"
	"testing"
)

func TestLoad_Defaults(t *testing.T) {
	os.Unsetenv("BACKEND_HTTP_ADDR")
	os.Unsetenv("BACKEND_ZONE_TOPOLOGY")

	cfg := Load()
	if cfg.HTTPAddr != ":8080" {
		t.Fatalf("expected :8080, got %s", cfg.HTTPAddr)
	}
	expectedZones := []string{
		"CONCOURSE_A", "BAG_CHECK", "E_PIER", "GATE_A", "GATE_B",
		"PLATFORM_1", "PLATFORM_2", "SECURITY_T1", "SECURITY_T2",
	}
	if !reflect.DeepEqual(cfg.ZoneIDs, expectedZones) {
		t.Fatalf("expected %v, got %v", expectedZones, cfg.ZoneIDs)
	}
}

func TestLoad_CustomEnv(t *testing.T) {
	t.Setenv("BACKEND_HTTP_ADDR", ":9090")
	t.Setenv("BACKEND_ZONE_TOPOLOGY", "ZONE_1, ZONE_2, ZONE_3")

	cfg := Load()
	if cfg.HTTPAddr != ":9090" {
		t.Fatalf("expected :9090, got %s", cfg.HTTPAddr)
	}
	expectedZones := []string{"ZONE_1", "ZONE_2", "ZONE_3"}
	if !reflect.DeepEqual(cfg.ZoneIDs, expectedZones) {
		t.Fatalf("expected %v, got %v", expectedZones, cfg.ZoneIDs)
	}
}

func TestSplitCSV(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected []string
	}{
		{"empty string", "", nil},
		{"whitespace only", "   ,   ", nil},
		{"single item", "GATE_A", []string{"GATE_A"}},
		{"trimmed items", " A , B , C ", []string{"A", "B", "C"}},
		{"consecutive commas", "A,,B,,,C", []string{"A", "B", "C"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := splitCSV(tt.input)
			if len(got) == 0 && len(tt.expected) == 0 {
				return
			}
			if !reflect.DeepEqual(got, tt.expected) {
				t.Fatalf("splitCSV(%q) = %v; want %v", tt.input, got, tt.expected)
			}
		})
	}
}

func TestEnvFallback(t *testing.T) {
	t.Setenv("TEST_KEY_EXISTING", "custom_val")
	if got := env("TEST_KEY_EXISTING", "fallback"); got != "custom_val" {
		t.Fatalf("expected custom_val, got %s", got)
	}
	if got := env("TEST_KEY_NONEXISTENT_XYZ", "fallback"); got != "fallback" {
		t.Fatalf("expected fallback, got %s", got)
	}
}
