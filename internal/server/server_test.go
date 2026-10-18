package server

import (
	"bufio"
	"encoding/json"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/coder/websocket"
	"github.com/redis/go-redis/v9"

	"github.com/alexandreroman/intothefray/internal/config"
	"github.com/alexandreroman/intothefray/internal/decks"
	"github.com/alexandreroman/intothefray/internal/store"
	"github.com/alexandreroman/intothefray/packs"
)

const allowedOrigin = "http://localhost:5173"

func newTestServer(t *testing.T) (*httptest.Server, *miniredis.Miniredis) {
	t.Helper()
	return newTestServerWith(t, nil)
}

// newTestServerWith lets configure adjust the server before it starts.
func newTestServerWith(t *testing.T, configure func(*Server)) (*httptest.Server, *miniredis.Miniredis) {
	t.Helper()

	srv, mr := newServer(t)
	if configure != nil {
		configure(srv)
	}
	ts := httptest.NewServer(srv.Handler())
	t.Cleanup(ts.Close)
	return ts, mr
}

// newServer builds a Server backed by a fresh miniredis and the real card
// catalog. Its deck importer points nowhere: tests that load decks replace it.
func newServer(t *testing.T) (*Server, *miniredis.Miniredis) {
	t.Helper()

	mr := miniredis.RunT(t)
	return newServerOn(t, mr), mr
}

// newServerOn builds a Server like newServer, backed by mr, which several
// servers may share to act as instances of one deployment.
func newServerOn(t *testing.T, mr *miniredis.Miniredis) *Server {
	t.Helper()
	return newServerWithConfig(t, mr, config.Config{AllowedOrigins: []string{allowedOrigin}, GameTTL: time.Hour})
}

// newServerWithConfig builds a Server like newServerOn, with cfg.
func newServerWithConfig(t *testing.T, mr *miniredis.Miniredis, cfg config.Config) *Server {
	t.Helper()

	cat, err := testCatalog()
	if err != nil {
		t.Fatal(err)
	}
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rdb.Close() })

	return New(Deps{
		Config:  cfg,
		Store:   store.New(rdb, cfg.GameTTL),
		Catalog: cat,
		Decks:   &decks.Importer{BaseURL: "http://127.0.0.1:0"},
		Now:     time.Now,
		Logger:  slog.New(slog.NewTextHandler(io.Discard, nil)),
	})
}

// testCatalog loads the embedded packs once for the whole test binary.
var testCatalog = sync.OnceValues(packs.Catalog)

// reply is a fully read HTTP response.
type reply struct {
	status int
	header http.Header
	body   []byte
}

func send(t *testing.T, req *http.Request) reply {
	t.Helper()

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = resp.Body.Close() }()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	return reply{status: resp.StatusCode, header: resp.Header, body: body}
}

func postGame(t *testing.T, ts *httptest.Server, origin, body string) reply {
	t.Helper()

	req, err := http.NewRequestWithContext(t.Context(), http.MethodPost, ts.URL+"/api/games", strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	if origin != "" {
		req.Header.Set("Origin", origin)
	}
	return send(t, req)
}

func TestCreateGame(t *testing.T) {
	ts, mr := newTestServer(t)

	resp := postGame(t, ts, allowedOrigin, `{"name": "Alex"}`)

	if resp.status != http.StatusCreated {
		t.Fatalf("status = %d, want %d", resp.status, http.StatusCreated)
	}
	if got := resp.header.Get("Access-Control-Allow-Origin"); got != allowedOrigin {
		t.Errorf("Access-Control-Allow-Origin = %q, want %q", got, allowedOrigin)
	}
	var body createGameResponse
	if err := json.Unmarshal(resp.body, &body); err != nil {
		t.Fatal(err)
	}
	if !regexp.MustCompile(`^[abcdefghjkmnpqrstuvwxyz23456789]{10}$`).MatchString(body.ID) {
		t.Errorf("id = %q, want 10 characters from the id alphabet", body.ID)
	}
	if !regexp.MustCompile(`^[A-Za-z0-9_-]{43}$`).MatchString(body.Token) {
		t.Errorf("token = %q, want 43 base64url characters", body.Token)
	}
	if !mr.Exists("game:" + body.ID) {
		t.Errorf("game %q is not stored", body.ID)
	}
}

func TestCreateGameEmptyName(t *testing.T) {
	tests := []struct {
		name string
		body string
	}{
		{"empty name", `{"name": ""}`},
		{"missing name", `{}`},
		{"blank name", `{"name": "   "}`},
		{"invalid json", `not json`},
		{"body over 1 KiB", `{"name": "` + strings.Repeat("a", 2<<10) + `"}`},
	}

	ts, _ := newTestServer(t)
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			resp := postGame(t, ts, "", tt.body)

			if resp.status != http.StatusBadRequest {
				t.Errorf("status = %d, want %d", resp.status, http.StatusBadRequest)
			}
		})
	}
}

