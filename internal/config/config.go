// Package config reads the server configuration from environment variables.
package config

import (
	"fmt"
	"strings"
	"time"
)

// Config holds the server settings, read once at startup.
type Config struct {
	// Port is the listen port, on all interfaces.
	Port string
	// RedisURL is the Redis connection URL.
	RedisURL string
	// AllowedOrigins lists the frontend origins allowed by CORS and WebSocket.
	AllowedOrigins []string
	// GameTTL is the expiry of a game nobody touches.
	GameTTL time.Duration
	// MarvelcdbURL is the base URL of the deck source.
	MarvelcdbURL string
}

// Load builds a Config from the environment, using getenv to read variables
// (os.Getenv in production). An unset or empty variable takes its default.
func Load(getenv func(string) string) (Config, error) {
	withDefault := func(key, fallback string) string {
		if value := getenv(key); value != "" {
			return value
		}
		return fallback
	}

	ttl, err := time.ParseDuration(withDefault("GAME_TTL", "24h"))
	if err != nil {
		return Config{}, fmt.Errorf("invalid GAME_TTL: %w", err)
	}
	if ttl <= 0 {
		return Config{}, fmt.Errorf("invalid GAME_TTL: %s must be positive", ttl)
	}

	return Config{
		Port:           withDefault("PORT", "8080"),
		RedisURL:       withDefault("REDIS_URL", "redis://localhost:6379/0"),
		AllowedOrigins: splitList(withDefault("ALLOWED_ORIGINS", "http://localhost:5173")),
		GameTTL:        ttl,
		MarvelcdbURL:   withDefault("MARVELCDB_URL", "https://marvelcdb.com"),
	}, nil
}

// splitList splits a comma-separated list, trimming entries and dropping
// empty ones.
func splitList(value string) []string {
	var items []string
	for _, item := range strings.Split(value, ",") {
		if item = strings.TrimSpace(item); item != "" {
			items = append(items, item)
		}
	}
	return items
}
