package server

import (
	"cmp"
	"context"
	"net/http"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/alexandreroman/intothefray/internal/game"
	"github.com/alexandreroman/intothefray/internal/pack"
)

const (
	// statsCacheTTL is how long an instance reuses its statistics before it
	// scans Redis again.
	statsCacheTTL = time.Minute
	// statsCacheControl lets browsers and proxies keep a reply as long as the
	// instance keeps its statistics.
	statsCacheControl = "public, max-age=60"
)

// statsCache is the reply of GET /api/stats, cached for statsCacheTTL.
type statsCache struct {
	mu      sync.Mutex
	value   statsResponse
	expires time.Time
}

// handleStats tells how many games are being played and what they are played
// with. Only games in the playing phase count; lobbies and ended games are
// left out. Both come from the game summaries the store keeps next to the
// games, the game:*:info keys, each written and expiring with its game. No
// game value is read.
func (s *Server) handleStats(w http.ResponseWriter, r *http.Request) {
	stats, err := s.readStats(r.Context())
	if err != nil {
		s.deps.Logger.Warn("read game statistics", "error", err)
		writeUncachedError(w, http.StatusServiceUnavailable, "statistics unavailable")
		return
	}
	w.Header().Set("Cache-Control", statsCacheControl)
	writeJSON(w, http.StatusOK, stats)
}

// readStats returns the cached statistics, or reads them again once the cache
// has expired. The lock is held during the read, so that requests arriving
// meanwhile wait for its result instead of each scanning Redis. A failed read
// is not cached: the next request tries again.
func (s *Server) readStats(ctx context.Context) (statsResponse, error) {
	s.stats.mu.Lock()
	defer s.stats.mu.Unlock()

	now := s.deps.Now()
	if now.Before(s.stats.expires) {
		return s.stats.value, nil
	}
	summaries, err := s.deps.Store.GameSummaries(ctx)
	if err != nil {
		return statsResponse{}, err
	}
	s.stats.value = s.statsOf(summaries)
	s.stats.expires = now.Add(statsCacheTTL)
	return s.stats.value, nil
}

// statsOf names what the games being played are played with, and counts
// them. The list is sorted by content, so that its order tells nothing of
// where the games are stored.
func (s *Server) statsOf(summaries []game.Summary) statsResponse {
	playing := []playedGame{}
	for _, summary := range summaries {
		if summary.Phase == game.PhasePlaying {
			playing = append(playing, s.playedGameOf(summary))
		}
	}
	slices.SortFunc(playing, comparePlayedGames)
	return statsResponse{Games: len(playing), Playing: playing}
}

// playedGameOf names the codes of a summary from the catalog, in English. An
// unknown scenario gives an empty name; an unknown hero or modular set is left
// out.
func (s *Server) playedGameOf(summary game.Summary) playedGame {
	played := playedGame{Ref: summary.Ref, Heroes: []playedHero{}, Modulars: []string{}}
	if scenario, ok := s.deps.Catalog.Scenario(summary.Scenario); ok {
		played.Scenario = scenario.Name
	}
	for _, code := range summary.Heroes {
		card, _, err := s.deps.Catalog.Card(code)
		if err != nil || len(card.Faces) == 0 {
			continue
		}
		played.Heroes = append(played.Heroes, heroOf(card))
	}
	for _, code := range summary.Modulars {
		if set, ok := s.deps.Catalog.Set(code); ok {
			played.Modulars = append(played.Modulars, set.Name)
		}
	}
	return played
}

// heroOf names an identity card: its hero face, or its first face when no
// face is a hero face, and its alter-ego face, or none when it has no such
// face. The card must have a face.
func heroOf(card pack.Card) playedHero {
	hero := playedHero{Hero: card.Faces[0].Name}
	if face, ok := faceOfType(card, pack.FaceTypeHero); ok {
		hero.Hero = face.Name
	}
	if face, ok := faceOfType(card, pack.FaceTypeAlterEgo); ok {
		hero.AlterEgo = face.Name
	}
	return hero
}

// faceOfType returns the first face of the card with the given type.
func faceOfType(card pack.Card, faceType string) (pack.Face, bool) {
	for _, face := range card.Faces {
		if face.Type == faceType {
			return face, true
		}
	}
	return pack.Face{}, false
}

// comparePlayedGames orders games by scenario, then heroes, then modular sets,
// and games played with the same by reference, so the order is always the same.
func comparePlayedGames(a, b playedGame) int {
	return cmp.Or(
		strings.Compare(a.Scenario, b.Scenario),
		slices.CompareFunc(a.Heroes, b.Heroes, comparePlayedHeroes),
		slices.Compare(a.Modulars, b.Modulars),
		strings.Compare(a.Ref, b.Ref),
	)
}

func comparePlayedHeroes(a, b playedHero) int {
	return cmp.Or(strings.Compare(a.Hero, b.Hero), strings.Compare(a.AlterEgo, b.AlterEgo))
}