func TestCreateGameRetriesTakenID(t *testing.T) {
	ids := []string{"takentaken", "takentaken", "freefree23"}
	ts, mr := newTestServerWith(t, func(s *Server) {
		s.newID = func() (string, error) {
			id := ids[0]
			if len(ids) > 1 {
				ids = ids[1:]
			}
			return id, nil
		}
	})
	if resp := postGame(t, ts, "", `{"name": "Alex"}`); resp.status != http.StatusCreated {
		t.Fatalf("first create: status = %d", resp.status)
	}

	resp := postGame(t, ts, "", `{"name": "Bob"}`)

	if resp.status != http.StatusCreated {
		t.Fatalf("status = %d, want %d", resp.status, http.StatusCreated)
	}
	if !mr.Exists("game:freefree23") {
		t.Error("second game was not stored under the fresh id")
	}
}

func TestOriginChecks(t *testing.T) {
	ts, _ := newTestServer(t)

	t.Run("post from a disallowed origin", func(t *testing.T) {
		t.Parallel()

		resp := postGame(t, ts, "http://evil.test", `{"name": "Alex"}`)

		if resp.status != http.StatusForbidden {
			t.Errorf("status = %d, want %d", resp.status, http.StatusForbidden)
		}
		if got := resp.header.Get("Access-Control-Allow-Origin"); got != "" {
			t.Errorf("Access-Control-Allow-Origin = %q, want none", got)
		}
	})

	t.Run("preflight from an allowed origin", func(t *testing.T) {
		t.Parallel()

		req, err := http.NewRequestWithContext(t.Context(), http.MethodOptions, ts.URL+"/api/games", http.NoBody)
		if err != nil {
			t.Fatal(err)
		}
		req.Header.Set("Origin", allowedOrigin)
		req.Header.Set("Access-Control-Request-Method", "POST")
		req.Header.Set("Access-Control-Request-Headers", "Content-Type")
		resp := send(t, req)

		if resp.status != http.StatusNoContent {
			t.Errorf("status = %d, want %d", resp.status, http.StatusNoContent)
		}
		if got := resp.header.Get("Access-Control-Allow-Origin"); got != allowedOrigin {
			t.Errorf("Access-Control-Allow-Origin = %q, want %q", got, allowedOrigin)
		}
		if got := resp.header.Get("Access-Control-Allow-Headers"); !strings.Contains(got, "Content-Type") {
			t.Errorf("Access-Control-Allow-Headers = %q, want Content-Type", got)
		}
	})

	t.Run("preflight from a disallowed origin", func(t *testing.T) {
		t.Parallel()

		req, err := http.NewRequestWithContext(t.Context(), http.MethodOptions, ts.URL+"/api/games", http.NoBody)
		if err != nil {
			t.Fatal(err)
		}
		req.Header.Set("Origin", "http://evil.test")
		resp := send(t, req)

		if got := resp.header.Get("Access-Control-Allow-Origin"); got != "" {
			t.Errorf("Access-Control-Allow-Origin = %q, want none", got)
		}
	})

	t.Run("websocket from a disallowed origin", func(t *testing.T) {
		t.Parallel()

		id := createGameID(t, ts)

		_, status, err := dial(t, wsURL(ts, id), "http://evil.test")

		if err == nil {
			t.Fatal("dial succeeded, want an origin error")
		}
		if status != http.StatusForbidden {
			t.Errorf("status = %d, want %d", status, http.StatusForbidden)
		}
	})

	t.Run("websocket from an allowed origin", func(t *testing.T) {
		t.Parallel()

		id := createGameID(t, ts)

		conn, _, err := dial(t, wsURL(ts, id), allowedOrigin)
		if err != nil {
			t.Fatalf("dial: %v", err)
		}
		_ = conn.CloseNow()
	})
}

