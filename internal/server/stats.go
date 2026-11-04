package server

import (
	"context"
	"net/http"
	"sync"
	"time"
)

const (
	// statsCacheTTL is how long an instance reuses the count of games before
	// it scans Redis again.
	statsCacheTTL = time.Minute
	// statsCacheControl lets browsers and proxies keep a reply as long as the
	// instance keeps its count.
	statsCacheControl = "public, max-age=60"
)

// gamesCount is the count of games in progress, cached for statsCacheTTL.
type gamesCount struct {
	mu      sync.Mutex
	value   int64
	expires time.Time
}

// handleStats tells how many games are in progress: every game that has not
// expired, ended games included.
func (s *Server) handleStats(w http.ResponseWriter, r *http.Request) {
	games, err := s.countGames(r.Context())
	if err != nil {
		s.deps.Logger.Warn("count games", "error", err)
		writeUncachedError(w, http.StatusServiceUnavailable, "statistics unavailable")
		return
	}
	w.Header().Set("Cache-Control", statsCacheControl)
	writeJSON(w, http.StatusOK, statsResponse{Games: games})
}

// countGames returns the cached count of games, or counts them again once the
// cache has expired. The lock is held during the count, so that requests
// arriving meanwhile wait for its result instead of each scanning Redis. A
// failed count is not cached: the next request tries again.
func (s *Server) countGames(ctx context.Context) (int64, error) {
	s.games.mu.Lock()
	defer s.games.mu.Unlock()

	now := s.deps.Now()
	if now.Before(s.games.expires) {
		return s.games.value, nil
	}
	value, err := s.deps.Store.CountGames(ctx)
	if err != nil {
		return 0, err
	}
	s.games.value = value
	s.games.expires = now.Add(statsCacheTTL)
	return value, nil
}
