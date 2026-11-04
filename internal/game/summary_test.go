package game

import (
	"slices"
	"testing"
)

func TestSummary(t *testing.T) {
	g := twoSlotLobby(t)
	g.Config = LobbyConfig{Scenario: "rhino", Modulars: []string{"bomb_scare", "masters_of_evil"}}
	// Alex loads his second slot only; Sam loads his single slot.
	g.Players[0].Decks[1] = &DeckChoice{Hero: "01001a", Name: "Alex's deck", URL: "https://example.com/1"}
	g.Players[1].Decks[0] = &DeckChoice{Hero: "01040a", Name: "Sam's deck", URL: "https://example.com/2"}

	got := g.Summary()

	if got.Phase != PhaseLobby {
		t.Errorf("Phase = %q, want %q", got.Phase, PhaseLobby)
	}
	if got.Scenario != "rhino" {
		t.Errorf("Scenario = %q, want rhino", got.Scenario)
	}
	if want := []string{"bomb_scare", "masters_of_evil"}; !slices.Equal(got.Modulars, want) {
		t.Errorf("Modulars = %v, want %v", got.Modulars, want)
	}
	if want := []string{"01001a", "01040a"}; !slices.Equal(got.Heroes, want) {
		t.Errorf("Heroes = %v, want %v (seat order, loaded decks only)", got.Heroes, want)
	}
}

func TestSummaryDoesNotShareTheConfig(t *testing.T) {
	g := mustNewGame(t, "g1", "a", "Alex", testNow)
	g.Config.Modulars = []string{"bomb_scare"}

	summary := g.Summary()
	g.Config.Modulars[0] = "masters_of_evil"

	if summary.Modulars[0] != "bomb_scare" {
		t.Errorf("Modulars = %v, want the modulars at the time of the summary", summary.Modulars)
	}
}

func TestSummaryWithoutDecks(t *testing.T) {
	g := mustNewGame(t, "g1", "a", "Alex", testNow)

	if got := g.Summary(); len(got.Heroes) != 0 {
		t.Errorf("Heroes = %v, want none", got.Heroes)
	}
}
