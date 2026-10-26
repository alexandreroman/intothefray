package game

import (
	"errors"
	"slices"
	"testing"

	"github.com/alexandreroman/intothefray/internal/pack"
)

// underlingConfig returns the setup of an Underling scenario with the given
// modular sets, main scheme set included.
func underlingConfig(scenario string, modulars ...string) LobbyConfig {
	return LobbyConfig{
		Scenario:   scenario,
		Difficulty: pack.Standard,
		Standard:   "standard",
		Modulars:   modulars,
	}
}

// encounterCount returns the number of copies of code in the encounter deck.
func encounterCount(table *Table, code string) int {
	count := 0
	for _, id := range table.Piles[PileEncounter].Cards {
		if table.Cards[id].Code == code {
			count++
		}
	}
	return count
}

// stageWithKey returns the stage with the given key.
func stageWithKey(t *testing.T, table *Table, key string) *Stage {
	t.Helper()
	i := slices.IndexFunc(table.Stages, func(s *Stage) bool { return s.Key == key })
	if i < 0 {
		t.Fatalf("no stage %q", key)
	}
	return table.Stages[i]
}

// stageCodes returns the codes of a stage's cards, in stage order.
func stageCodes(table *Table, stage *Stage) []string {
	codes := make([]string, 0, len(stage.Cards))
	for _, id := range stage.Cards {
		codes = append(codes, table.Cards[id].Code)
	}
	return codes
}

func TestConfigureMainSchemes(t *testing.T) {
	cat := newCatalog(t)
	g := mustNewGame(t, "g1", "h", "Host", testNow)

	tests := []struct {
		name string
		cfg  LobbyConfig
		want error
	}{
		{"underling with a main scheme", underlingConfig("bullseye", "art_museum_heist", "cops", "the_owl"), nil},
		{"underling without a main scheme", underlingConfig("bullseye", "cops"), nil},
		{"main scheme for a classic villain", underlingConfig("rhino", "art_museum_heist"), ErrInvalid},
		{"main scheme for Kingpin", underlingConfig("kingpin", "art_museum_heist"), ErrInvalid},
		{"two main schemes", underlingConfig("bullseye", "art_museum_heist", "the_getaway"), ErrInvalid},
		{"duplicate main scheme", underlingConfig("bullseye", "art_museum_heist", "art_museum_heist"), ErrInvalid},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := g.Configure("h", tt.cfg, cat)
			if !errors.Is(err, tt.want) {
				t.Errorf("err = %v, want %v", err, tt.want)
			}
		})
	}
}

func TestStartRequiresMainScheme(t *testing.T) {
	cat := newCatalog(t)
	g := mustNewGame(t, "g1", "h", "Host", testNow)
	if err := g.Configure("h", underlingConfig("bullseye", "cops"), cat); err != nil {
		t.Fatal(err)
	}
	seatDeck(t, g, "h", 0, spiderManDeck(t, cat), cat)

	if err := g.Start("h", cat, testSeed, testNow); !errors.Is(err, ErrInvalid) {
		t.Errorf("Start = %v, want ErrInvalid", err)
	}
	if g.Phase != PhaseLobby || g.Table != nil {
		t.Errorf("phase = %q, table = %v, want the lobby intact", g.Phase, g.Table)
	}
}

