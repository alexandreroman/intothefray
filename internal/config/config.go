// Package config reads the server configuration from environment variables.
package config

import (
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"
)

// DefaultPort is the listen port when PORT is unset.
const DefaultPort = "9000"

// Config holds the server settings, read once at startup.
type Config struct {
	// Port is the listen port, on all interfaces.
	Port string
	// RedisURL is the Redis connection URL.
	RedisURL string
	// AllowedOrigins lists the frontend origins allowed by CORS and WebSocket,
	// each normalised to scheme://host[:port] in lower case, as browsers send
	// them in the Origin header.
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

	origins, err := parseOrigins(withDefault("ALLOWED_ORIGINS", "http://localhost:8080"))
	if err != nil {
		return Config{}, fmt.Errorf("invalid ALLOWED_ORIGINS: %w", err)
	}

	return Config{
		Port:           withDefault("PORT", DefaultPort),
		RedisURL:       withDefault("REDIS_URL", "redis://localhost:6379/0"),
		AllowedOrigins: origins,
		GameTTL:        ttl,
		MarvelcdbURL:   withDefault("MARVELCDB_URL", "https://marvelcdb.com"),
	}, nil
}

// parseOrigins reads a comma-separated list of origins. Each entry must be an
// http or https URL with a host and nothing after it but an optional "/": a
// path would never match the Origin header that browsers send.
func parseOrigins(value string) ([]string, error) {
	var origins []string
	for _, entry := range splitList(value) {
		origin, err := parseOrigin(entry)
		if err != nil {
			return nil, err
		}
		origins = append(origins, origin)
	}
	if len(origins) == 0 {
		return nil, errors.New("no origin listed")
	}
	return origins, nil
}

// parseOrigin returns entry as scheme://host[:port], in lower case.
func parseOrigin(entry string) (string, error) {
	u, err := url.Parse(entry)
	if err != nil {
		return "", fmt.Errorf("origin %q: %w", entry, err)
	}
	// url.Parse lower-cases the scheme, but not the host.
	if u.Scheme != "http" && u.Scheme != "https" {
		return "", fmt.Errorf("origin %q: the scheme must be http or https", entry)
	}
	if u.Host == "" {
		return "", fmt.Errorf("origin %q: a host is required", entry)
	}
	if u.User != nil || (u.Path != "" && u.Path != "/") || u.RawQuery != "" || u.ForceQuery || u.Fragment != "" {
		return "", fmt.Errorf("origin %q: only scheme://host[:port] is allowed", entry)
	}
	return u.Scheme + "://" + strings.ToLower(u.Host), nil
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
