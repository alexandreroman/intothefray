// Package server exposes the game over HTTP and WebSocket.
package server

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"slices"
	"time"

	"github.com/coder/websocket"

	"github.com/alexandreroman/intothefray/internal/config"
	"github.com/alexandreroman/intothefray/internal/decks"
	"github.com/alexandreroman/intothefray/internal/game"
	"github.com/alexandreroman/intothefray/internal/pack"
	"github.com/alexandreroman/intothefray/internal/store"
)

const (
	gameIDAlphabet = "abcdefghjkmnpqrstuvwxyz23456789"
	gameIDLength   = 10
	// maxCreateAttempts bounds the retries when a generated game id is taken.
	maxCreateAttempts = 5
	tokenBytes        = 32
	// maxCreateBodyBytes bounds the create-game request, which only holds a name.
	maxCreateBodyBytes = 1 << 10
)

// Deps are the collaborators of a Server.
type Deps struct {
	Config  config.Config
	Store   *store.Store
	Catalog *pack.Catalog
	Decks   *decks.Importer
	Now     func() time.Time
	Logger  *slog.Logger
}

// Server serves the HTTP API and the game WebSocket endpoint.
type Server struct {
	deps Deps
	// newID generates game ids; tests replace it to force collisions.
	newID func() (string, error)
	// originPatterns are the host[:port] of the allowed origins, as expected
	// by websocket.AcceptOptions.
	originPatterns []string
}

// New builds a Server from its dependencies.
func New(d Deps) *Server {
	s := &Server{deps: d, newID: newGameID}
	for _, origin := range d.Config.AllowedOrigins {
		u, err := url.Parse(origin)
		if err != nil || u.Host == "" {
			d.Logger.Warn("ignoring unparsable allowed origin", "origin", origin)
			continue
		}
		s.originPatterns = append(s.originPatterns, u.Host)
	}
	return s
}

// Handler returns the routes: GET /healthz, POST /api/games and
// GET /ws/games/{id}.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", handleHealthz)
	mux.HandleFunc("POST /api/games", s.handleCreateGame)
	mux.HandleFunc("GET /ws/games/{id}", s.handleGameSocket)
	return s.withCORS(mux)
}

// Run blocks until ctx ends. It will own the background work of the server
// (event subscription) once there is some.
func (s *Server) Run(ctx context.Context) error {
	<-ctx.Done()
	return nil
}

func handleHealthz(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	// A failed write means the client is gone: there is nobody left to report it to.
	_, _ = io.WriteString(w, "ok")
}

// withCORS answers preflight requests and adds CORS headers for allowed
// origins. State-changing requests from other origins are refused: the
// browser would block the response anyway, but the game must not be created.
// Requests without an Origin header (curl, health checks) pass through.
func (s *Server) withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		allowed := slices.Contains(s.deps.Config.AllowedOrigins, origin)

		if allowed {
			w.Header().Add("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Origin", origin)
		}

		switch {
		case r.Method == http.MethodOptions:
			if allowed {
				w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			}
			w.WriteHeader(http.StatusNoContent)
		case r.Method == http.MethodPost && origin != "" && !allowed:
			writeError(w, http.StatusForbidden, "origin not allowed")
		default:
			next.ServeHTTP(w, r)
		}
	})
}

func (s *Server) handleCreateGame(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxCreateBodyBytes)
	var req createGameRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
		writeError(w, http.StatusBadRequest, "a name is required")
		return
	}

	token, err := newToken()
	if err != nil {
		s.deps.Logger.Error("generate token", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	id, err := s.createGame(r.Context(), token, req.Name)
	if errors.Is(err, game.ErrInvalid) {
		writeError(w, http.StatusBadRequest, "a name is required")
		return
	}
	if err != nil {
		s.deps.Logger.Error("create game", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	writeJSON(w, http.StatusCreated, createGameResponse{ID: id, Token: token})
}

// createGame stores a new game under a fresh id and returns that id. A taken
// id is retried with another one.
func (s *Server) createGame(ctx context.Context, hostToken, hostName string) (string, error) {
	for range maxCreateAttempts {
		id, err := s.newID()
		if err != nil {
			return "", err
		}
		g, err := game.NewGame(id, hostToken, hostName, s.deps.Now())
		if err != nil {
			return "", err
		}
		err = s.deps.Store.Create(ctx, g)
		if errors.Is(err, store.ErrExists) {
			continue
		}
		if err != nil {
			return "", err
		}
		return id, nil
	}
	return "", fmt.Errorf("no free game id after %d attempts", maxCreateAttempts)
}

// handleGameSocket checks that the game exists, upgrades the connection and
// hands it to serveConn.
func (s *Server) handleGameSocket(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, _, err := s.deps.Store.Load(r.Context(), id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "game not found")
			return
		}
		s.deps.Logger.Error("load game", "game_id", id, "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{OriginPatterns: s.originPatterns})
	if err != nil {
		// Accept has already replied to the client (403 for a bad origin).
		s.deps.Logger.Warn("websocket upgrade refused", "game_id", id, "error", err)
		return
	}
	s.serveConn(r.Context(), conn, id)
}

// serveConn runs a viewer's connection until it ends.
func (s *Server) serveConn(_ context.Context, conn *websocket.Conn, _ string) {
	_ = conn.Close(websocket.StatusNormalClosure, "not implemented yet")
}

func newGameID() (string, error) {
	id := make([]byte, gameIDLength)
	if _, err := rand.Read(id); err != nil {
		return "", fmt.Errorf("generate game id: %w", err)
	}
	for i, b := range id {
		// The alphabet has 31 letters; the modulo bias over 256 values is
		// irrelevant for an unguessable-enough public id.
		id[i] = gameIDAlphabet[int(b)%len(gameIDAlphabet)]
	}
	return string(id), nil
}

func newToken() (string, error) {
	raw := make([]byte, tokenBytes)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("generate token: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	// A failed write means the client is gone: there is nobody left to report it to.
	_ = json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, errorResponse{Error: message})
}
