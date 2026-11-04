package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
)

// newStatsServer starts a server whose clock only moves when the returned
// function advances it.
func newStatsServer(t *testing.T) (ts *httptest.Server, mr *miniredis.Miniredis, advance func(time.Duration)) {
	t.Helper()

	start := time.Date(2026, 11, 4, 12, 0, 0, 0, time.UTC)
	var elapsed atomic.Int64
	ts, mr = newTestServerWith(t, func(s *Server) {
		s.deps.Now = func() time.Time { return start.Add(time.Duration(elapsed.Load())) }
	})
	advance = func(d time.Duration) { elapsed.Add(int64(d)) }
	return ts, mr, advance
}

func getStats(t *testing.T, ts *httptest.Server) reply {
	t.Helper()

	req, err := http.NewRequestWithContext(t.Context(), http.MethodGet, ts.URL+"/api/stats", http.NoBody)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Origin", allowedOrigin)
	return send(t, req)
}

// gamesIn decodes the count of games from a successful stats reply.
func gamesIn(t *testing.T, resp reply) int64 {
	t.Helper()

	if resp.status != http.StatusOK {
		t.Fatalf("status = %d, want %d (body %s)", resp.status, http.StatusOK, resp.body)
	}
	var body statsResponse
	if err := json.Unmarshal(resp.body, &body); err != nil {
		t.Fatal(err)
	}
	return body.Games
}

func TestStats(t *testing.T) {
	ts, _, _ := newStatsServer(t)
	createGame(t, ts, "Alex")
	createGame(t, ts, "Sam")

	resp := getStats(t, ts)

	if got := gamesIn(t, resp); got != 2 {
		t.Errorf("games = %d, want 2", got)
	}
	if got := resp.header.Get("Content-Type"); got != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", got)
	}
	if got := resp.header.Get("Cache-Control"); got != "public, max-age=60" {
		t.Errorf("Cache-Control = %q, want public, max-age=60", got)
	}
	if got := resp.header.Get("Access-Control-Allow-Origin"); got != allowedOrigin {
		t.Errorf("Access-Control-Allow-Origin = %q, want %q", got, allowedOrigin)
	}
}

func TestStatsCachesTheCountForAMinute(t *testing.T) {
	ts, _, advance := newStatsServer(t)
	createGame(t, ts, "Alex")

	if got := gamesIn(t, getStats(t, ts)); got != 1 {
		t.Fatalf("first games = %d, want 1", got)
	}

	createGame(t, ts, "Sam")
	advance(59 * time.Second)
	if got := gamesIn(t, getStats(t, ts)); got != 1 {
		t.Errorf("games within a minute = %d, want the cached 1", got)
	}

	advance(time.Second)
	if got := gamesIn(t, getStats(t, ts)); got != 2 {
		t.Errorf("games after a minute = %d, want 2", got)
	}
}

func TestStatsStoreFailure(t *testing.T) {
	ts, mr, _ := newStatsServer(t)
	createGame(t, ts, "Alex")

	mr.SetError("ERR redis is down")
	resp := getStats(t, ts)

	if resp.status != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d", resp.status, http.StatusServiceUnavailable)
	}
	var body errorResponse
	if err := json.Unmarshal(resp.body, &body); err != nil {
		t.Fatal(err)
	}
	if body.Error == "" {
		t.Errorf("body = %s, want an error message", resp.body)
	}
	if got := resp.header.Get("Cache-Control"); got != "no-store" {
		t.Errorf("Cache-Control = %q, want no-store", got)
	}

	// The failure is not cached: the next request reads Redis again.
	mr.SetError("")
	if got := gamesIn(t, getStats(t, ts)); got != 1 {
		t.Errorf("games after recovery = %d, want 1", got)
	}
}
