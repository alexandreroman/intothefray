package game

import "slices"

// Summary is what a game is played with, small enough to be read for every
// game at once. Besides codes, it holds only the game's StatsRef: nothing that
// leads to the game or names its players.
type Summary struct {
	// Ref is the game's StatsRef, empty for a game created without one.
	Ref      string   `json:"ref,omitempty"`
	Phase    Phase    `json:"phase"`
	Scenario string   `json:"scenario,omitempty"` // LobbyConfig.Scenario
	Modulars []string `json:"modulars,omitempty"` // LobbyConfig.Modulars codes
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
		Ref:      g.StatsRef,
		Phase:    g.Phase,
		Scenario: g.Config.Scenario,
		Modulars: slices.Clone(g.Config.Modulars),
		Heroes:   heroes,
	}
}
