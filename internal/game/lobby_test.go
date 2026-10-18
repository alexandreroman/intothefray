package game

import (
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/alexandreroman/intothefray/internal/pack"
	"github.com/alexandreroman/intothefray/packs"
)

var testNow = time.Date(2026, 10, 18, 12, 0, 0, 0, time.UTC)

func newCatalog(t *testing.T) *pack.Catalog {
	t.Helper()
	cat, err := packs.Catalog()
	if err != nil {
		t.Fatal(err)
	}
	return cat
}

// lobbyOfFour returns a game whose host is "h" and joiners are "b", "c", "d".
func lobbyOfFour(t *testing.T) *Game {
	t.Helper()
	g := mustNewGame(t, "g1", "h", "Host", testNow)
	for _, token := range []string{"b", "c", "d"} {
		if _, err := g.Join(token, "Player "+token); err != nil {
			t.Fatal(err)
		}
	}
	return g
}

func TestJoinSeatsThenSpectators(t *testing.T) {
	g := lobbyOfFour(t)

	for i, p := range g.Players {
		if p.Color != i {
			t.Errorf("player %d colour = %d, want %d", i, p.Color, i)
		}
	}
	if !g.Players[0].Host || g.Players[1].Host {
		t.Error("only the first player must be host")
	}

	role, err := g.Join("e", "Fifth")
	if err != nil || role != RoleSpectator {
		t.Fatalf("5th joiner = %v, %v; want spectator", role, err)
	}

	role, err = g.Join("b", "Whoever")
	if err != nil || role != RolePlayer {
		t.Fatalf("rejoin = %v, %v; want player", role, err)
	}
	if len(g.Players) != 4 || len(g.Spectators) != 1 {
		t.Errorf("got %d players, %d spectators; want 4 and 1", len(g.Players), len(g.Spectators))
	}
}

func TestJoinNormalizesName(t *testing.T) {
	g := mustNewGame(t, "g1", "h", "Host", testNow)

	if _, err := g.Join("b", "   "); !errors.Is(err, ErrInvalid) {
		t.Errorf("blank name err = %v, want ErrInvalid", err)
	}
	if _, err := g.Join("b", "  "+strings.Repeat("é", 30)+"  "); err != nil {
		t.Fatal(err)
	}
	if got := g.Players[1].Name; got != strings.Repeat("é", 24) {
		t.Errorf("name = %q, want 24 runes", got)
	}
}

func TestRemoveFreesColour(t *testing.T) {
	g := lobbyOfFour(t)

	if err := g.RemovePlayer("h", "b"); err != nil {
		t.Fatal(err)
	}
	if len(g.Players) != 3 || len(g.Spectators) != 1 || g.Spectators[0].Token != "b" {
		t.Fatalf("players=%d spectators=%v", len(g.Players), g.Spectators)
	}

	if _, err := g.Join("e", "Newcomer"); err != nil {
		t.Fatal(err)
	}
	last := g.Players[len(g.Players)-1]
	if last.Token != "e" || last.Color != 1 {
		t.Errorf("newcomer = %s colour %d, want e colour 1", last.Token, last.Color)
	}
}

func TestRemovePlayerRules(t *testing.T) {
	g := lobbyOfFour(t)

	if err := g.RemovePlayer("b", "c"); !errors.Is(err, ErrForbidden) {
		t.Errorf("non-host err = %v, want ErrForbidden", err)
	}
	if err := g.RemovePlayer("h", "h"); !errors.Is(err, ErrForbidden) {
		t.Errorf("remove host err = %v, want ErrForbidden", err)
	}
	if err := g.RemovePlayer("h", "zz"); !errors.Is(err, ErrNotFound) {
		t.Errorf("unknown err = %v, want ErrNotFound", err)
	}
	g.Phase = PhasePlaying
	if err := g.RemovePlayer("h", "b"); !errors.Is(err, ErrPhase) {
		t.Errorf("after start err = %v, want ErrPhase", err)
	}
}

func TestHostCannotLeave(t *testing.T) {
	g := lobbyOfFour(t)

	if err := g.Leave("h"); !errors.Is(err, ErrForbidden) {
		t.Errorf("Leave(host) = %v, want ErrForbidden", err)
	}
	if err := g.Leave("c"); err != nil {
		t.Fatal(err)
	}
	if len(g.Players) != 3 || g.Spectators[0].Token != "c" {
		t.Errorf("player c should be a spectator")
	}

	g.Phase = PhasePlaying
	if err := g.Leave("b"); !errors.Is(err, ErrPhase) {
		t.Errorf("Leave after start = %v, want ErrPhase", err)
	}
}