// TestCORSAndWebSocketAgree checks that an origin from the environment is
// allowed, or refused, alike by the HTTP API and the WebSocket endpoint.
func TestCORSAndWebSocketAgree(t *testing.T) {
	cfg, err := config.Load(func(key string) string {
		if key == "ALLOWED_ORIGINS" {
			return "https://front.example/,http://[::1]:5173"
		}
		return ""
	})
	if err != nil {
		t.Fatalf("config.Load: %v", err)
	}
	ts := httptest.NewServer(newServerWithConfig(t, miniredis.RunT(t), cfg).Handler())
	t.Cleanup(ts.Close)

	tests := []struct {
		origin  string
		allowed bool
	}{
		{"https://front.example", true},
		{"http://front.example", false},
		{"https://other.example", false},
		{"http://[::1]:5173", true},
		{"http://[::2]:5173", false},
	}
	for _, tt := range tests {
		t.Run(tt.origin, func(t *testing.T) {
			resp := postGame(t, ts, tt.origin, `{"name": "Alex"}`)
			if got := resp.status == http.StatusCreated; got != tt.allowed {
				t.Errorf("POST /api/games: status = %d, want allowed = %v", resp.status, tt.allowed)
			}
			if got := resp.header.Get("Access-Control-Allow-Origin") == tt.origin; got != tt.allowed {
				t.Errorf("Access-Control-Allow-Origin = %q, want allowed = %v",
					resp.header.Get("Access-Control-Allow-Origin"), tt.allowed)
			}

			conn, status, err := dial(t, wsURL(ts, createGameID(t, ts)), tt.origin)
			if got := err == nil; got != tt.allowed {
				t.Errorf("websocket dial: status = %d, err = %v, want allowed = %v", status, err, tt.allowed)
			}
			if conn != nil {
				_ = conn.CloseNow()
			}
		})
	}
}

func TestCreateGameSlowBody(t *testing.T) {
	ts, _ := newTestServerWith(t, func(s *Server) { s.createBodyTimeout = 50 * time.Millisecond })
	conn, err := net.Dial("tcp", ts.Listener.Addr().String())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = conn.Close() })

	// The body announces more bytes than it sends, and never ends.
	_, err = io.WriteString(conn, "POST /api/games HTTP/1.1\r\nHost: test\r\n"+
		"Content-Type: application/json\r\nContent-Length: 64\r\n\r\n{\"name\":")
	if err != nil {
		t.Fatal(err)
	}

	if err := conn.SetReadDeadline(time.Now().Add(waitTimeout)); err != nil {
		t.Fatal(err)
	}
	resp, err := http.ReadResponse(bufio.NewReader(conn), nil)
	if err != nil {
		t.Fatalf("no answer to a stalled body: %v", err)
	}
	_ = resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", resp.StatusCode, http.StatusBadRequest)
	}
}

func TestUnknownGameWS(t *testing.T) {
	ts, _ := newTestServer(t)
	client := connect(t, ts, "nosuchgame")

	msg := client.expect("error")
	if msg.Code != "notFound" || msg.Message != errorTexts[codeNotFound] {
		t.Errorf("error = %q %q, want notFound with its fixed text", msg.Code, msg.Message)
	}

	_, _, err := client.ws.Read(t.Context())
	if got := websocket.CloseStatus(err); got != 4404 {
		t.Errorf("close status = %d (%v), want 4404", got, err)
	}
}

func TestUnknownGameWSChecksOrigin(t *testing.T) {
	ts, _ := newTestServer(t)

	_, status, err := dial(t, wsURL(ts, "nosuchgame"), "https://evil.example")

	if err == nil {
		t.Fatal("dial succeeded, want an error")
	}
	if status != http.StatusForbidden {
		t.Errorf("status = %d, want %d", status, http.StatusForbidden)
	}
}

func TestHealthz(t *testing.T) {
	ts, _ := newTestServer(t)

	req, err := http.NewRequestWithContext(t.Context(), http.MethodGet, ts.URL+"/healthz", http.NoBody)
	if err != nil {
		t.Fatal(err)
	}
	resp := send(t, req)

	if resp.status != http.StatusOK || string(resp.body) != "ok" {
		t.Errorf("got %d %q, want 200 \"ok\"", resp.status, resp.body)
	}
}

func createGameID(t *testing.T, ts *httptest.Server) string {
	t.Helper()
	return createGame(t, ts, "Alex").ID
}

// createGame creates a game hosted by hostName and returns its id and the
// host token.
func createGame(t *testing.T, ts *httptest.Server, hostName string) createGameResponse {
	t.Helper()

	resp := postGame(t, ts, "", `{"name": "`+hostName+`"}`)
	if resp.status != http.StatusCreated {
		t.Fatalf("create game: status = %d", resp.status)
	}
	var body createGameResponse
	if err := json.Unmarshal(resp.body, &body); err != nil {
		t.Fatal(err)
	}
	return body
}

func wsURL(ts *httptest.Server, id string) string {
	return "ws" + strings.TrimPrefix(ts.URL, "http") + "/ws/games/" + id
}

// dial opens a WebSocket and returns the status of the handshake response.
func dial(t *testing.T, url, origin string) (*websocket.Conn, int, error) {
	t.Helper()

	opts := &websocket.DialOptions{}
	if origin != "" {
		opts.HTTPHeader = http.Header{"Origin": {origin}}
	}
	conn, resp, err := websocket.Dial(t.Context(), url, opts)
	status := 0
	if resp != nil {
		status = resp.StatusCode
		// After a successful handshake the body is not a real stream.
		if err != nil {
			_ = resp.Body.Close()
		}
	}
	return conn, status, err
}
