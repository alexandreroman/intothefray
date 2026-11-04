package game

import (
	"encoding/json"
	"slices"
	"strings"
	"testing"

	"github.com/alexandreroman/intothefray/internal/pack"
)

func TestSummary(t *testing.T) {
	g := twoSlotLobby(t)
	g.StatsRef = "0123456789abcdef"
	g.Config = LobbyConfig{
		Scenario:   "rhino",
		Difficulty: pack.Expert,
		Standard:   "standard_ii",
		Expert:     "expert_ii",
		Modulars:   []string{"bomb_scare", "masters_of_evil"},
	}
	// Alex loads his second slot only; Sam loads his single slot.
	g.Players[0].Decks[1] = &DeckChoice{Hero: "01001a", Name: "Alex's deck", URL: "https://example.com/1"}
	g.Players[1].Decks[0] = &DeckChoice{Hero: "01040a", Name: "Sam's deck", URL: "https://example.com/2"}

	got := g.Summary()

	if got.Ref != "0123456789abcdef" {
		t.Errorf("Ref = %q, want the game's StatsRef", got.Ref)
	}
	if got.Phase != PhaseLobby {
		t.Errorf("Phase = %q, want %q", got.Phase, PhaseLobby)
	}
	if got.Scenario != "rhino" {
		t.Errorf("Scenario = %q, want rhino", got.Scenario)
	}
	if got.Difficulty != pack.Expert || got.Standard != "standard_ii" || got.Expert != "expert_ii" {
		t.Errorf("Difficulty, Standard, Expert = %q, %q, %q, want expert, standard_ii, expert_ii",
			got.Difficulty, got.Standard, got.Expert)
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

func TestViewHidesStatsRef(t *testing.T) {
	g := mustNewGame(t, "g1", "a", "Alex", testNow)
	g.StatsRef = "0123456789abcdef"

	data, err := json.Marshal(g.ViewFor("a"))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), g.StatsRef) {
		t.Errorf("view = %s, want no statistics reference in it", data)
	}
}