func TestTakeSeat(t *testing.T) {
	g := lobbyOfFour(t)
	if err := g.RemovePlayer("h", "b"); err != nil {
		t.Fatal(err)
	}
	if _, err := g.Join("e", "Fifth"); err != nil { // takes colour 1
		t.Fatal(err)
	}

	if err := g.TakeSeat("b"); !errors.Is(err, ErrInvalid) {
		t.Errorf("full table err = %v, want ErrInvalid", err)
	}
	if err := g.RemovePlayer("h", "c"); err != nil {
		t.Fatal(err)
	}
	if err := g.TakeSeat("b"); err != nil {
		t.Fatal(err)
	}
	last := g.Players[len(g.Players)-1]
	if last.Token != "b" || last.Name != "Player b" || last.Color != 2 {
		t.Errorf("seated = %+v, want b, Player b, colour 2", last)
	}
	if g.spectator("b") != nil {
		t.Error("the seated spectator is still listed among the spectators")
	}
	if err := g.TakeSeat("b"); err != nil {
		t.Errorf("already a player err = %v, want nil", err)
	}
	if err := g.TakeSeat("zz"); !errors.Is(err, ErrNotFound) {
		t.Errorf("unknown err = %v, want ErrNotFound", err)
	}
	g.Phase = PhasePlaying
	if err := g.TakeSeat("c"); !errors.Is(err, ErrPhase) {
		t.Errorf("after start err = %v, want ErrPhase", err)
	}
}

func TestConfigureValidates(t *testing.T) {
	cat := newCatalog(t)
	g := lobbyOfFour(t)
	valid := LobbyConfig{
		Scenario: "rhino", Difficulty: pack.Standard, Standard: "standard", Modulars: []string{"bomb_scare"},
	}

	tests := []struct {
		name   string
		caller string
		edit   func(*LobbyConfig)
		want   error
	}{
		{"valid", "h", func(*LobbyConfig) {}, nil},
		{"valid expert", "h", func(c *LobbyConfig) { c.Difficulty, c.Expert = pack.Expert, "expert" }, nil},
		{"unknown scenario", "h", func(c *LobbyConfig) { c.Scenario = "nope" }, ErrInvalid},
		{"expert without set", "h", func(c *LobbyConfig) { c.Difficulty = pack.Expert }, ErrInvalid},
		{"expert set on standard", "h", func(c *LobbyConfig) { c.Expert = "expert" }, ErrInvalid},
		{"modular as standard", "h", func(c *LobbyConfig) { c.Standard = "bomb_scare" }, ErrInvalid},
		{"standard as modular", "h", func(c *LobbyConfig) { c.Modulars = []string{"standard"} }, ErrInvalid},
		{"duplicate modular", "h", func(c *LobbyConfig) { c.Modulars = []string{"bomb_scare", "bomb_scare"} }, ErrInvalid},
		{"unknown difficulty", "h", func(c *LobbyConfig) { c.Difficulty = "heroic" }, ErrInvalid},
		{"non-host", "b", func(*LobbyConfig) {}, ErrForbidden},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := valid
			cfg.Modulars = []string{"bomb_scare"}
			tt.edit(&cfg)
			err := g.Configure(tt.caller, cfg, cat)
			if !errors.Is(err, tt.want) {
				t.Errorf("err = %v, want %v", err, tt.want)
			}
		})
	}

	g.Phase = PhasePlaying
	if err := g.Configure("h", valid, cat); !errors.Is(err, ErrPhase) {
		t.Errorf("after start err = %v, want ErrPhase", err)
	}
}

func TestConfigureNormalizesModulars(t *testing.T) {
	cat := newCatalog(t)
	g := mustNewGame(t, "g1", "h", "Host", testNow)

	cfg := LobbyConfig{Scenario: "rhino", Difficulty: pack.Standard, Standard: "standard"}
	if err := g.Configure("h", cfg, cat); err != nil {
		t.Fatal(err)
	}
	if g.Config.Modulars == nil {
		t.Error("Modulars is nil, want an empty slice")
	}
}

