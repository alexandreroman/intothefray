// Package server exposes the game over HTTP and WebSocket.
package server

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"slices"
	"strings"
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
	// createBodyTimeout bounds how long a client may take to send the
	// create-game request body.
	createBodyTimeout = 10 * time.Second
	// unknownGameTimeout bounds how long the error for an unknown game may
	// take to be written.
	unknownGameTimeout = 5 * time.Second
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
	hub  *hub
	// newID generates game ids; tests replace it to force collisions.
	newID func() (string, error)
	// originPatterns are the allowed origins as websocket.AcceptOptions
	// patterns: they hold the scheme, so the WebSocket check matches the
	// whole origin, like CORS does.
	originPatterns []string
	// touchInterval is how often Run resets the expiry of the games with
	// local viewers; tests shorten it.
	touchInterval time.Duration
	// createBodyTimeout is the read deadline of a create-game request body;
	// tests shorten it.
	createBodyTimeout time.Duration
}

// New builds a Server from its dependencies.
func New(d Deps) *Server {
	s := &Server{
		deps:              d,
		hub:               newHub(),
		newID:             newGameID,
		touchInterval:     touchInterval,
		createBodyTimeout: createBodyTimeout,
	}
	for _, origin := range d.Config.AllowedOrigins {
		s.originPatterns = append(s.originPatterns, patternEscaper.Replace(origin))
	}
	return s
}

// patternEscaper escapes the path.Match metacharacters that a valid origin
// may hold (the brackets of an IPv6 host), so that websocket.Accept matches
// the origin literally.
var patternEscaper = strings.NewReplacer(`\`, `\\`, "*", `\*`, "?", `\?`, "[", `\[`, "]", `\]`)

// Handler returns the routes: GET /healthz, POST /api/games and
// GET /ws/games/{id}.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", handleHealthz)
	mux.HandleFunc("POST /api/games", s.handleCreateGame)
	mux.HandleFunc("GET /ws/games/{id}", s.handleGameSocket)
	return s.withCORS(mux)
}

func handleHealthz(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	// A failed write means the client is gone: there is nobody left to report it to.
	_, _ = io.WriteString(w, "ok")
}

// withCORS answers preflight requests and adds CORS headers for allowed
// origins. Same-origin requests (the Origin host is the request's Host, as
// behind a reverse proxy that serves the frontend too) need no CORS headers.
// State-changing requests from other origins are refused: the browser would
// block the response anyway, but the game must not be created.
// Requests without an Origin header (curl, health checks) pass through.
func (s *Server) withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		allowed := slices.Contains(s.deps.Config.AllowedOrigins, origin)
		sameOrigin := isSameOrigin(origin, r.Host)

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
		case r.Method == http.MethodPost && origin != "" && !allowed && !sameOrigin:
			writeError(w, http.StatusForbidden, "origin not allowed")
		default:
			next.ServeHTTP(w, r)
		}
	})
}

// isSameOrigin reports whether origin points at host, the Host of the request.
// The scheme is ignored: behind a TLS-terminating proxy the server only sees
// plain http.
func isSameOrigin(origin, host string) bool {
	u, err := url.Parse(origin)
	if err != nil || u.Host == "" {
		return false
	}
	return strings.EqualFold(u.Host, host)
}

func (s *Server) handleCreateGame(w http.ResponseWriter, r *http.Request) {
	req, err := s.readCreateRequest(w, r)
	if err != nil || req.Name == "" {
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

// readCreateRequest decodes the create-game request body, bounded in size
// and in time. The read deadline is set here rather than as
// http.Server.ReadTimeout, which would also cut the WebSocket connections.
// It must stay in force until the reply is written, as net/http then drains
// the unread body; net/http resets it before the next request.
func (s *Server) readCreateRequest(w http.ResponseWriter, r *http.Request) (createGameRequest, error) {
	deadline := time.Now().Add(s.createBodyTimeout)
	if err := http.NewResponseController(w).SetReadDeadline(deadline); err != nil {
		// The body stays bounded in size: the request may go on.
		s.deps.Logger.Warn("set create-game read deadline", "error", err)
	}

	var req createGameRequest
	err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxCreateBodyBytes)).Decode(&req)
	return req, err
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

// statusGameNotFound is the close code sent for an unknown game. A browser
// cannot read the status of a refused upgrade (it only sees close code 1006),
// so the refusal is reported over the accepted WebSocket instead.
const statusGameNotFound = websocket.StatusCode(4404)

// handleGameSocket checks that the game exists, upgrades the connection and
// hands it to serveConn.
func (s *Server) handleGameSocket(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	_, _, err := s.deps.Store.Load(r.Context(), id)
	notFound := errors.Is(err, store.ErrNotFound)
	if err != nil && !notFound {
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
	if notFound {
		s.rejectUnknownGame(r.Context(), conn)
		return
	}
	s.serveConn(r.Context(), conn, id)
}

// rejectUnknownGame tells the viewer that its game does not exist, then
// closes the connection with statusGameNotFound.
func (s *Server) rejectUnknownGame(ctx context.Context, conn *websocket.Conn) {
	defer func() { _ = conn.CloseNow() }()

	msg, err := json.Marshal(errorMessage{Type: typeError, Code: codeNotFound, Message: errorTexts[codeNotFound]})
	if err != nil {
		return
	}
	writeCtx, cancel := context.WithTimeout(ctx, unknownGameTimeout)
	defer cancel()
	if err := conn.Write(writeCtx, websocket.MessageText, msg); err != nil {
		return
	}
	// A failed close means the client is gone: there is nobody left to report it to.
	_ = conn.Close(statusGameNotFound, "game not found")
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

// newSeed draws the seed of a game, from which all its randomness derives.
func newSeed() (uint64, error) {
	var raw [8]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return 0, fmt.Errorf("generate seed: %w", err)
	}
	return binary.LittleEndian.Uint64(raw[:]), nil
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
