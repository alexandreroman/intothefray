package config

import (
	"reflect"
	"strings"
	"testing"
	"time"
)

func envFrom(env map[string]string) func(string) string {
	return func(key string) string { return env[key] }
}

func TestLoadDefaults(t *testing.T) {
	t.Parallel()

	got, err := Load(envFrom(nil))
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	want := Config{
		Port:           "8080",
		RedisURL:       "redis://localhost:6379/0",
		AllowedOrigins: []string{"http://localhost:5173"},
		GameTTL:        24 * time.Hour,
		MarvelcdbURL:   "https://marvelcdb.com",
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("Load() = %+v, want %+v", got, want)
	}
}

func TestLoadOverrides(t *testing.T) {
	t.Parallel()

	got, err := Load(envFrom(map[string]string{
		"PORT":            "9090",
		"REDIS_URL":       "redis://redis:6379/1",
		"ALLOWED_ORIGINS": " https://a.example , ,https://b.example,",
		"GAME_TTL":        "90m",
		"MARVELCDB_URL":   "http://127.0.0.1:1234",
	}))
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	want := Config{
		Port:           "9090",
		RedisURL:       "redis://redis:6379/1",
		AllowedOrigins: []string{"https://a.example", "https://b.example"},
		GameTTL:        90 * time.Minute,
		MarvelcdbURL:   "http://127.0.0.1:1234",
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("Load() = %+v, want %+v", got, want)
	}
}

func TestLoadBadTTL(t *testing.T) {
	t.Parallel()

	for _, ttl := range []string{"soon", "0s", "-1h"} {
		t.Run(ttl, func(t *testing.T) {
			t.Parallel()
			_, err := Load(envFrom(map[string]string{"GAME_TTL": ttl}))
			if err == nil {
				t.Fatal("Load() error = nil, want error")
			}
			if !strings.Contains(err.Error(), "GAME_TTL") {
				t.Errorf("error %q does not name GAME_TTL", err)
			}
		})
	}
}
