package game

import (
	"slices"

	"github.com/alexandreroman/intothefray/internal/pack"
)

// Summary is what a game is played with, small enough to be read for every
// game at once. Besides codes, it holds only the game's StatsRef: nothing that
// leads to the game or names its players.
type Summary struct {
	Ref      string `json:"ref,omitempty"` // the game's StatsRef
	Phase    Phase  `json:"phase"`
	Scenario string `json:"scenario,omitempty"` // LobbyConfig.Scenario
	// Difficulty, Standard and Expert are those of LobbyConfig; a set code is
	// empty when the game plays without that set.
	Difficulty pack.Difficulty `json:"difficulty"`
	Standard   string          `json:"standard,omitempty"`
	Expert     string          `json:"expert,omitempty"`
	Modulars   []string        `json:"modulars,omitempty"` // LobbyConfig.Modulars codes
	// Heroes are the identity codes (DeckChoice.Hero) of the loaded decks, in
	// seat order.
	Heroes []string `json:"heroes,omitempty"`
}

// Summary returns what the game is played with.
func (g *Game) Summary() Summary {
	var heroes []string
	for _, p := range g.Players {
		for _, deck := range p.Decks {
			// A nil slot is a deck not loaded yet.
			if deck != nil {
				heroes = append(heroes, deck.Hero)
			}
		}
	}
	return Summary{
		Ref:        g.StatsRef,
		Phase:      g.Phase,
		Scenario:   g.Config.Scenario,
		Difficulty: g.Config.Difficulty,
		Standard:   g.Config.Standard,
		Expert:     g.Config.Expert,
		Modulars:   slices.Clone(g.Config.Modulars),
		Heroes:     heroes,
	}
}
