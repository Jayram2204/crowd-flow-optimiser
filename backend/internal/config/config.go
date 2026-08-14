package config

import (
	"os"
	"strings"
)

// Config is resolved from environment variables with sensible defaults
// so the backend boots standalone without a broker or database.
type Config struct {
	HTTPAddr string
	ZoneIDs  []string
}

// Load reads configuration from the environment. Zone topology is an
// ordered, comma-separated list; adjacency (who can negotiate with whom)
// is derived from the ordering at build time.
func Load() Config {
	return Config{
		HTTPAddr: env("BACKEND_HTTP_ADDR", ":8080"),
		ZoneIDs: splitCSV(env(
			"BACKEND_ZONE_TOPOLOGY",
			"CONCOURSE_A,BAG_CHECK,E_PIER,GATE_A,GATE_B,PLATFORM_1,PLATFORM_2,SECURITY_T1,SECURITY_T2",
		)),
	}
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func splitCSV(s string) []string {
	var out []string
	for _, p := range strings.Split(s, ",") {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}