func TestDefaultConfigIsAccepted(t *testing.T) {
	cat := newCatalog(t)
	g := mustNewGame(t, "g1", "h", "Host", testNow)

	cfg := DefaultConfig(cat, "rhino")
	if cfg.Standard != "standard" || cfg.Expert != "" || cfg.Difficulty != pack.Standard {
		t.Errorf("cfg = %+v", cfg)
	}
	if len(cfg.Modulars) != 1 || cfg.Modulars[0] != "bomb_scare" {
		t.Errorf("modulars = %v, want [bomb_scare]", cfg.Modulars)
	}
	if err := g.Configure("h", cfg, cat); err != nil {
		t.Errorf("default config rejected: %v", err)
	}
}

func TestSetDeckRejectsUnknownCodes(t *testing.T) {
	cat := newCatalog(t)
	g := lobbyOfFour(t)

	err := g.SetDeck("b", DeckChoice{Name: "Bad", Cards: []DeckEntry{{Code: "99999", Qty: 1}}}, cat)
	if err == nil || !strings.Contains(err.Error(), "99999") {
		t.Fatalf("err = %v, want a message naming 99999", err)
	}
	if g.Players[1].Deck != nil {
		t.Error("a rejected deck must not be stored")
	}

	if err := g.SetDeck("zz", DeckChoice{}, cat); !errors.Is(err, ErrForbidden) {
		t.Errorf("non-player err = %v, want ErrForbidden", err)
	}
}

func TestSetDeckRejectsQuantities(t *testing.T) {
	cat := newCatalog(t)
	set, _ := cat.Set("standard")
	code := set.Cards[0]

	tests := []struct {
		qty     int
		wantErr bool
	}{
		{-1, true},
		{0, true},
		{1, false},
		{maxCopies, false},
		{maxCopies + 1, true},
	}
	for _, tt := range tests {
		t.Run(fmt.Sprintf("qty %d", tt.qty), func(t *testing.T) {
			g := lobbyOfFour(t)
			err := g.SetDeck("b", DeckChoice{Name: "Deck", Cards: []DeckEntry{{Code: code, Qty: tt.qty}}}, cat)
			if tt.wantErr && !errors.Is(err, ErrInvalid) {
				t.Errorf("SetDeck = %v, want ErrInvalid", err)
			}
			if !tt.wantErr && err != nil {
				t.Errorf("SetDeck = %v, want nil", err)
			}
		})
	}
}

func TestSetDeckStoresDeck(t *testing.T) {
	cat := newCatalog(t)
	g := lobbyOfFour(t)

	set, _ := cat.Set("standard")
	deck := DeckChoice{Name: "Good", Cards: []DeckEntry{{Code: set.Cards[0], Qty: 2}}}
	if err := g.SetDeck("b", deck, cat); err != nil {
		t.Fatal(err)
	}
	if got := g.Players[1].Deck; got == nil || got.Name != "Good" {
		t.Errorf("deck = %+v", got)
	}
}

func TestJoinAfterStartIsSpectator(t *testing.T) {
	g := mustNewGame(t, "g1", "h", "Host", testNow)
	g.Phase = PhasePlaying

	role, err := g.Join("x", "Late")
	if err != nil || role != RoleSpectator {
		t.Errorf("late joiner = %v, %v; want spectator", role, err)
	}
}

func TestEnd(t *testing.T) {
	g := lobbyOfFour(t)

	if err := g.End("b"); !errors.Is(err, ErrForbidden) {
		t.Errorf("non-host err = %v, want ErrForbidden", err)
	}
	if err := g.End("h"); err != nil || g.Phase != PhaseEnded {
		t.Errorf("End = %v, phase %s", err, g.Phase)
	}
	if err := g.End("h"); !errors.Is(err, ErrPhase) {
		t.Errorf("second End err = %v, want ErrPhase", err)
	}
}

func mustNewGame(t *testing.T, id, hostToken, hostName string, now time.Time) *Game {
	t.Helper()

	g, err := NewGame(id, hostToken, hostName, now)
	if err != nil {
		t.Fatalf("NewGame: %v", err)
	}
	return g
}

func TestNewGameEmptyName(t *testing.T) {
	for _, name := range []string{"", "   ", "\t\n"} {
		if _, err := NewGame("g1", "h", name, testNow); !errors.Is(err, ErrInvalid) {
			t.Errorf("NewGame(%q) error = %v, want ErrInvalid", name, err)
		}
	}
}
