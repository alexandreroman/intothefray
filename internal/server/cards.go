package server

import (
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/alexandreroman/intothefray/internal/game"
	"github.com/alexandreroman/intothefray/internal/pack"
	"github.com/alexandreroman/intothefray/internal/store"
)

const (
	// cardPoolVersion is the version of the card pool format.
	cardPoolVersion = 1
	// cardPoolCacheControl lets the pool be cached for as long as a game
	// may live: no action creates a card, so the pool of a game never
	// changes once its table is set up. Not "public": withCORS adds
	// "Vary: Origin" only for allowed origins, so a shared cache could
	// serve a reply without Access-Control-Allow-Origin to them.
	cardPoolCacheControl = "max-age=86400, immutable"
	// etagBytes is how much of the SHA-256 of the body goes into the ETag.
	etagBytes = 16
)

// cardPoolResponse is the body of GET /api/games/{id}/cards: the definitions
// of the distinct cards of the table, sorted by canonical code. It holds no
// card id, count, pile or order, so it reveals nothing about hidden cards.
type cardPoolResponse struct {
	Version int         `json:"version"`
	Cards   []pack.Card `json:"cards"`
}

// handleGameCards serves the card pool of a started game, compressed when
// the client accepts gzip and cacheable by ETag.
func (s *Server) handleGameCards(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	g, _, err := s.deps.Store.Load(r.Context(), id)
	if errors.Is(err, store.ErrNotFound) {
		writeUncachedError(w, http.StatusNotFound, "game not found")
		return
	}
	if err != nil {
		s.deps.Logger.Error("load game", "game_id", id, "error", err)
		writeUncachedError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if g.Table == nil {
		writeUncachedError(w, http.StatusConflict, "the game has not started")
		return
	}

	body, err := s.cardPool(g.Table)
	if err != nil {
		s.deps.Logger.Error("build card pool", "game_id", id, "error", err)
		writeUncachedError(w, http.StatusInternalServerError, "internal error")
		return
	}

	etag := strongETag(body)
	if etagMatches(r.Header.Get("If-None-Match"), etag) {
		setCardPoolCaching(w.Header(), etag)
		w.WriteHeader(http.StatusNotModified)
		return
	}

	compressed := acceptsGzip(r.Header.Get("Accept-Encoding"))
	if compressed {
		body, err = gzipBytes(body)
		if err != nil {
			s.deps.Logger.Error("compress card pool", "game_id", id, "error", err)
			writeUncachedError(w, http.StatusInternalServerError, "internal error")
			return
		}
	}

	h := w.Header()
	setCardPoolCaching(h, etag)
	h.Set("Content-Type", "application/json")
	if compressed {
		h.Set("Content-Encoding", "gzip")
	}
	h.Set("Content-Length", strconv.Itoa(len(body)))
	w.WriteHeader(http.StatusOK)
	// A failed write means the client is gone: there is nobody left to report it to.
	_, _ = w.Write(body) //nolint:gosec // JSON built from the catalog, served as application/json
}

// setCardPoolCaching sets the caching headers shared by the 200 and 304
// replies of the card pool. The ETag is that of the JSON body whatever its
// encoding: the Vary header keeps the encodings apart in caches.
func setCardPoolCaching(h http.Header, etag string) {
	h.Set("ETag", etag)
	h.Set("Cache-Control", cardPoolCacheControl)
	h.Add("Vary", "Accept-Encoding")
}

// cardPool returns the JSON pool of the table's cards, resolved through the
// catalog.
func (s *Server) cardPool(table *game.Table) ([]byte, error) {
	codes := table.CardCodes()
	pool := cardPoolResponse{Version: cardPoolVersion, Cards: make([]pack.Card, 0, len(codes))}
	for _, code := range codes {
		card, _, err := s.deps.Catalog.Card(code)
		if err != nil {
			return nil, err
		}
		pool.Cards = append(pool.Cards, card)
	}
	return json.Marshal(pool)
}

// strongETag returns a quoted ETag derived from a truncated SHA-256 of body.
func strongETag(body []byte) string {
	sum := sha256.Sum256(body)
	return `"` + hex.EncodeToString(sum[:etagBytes]) + `"`
}

// etagMatches reports whether an If-None-Match header names etag. The header
// is "*" or a comma-separated list of ETags; If-None-Match compares them
// weakly, so a W/ prefix is ignored.
func etagMatches(ifNoneMatch, etag string) bool {
	for candidate := range strings.SplitSeq(ifNoneMatch, ",") {
		candidate = strings.TrimSpace(candidate)
		if candidate == "*" || strings.TrimPrefix(candidate, "W/") == etag {
			return true
		}
	}
	return false
}

// acceptsGzip reports whether an Accept-Encoding header allows gzip: gzip
// (or x-gzip) is listed with a non-zero quality, or it is not listed and the
// "*" wildcard is.
func acceptsGzip(acceptEncoding string) bool {
	// notListed marks a coding absent from the header.
	const notListed = -1.0
	gzipQuality, wildcardQuality := notListed, notListed

	for entry := range strings.SplitSeq(acceptEncoding, ",") {
		coding, params, _ := strings.Cut(entry, ";")
		switch strings.ToLower(strings.TrimSpace(coding)) {
		case "gzip", "x-gzip":
			gzipQuality = quality(params)
		case "*":
			wildcardQuality = quality(params)
		}
	}

	if gzipQuality != notListed {
		return gzipQuality > 0
	}
	return wildcardQuality > 0
}

// quality returns the q parameter of an Accept-Encoding entry, given its
// parameters (what follows the first ";"). It is 1 without a q parameter and
// 0 for an invalid one.
func quality(params string) float64 {
	for param := range strings.SplitSeq(params, ";") {
		name, value, _ := strings.Cut(param, "=")
		if !strings.EqualFold(strings.TrimSpace(name), "q") {
			continue
		}
		q, err := strconv.ParseFloat(strings.TrimSpace(value), 64)
		if err != nil || q < 0 {
			return 0
		}
		return q
	}
	return 1
}

// gzipBytes compresses data with gzip.
func gzipBytes(data []byte) ([]byte, error) {
	var buf bytes.Buffer
	zw := gzip.NewWriter(&buf)
	if _, err := zw.Write(data); err != nil {
		return nil, fmt.Errorf("gzip: %w", err)
	}
	if err := zw.Close(); err != nil {
		return nil, fmt.Errorf("gzip: %w", err)
	}
	return buf.Bytes(), nil
}

// writeUncachedError writes an error that caches must not keep: the same
// URL may succeed later, once the game starts.
func writeUncachedError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Cache-Control", "no-store")
	writeError(w, status, message)
}
