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
	// statsScanTimeout bounds a scan of the game summaries. The scan runs
	// apart from the request that started it, as every request waiting for
	// the cache shares its result.
	statsScanTimeout = 10 * time.Second
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
// meanwhile wait for its result instead of each scanning Redis. The client
// that started the read may leave: the read goes on for the others. A failed
// read is not cached: the next request tries again.
func (s *Server) readStats(ctx context.Context) (statsResponse, error) {
	s.stats.mu.Lock()
	defer s.stats.mu.Unlock()

	now := s.deps.Now()
	if now.Before(s.stats.expires) {
		return s.stats.value, nil
	}
	scanCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), statsScanTimeout)
	defer cancel()
	summaries, err := s.deps.Store.GameSummaries(scanCtx)
	if err != nil {
		return statsResponse{}, err
	}
	s.stats.value = s.statsOf(summaries)
	s.stats.expires = now.Add(statsCacheTTL)
	return s.stats.value, nil
}

// statsOf names what the games being played are played with, and counts
// them. The list is sorted by random ref, so that its order tells nothing of
// where the games are stored.
func (s *Server) statsOf(summaries []game.Summary) statsResponse {
	var playing []playedGame
	for _, summary := range summaries {
		if summary.Phase == game.PhasePlaying {
			playing = append(playing, s.playedGameOf(summary))
		}
	}
	slices.SortFunc(playing, func(a, b playedGame) int { return strings.Compare(a.Ref, b.Ref) })
	return statsResponse{Games: len(playing), Playing: playing}
}

// playedGameOf names the codes of a summary from the catalog, in English, and
// sorts its heroes and sets by name. An unknown scenario gives an empty name;
// an unknown hero or set is left out.
func (s *Server) playedGameOf(summary game.Summary) playedGame {
	played := playedGame{Ref: summary.Ref, Difficulty: summary.Difficulty}
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
	codes := append([]string{summary.Standard, summary.Expert}, summary.Modulars...)
	for _, code := range codes {
		// The empty code of a set the game plays without is unknown too.
		if set, ok := s.deps.Catalog.Set(code); ok {
			played.Sets = append(played.Sets, set.Name)
		}
	}
	slices.SortFunc(played.Heroes, comparePlayedHeroes)
	slices.Sort(played.Sets)
	return played
}

// heroOf names an identity card: its hero face, or its first face when no
// face is a hero face, and its alter-ego face, or none when it has no such
// face. The card must have a face.
func heroOf(card pack.Card) playedHero {
	hero := playedHero{Hero: card.HeroFace().Name}
	if alterEgo, ok := card.FaceOfType(pack.FaceTypeAlterEgo); ok {
		hero.AlterEgo = card.Faces[alterEgo].Name
	}
	return hero
}

func comparePlayedHeroes(a, b playedHero) int {
	return cmp.Or(strings.Compare(a.Hero, b.Hero), strings.Compare(a.AlterEgo, b.AlterEgo))
}