func TestSetupMainSchemeStage(t *testing.T) {
	cat := newCatalog(t)
	table := startedGame(t, underlingConfig("bullseye", "art_museum_heist", "cops", "the_owl")).Table

	villains := stageWithKey(t, table, "villain")
	if got, want := stageCodes(table, villains), []string{"60065", "60066", "60067"}; !slices.Equal(got, want) {
		t.Errorf("villain stage = %v, want %v", got, want)
	}
	villain := cardWithCode(t, table, "60065")
	if villains.Current != villain.ID || villain.Zone != ZoneTable || villain.Face != 0 || villain.X != 360 {
		t.Errorf("Bullseye I = %+v, want the current villain at x 360, face 0", villain)
	}
	for _, code := range []string{"60066", "60067"} {
		if c := cardWithCode(t, table, code); c.Zone != ZoneStage {
			t.Errorf("%s zone = %q, want stage", code, c.Zone)
		}
	}

	schemes := stageWithKey(t, table, "scheme")
	if schemes.Label != "Main scheme" {
		t.Errorf("scheme stage label = %q, want Main scheme", schemes.Label)
	}
	if got, want := stageCodes(table, schemes), []string{"60121"}; !slices.Equal(got, want) {
		t.Errorf("scheme stage = %v, want %v", got, want)
	}
	// The main scheme lies 50 past the villain at 360–500, as a classic one.
	scheme := cardWithCode(t, table, "60121")
	if schemes.Current != scheme.ID || scheme.Zone != ZoneTable || scheme.Face != 0 || scheme.X != 550 ||
		scheme.Y != 30 {
		t.Errorf("Art Museum Heist = %+v, want the current scheme at (550, 30), face 0", scheme)
	}
	if scheme.Home != PileEncounter {
		t.Errorf("Art Museum Heist home = %q, want the encounter deck", scheme.Home)
	}

	set, ok := cat.Set("art_museum_heist")
	if !ok {
		t.Fatal("no set art_museum_heist")
	}
	for _, code := range set.Cards {
		card, _, err := cat.Card(code)
		if err != nil {
			t.Fatal(err)
		}
		want := card.Quantity
		if card.Code == "60121" {
			want = 0
		}
		if got := encounterCount(table, card.Code); got != want {
			t.Errorf("%s copies in the encounter deck = %d, want %d", card.Code, got, want)
		}
	}
}

func TestSetupMainSchemeStageOfSeveralSchemes(t *testing.T) {
	table := startedGame(t, underlingConfig("hammerhead", "protection_racket")).Table

	schemes := stageWithKey(t, table, "scheme")
	want := []string{"60134", "60135", "60136", "60137", "60138"}
	if got := stageCodes(table, schemes); !slices.Equal(got, want) {
		t.Errorf("scheme stage = %v, want %v", got, want)
	}
	top := cardWithCode(t, table, "60134")
	if schemes.Current != top.ID || top.Zone != ZoneTable || top.Face != 0 {
		t.Errorf("60134 = %+v, want the current scheme, face 0", top)
	}
	for _, code := range want {
		if n := encounterCount(table, code); n != 0 {
			t.Errorf("%s copies in the encounter deck = %d, want 0", code, n)
		}
	}
}

func TestSetupMainSchemeSetInPlay(t *testing.T) {
	table := startedGame(t, underlingConfig("electro", "stop_the_presses")).Table

	if c := cardWithCode(t, table, "60152"); c.Zone != ZoneTable {
		t.Errorf("Daily Bugle zone = %q, want table", c.Zone)
	}
	if n := encounterCount(table, "60152"); n != 0 {
		t.Errorf("Daily Bugle copies in the encounter deck = %d, want 0", n)
	}
}

func TestSetupTyphoidMaryInPlay(t *testing.T) {
	table := startedGame(t, underlingConfig("typhoid_mary", "art_museum_heist")).Table

	for _, code := range []string{"60112", "60113"} {
		if c := cardWithCode(t, table, code); c.Zone != ZoneTable || c.Face != 0 {
			t.Errorf("%s = %+v, want on the table, face 0", code, c)
		}
	}
}

func TestStartLogsTheMainScheme(t *testing.T) {
	g := startedGame(t, underlingConfig("bullseye", "art_museum_heist", "cops", "the_owl"))

	want := "started the game (Bullseye, Art Museum Heist, Cops, The Owl)"
	if len(g.Log) != 1 || g.Log[0].Text != want {
		t.Errorf("log = %v, want %q", g.Log, want)
	}
}
