package game

import (
	"errors"
	"fmt"
	"slices"
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

func TestTakesPart(t *testing.T) {
	g := lobbyOfFour(t)
	if _, err := g.Join("e", "Fifth"); err != nil {
		t.Fatal(err)
	}

	tests := []struct {
		token string
		want  bool
	}{
		{"h", true},  // host
		{"b", true},  // player
		{"e", true},  // spectator
		{"x", false}, // stranger
		{"", false},
	}
	for _, tt := range tests {
		if got := g.TakesPart(tt.token); got != tt.want {
			t.Errorf("TakesPart(%q) = %t, want %t", tt.token, got, tt.want)
		}
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
	if got := g.Players[1].Name; got != strings.Repeat("é", maxNameRunes) {
		t.Errorf("name = %q, want %d runes", got, maxNameRunes)
	}

	// Multi-byte runes count once each, so a name of exactly maxNameRunes runes is kept whole.
	whole := strings.Repeat("ü", maxNameRunes)
	if _, err := g.Join("c", whole); err != nil {
		t.Fatal(err)
	}
	if got := g.Players[2].Name; got != whole {
		t.Errorf("name = %q, want %q kept whole", got, whole)
	}
}

func TestCleanNameStripsEmojis(t *testing.T) {
	sixteen := strings.Repeat("a", maxNameRunes)
	tests := []struct {
		name string
		in   string
		want string
	}{
		{"pictograph", "Brave 🔥", "Brave"},
		{"joined family", "👨\u200d👩\u200d👧 Alex", "Alex"},
		{"flag", "🇫🇷Alex", "Alex"},
		{"skin tone", "👍🏽Alex", "Alex"},
		{"keycap", "1\ufe0f\u20e3", "1"},
		{"inner spaces", "Iron  Man", "Iron  Man"},
		{"accented letter", "Zoé", "Zoé"},
		{"other script", "東京", "東京"},
		{"emojis not counted toward the limit", "🔥" + sixteen + "🔥b", sixteen},
		{"only emojis", "🔥🔥", ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := cleanName(tt.in); got != tt.want {
				t.Errorf("cleanName(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}

func TestJoinRejectsEmojiOnlyName(t *testing.T) {
	g := mustNewGame(t, "g1", "h", "Host", testNow)

	if _, err := g.Join("b", "🔥🔥"); !errors.Is(err, ErrInvalid) {
		t.Errorf("emoji-only name err = %v, want ErrInvalid", err)
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
		{"expert set on standard", "h", func(c *LobbyConfig) { c.Expert = "expert" }, ErrInvalid},
		{"other standard", "h", func(c *LobbyConfig) { c.Standard = "standard_iii" }, nil},
		{"unlisted PvP standard", "h", func(c *LobbyConfig) { c.Standard = "standard_pvp" }, ErrInvalid},
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

func TestConfigureNoStandard(t *testing.T) {
	cat := newCatalog(t)
	g := mustNewGame(t, "g1", "h", "Host", testNow)

	cfg := LobbyConfig{Scenario: "rhino", Difficulty: pack.Standard, Standard: "", Modulars: []string{"bomb_scare"}}
	if err := g.Configure("h", cfg, cat); err != nil {
		t.Errorf("config without a standard set rejected: %v", err)
	}
	if g.Config.Standard != "" {
		t.Errorf("standard = %q, want none", g.Config.Standard)
	}
}

func TestConfigureExpertWithoutExpertSet(t *testing.T) {
	cat := newCatalog(t)
	g := mustNewGame(t, "g1", "h", "Host", testNow)

	cfg := LobbyConfig{Scenario: "rhino", Difficulty: pack.Expert, Standard: "standard", Modulars: []string{"bomb_scare"}}
	if err := g.Configure("h", cfg, cat); err != nil {
		t.Errorf("expert config without an expert set rejected: %v", err)
	}
	if g.Config.Expert != "" {
		t.Errorf("expert = %q, want none", g.Config.Expert)
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

	err := g.SetDeck("b", 0, DeckChoice{Name: "Bad", Cards: []DeckEntry{{Code: "99999", Qty: 1}}}, cat)
	if err == nil || !strings.Contains(err.Error(), "99999") {
		t.Fatalf("err = %v, want a message naming 99999", err)
	}
	if g.Players[1].Decks[0] != nil {
		t.Error("a rejected deck must not be stored")
	}

	if err := g.SetDeck("zz", 0, DeckChoice{}, cat); !errors.Is(err, ErrForbidden) {
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
		{MaxCopies, false},
		{MaxCopies + 1, true},
	}
	for _, tt := range tests {
		t.Run(fmt.Sprintf("qty %d", tt.qty), func(t *testing.T) {
			g := lobbyOfFour(t)
			err := g.SetDeck("b", 0, DeckChoice{Name: "Deck", Cards: []DeckEntry{{Code: code, Qty: tt.qty}}}, cat)
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
	if err := g.SetDeck("b", 0, deck, cat); err != nil {
		t.Fatal(err)
	}
	if got := g.Players[1].Decks[0]; got == nil || got.Name != "Good" {
		t.Errorf("deck = %+v", got)
	}
}

func TestSetDeckFillsHeroImage(t *testing.T) {
	cat := newCatalog(t)
	spiderMan, _, err := cat.Card(spiderManIdentity)
	if err != nil {
		t.Fatal(err)
	}
	heroFaceImage := spiderMan.Faces[0].Images[0]

	tests := []struct {
		name string
		deck DeckChoice
		want string
	}{
		{"canonical code", DeckChoice{Hero: "01001"}, heroFaceImage},
		// The alter ego face code still gives the hero face.
		{"alter ego alias", DeckChoice{Hero: "01001b"}, heroFaceImage},
		{
			"client value overridden",
			DeckChoice{Hero: spiderManIdentity, HeroImage: "https://evil.example/x.png"},
			heroFaceImage,
		},
		{"client value without hero cleared", DeckChoice{HeroImage: "https://evil.example/x.png"}, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			g := lobbyOfFour(t)
			if err := g.SetDeck("b", 0, tt.deck, cat); err != nil {
				t.Fatal(err)
			}
			if got := g.Players[1].Decks[0].HeroImage; got != tt.want {
				t.Errorf("HeroImage = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestNewcomerGetsOneSlot(t *testing.T) {
	g := lobbyOfFour(t)
	if err := g.RemovePlayer("h", "b"); err != nil {
		t.Fatal(err)
	}
	if err := g.TakeSeat("b"); err != nil {
		t.Fatal(err)
	}

	// The host from NewGame, "c" and "d" from Join, "b" from TakeSeat.
	for _, p := range g.Players {
		if len(p.Decks) != 1 || p.Decks[0] != nil {
			t.Errorf("%s decks = %v, want one empty slot", p.Token, p.Decks)
		}
	}
}

func TestAddDeck(t *testing.T) {
	g := mustNewGame(t, "g1", "h", "Host", testNow)

	if err := g.AddDeck("h"); err != nil {
		t.Fatal(err)
	}
	if decks := g.Players[0].Decks; len(decks) != 2 || decks[1] != nil {
		t.Errorf("decks = %v, want two empty slots", decks)
	}
	if err := g.AddDeck("zz"); !errors.Is(err, ErrForbidden) {
		t.Errorf("AddDeck by a non-player = %v, want ErrForbidden", err)
	}
}

func TestAddDeckAfterStart(t *testing.T) {
	cat := newCatalog(t)
	g := startedGame(t, rhinoConfig())

	if err := g.AddDeck("h"); !errors.Is(err, ErrPhase) {
		t.Errorf("AddDeck after start = %v, want ErrPhase", err)
	}
	if err := g.RemoveDeck("h", 0); !errors.Is(err, ErrPhase) {
		t.Errorf("RemoveDeck after start = %v, want ErrPhase", err)
	}
	if err := g.SetDeck("h", 0, spiderManDeck(t, cat), cat); !errors.Is(err, ErrPhase) {
		t.Errorf("SetDeck after start = %v, want ErrPhase", err)
	}
}

func TestRemoveDeckShiftsSlots(t *testing.T) {
	g := mustNewGame(t, "g1", "h", "Host", testNow)
	a, b, c := &DeckChoice{Name: "A"}, &DeckChoice{Name: "B"}, &DeckChoice{Name: "C"}
	g.Players[0].Decks = []*DeckChoice{a, b, c}

	if err := g.RemoveDeck("h", 1); err != nil {
		t.Fatal(err)
	}
	if got := g.Players[0].Decks; !slices.Equal(got, []*DeckChoice{a, c}) {
		t.Errorf("decks = %v, want [A C]", got)
	}
	if err := g.RemoveDeck("zz", 0); !errors.Is(err, ErrForbidden) {
		t.Errorf("RemoveDeck by a non-player = %v, want ErrForbidden", err)
	}
}

func TestRemoveLastDeckRefused(t *testing.T) {
	g := mustNewGame(t, "g1", "h", "Host", testNow)

	if err := g.RemoveDeck("h", 0); !errors.Is(err, ErrInvalid) {
		t.Errorf("RemoveDeck of the last slot = %v, want ErrInvalid", err)
	}
	if err := g.AddDeck("h"); err != nil {
		t.Fatal(err)
	}
	for _, deck := range []int{-1, 2} {
		if err := g.RemoveDeck("h", deck); !errors.Is(err, ErrInvalid) {
			t.Errorf("RemoveDeck(%d) = %v, want ErrInvalid", deck, err)
		}
	}
	if len(g.Players[0].Decks) != 2 {
		t.Errorf("decks = %v, want both slots kept", g.Players[0].Decks)
	}
}

func TestSetDeckBadIndex(t *testing.T) {
	cat := newCatalog(t)
	g := mustNewGame(t, "g1", "h", "Host", testNow)

	for _, deck := range []int{-1, 1, 3} {
		if err := g.SetDeck("h", deck, spiderManDeck(t, cat), cat); !errors.Is(err, ErrInvalid) {
			t.Errorf("SetDeck(%d) of 1 slot = %v, want ErrInvalid", deck, err)
		}
	}
	if g.Players[0].Decks[0] != nil {
		t.Error("a rejected deck must not be stored")
	}
}

func TestSetDeckFillsItsSlot(t *testing.T) {
	cat := newCatalog(t)
	g := mustNewGame(t, "g1", "h", "Host", testNow)
	if err := g.AddDeck("h"); err != nil {
		t.Fatal(err)
	}

	if err := g.SetDeck("h", 1, DeckChoice{Name: "Second"}, cat); err != nil {
		t.Fatal(err)
	}
	decks := g.Players[0].Decks
	if decks[0] != nil || decks[1] == nil || decks[1].Name != "Second" {
		t.Errorf("decks = %v, want slot 1 filled only", decks)
	}
}

func TestSetDeckRefusesTakenHero(t *testing.T) {
	cat := newCatalog(t)
	g := lobbyOfFour(t)
	if err := g.SetDeck("b", 0, DeckChoice{Name: "Bob's", Hero: spiderManIdentity}, cat); err != nil {
		t.Fatal(err)
	}

	// The alter ego alias names the same identity.
	err := g.SetDeck("c", 0, DeckChoice{Name: "Mine", Hero: "01001b"}, cat)

	var taken *HeroTakenError
	if !errors.As(err, &taken) || !errors.Is(err, ErrInvalid) {
		t.Fatalf("SetDeck = %v, want a HeroTakenError wrapping ErrInvalid", err)
	}
	if taken.Hero != "Spider-Man (Peter Parker)" {
		t.Errorf("hero = %q, want Spider-Man (Peter Parker)", taken.Hero)
	}
	if g.Players[2].Decks[0] != nil {
		t.Error("a refused deck must not be stored")
	}
}

func TestSetDeckRefusesOwnOtherSlotHero(t *testing.T) {
	cat := newCatalog(t)
	g := mustNewGame(t, "g1", "h", "Host", testNow)
	if err := g.AddDeck("h"); err != nil {
		t.Fatal(err)
	}
	if err := g.SetDeck("h", 0, DeckChoice{Name: "First", Hero: spiderManIdentity}, cat); err != nil {
		t.Fatal(err)
	}

	err := g.SetDeck("h", 1, DeckChoice{Name: "Second", Hero: spiderManIdentity}, cat)

	var taken *HeroTakenError
	if !errors.As(err, &taken) {
		t.Fatalf("SetDeck = %v, want a HeroTakenError", err)
	}
	if taken.Hero != "Spider-Man (Peter Parker)" {
		t.Errorf("hero = %q, want Spider-Man (Peter Parker)", taken.Hero)
	}
	if g.Players[0].Decks[1] != nil {
		t.Error("a refused deck must not be stored")
	}
}

func TestSetDeckSameSlotSameHero(t *testing.T) {
	cat := newCatalog(t)
	g := mustNewGame(t, "g1", "h", "Host", testNow)
	if err := g.SetDeck("h", 0, DeckChoice{Name: "Old", Hero: spiderManIdentity}, cat); err != nil {
		t.Fatal(err)
	}

	if err := g.SetDeck("h", 0, DeckChoice{Name: "New", Hero: spiderManIdentity}, cat); err != nil {
		t.Fatalf("reloading the slot with its hero = %v, want nil", err)
	}
	if got := g.Players[0].Decks[0].Name; got != "New" {
		t.Errorf("deck = %q, want the new deck", got)
	}
}

func TestSetDeckSameNameOtherSubname(t *testing.T) {
	cat := newCatalog(t)
	g := lobbyOfFour(t)
	if err := g.SetDeck("b", 0, DeckChoice{Name: "Peter", Hero: spiderManIdentity}, cat); err != nil {
		t.Fatal(err)
	}

	if err := g.SetDeck("c", 0, DeckChoice{Name: "Miles", Hero: milesMoralesIdentity}, cat); err != nil {
		t.Errorf("Spider-Man (Miles Morales) next to Spider-Man (Peter Parker) = %v, want nil", err)
	}
}

func TestHeroTitleMatching(t *testing.T) {
	tests := []struct {
		name string
		a, b heroTitle
		want bool
	}{
		{"same", heroTitle{"Spider-Man", "Peter Parker"}, heroTitle{"Spider-Man", "Peter Parker"}, true},
		{"case and spaces", heroTitle{"Spider-Man", "Peter Parker"}, heroTitle{" spider-man ", "PETER PARKER "}, true},
		{"other subtitle", heroTitle{"Spider-Man", "Peter Parker"}, heroTitle{"Spider-Man", "Miles Morales"}, false},
		{"other name", heroTitle{"Spider-Man", "Peter Parker"}, heroTitle{"Venom", "Peter Parker"}, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.a.matches(tt.b); got != tt.want {
				t.Errorf("matches = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestHeroTitleLabel(t *testing.T) {
	if got := (heroTitle{"Spider-Man", "Peter Parker"}).label(); got != "Spider-Man (Peter Parker)" {
		t.Errorf("label = %q", got)
	}
	if got := (heroTitle{name: "Spider-Man"}).label(); got != "Spider-Man" {
		t.Errorf("label without subtitle = %q", got)
	}
}

func TestHeroImageFallsBackToFirstFace(t *testing.T) {
	cat := newCatalog(t)
	set, _ := cat.Set("standard")
	card, _, err := cat.Card(set.Cards[0])
	if err != nil {
		t.Fatal(err)
	}
	if card.Faces[0].Type == faceTypeHero {
		t.Fatalf("card %s has a hero face", card.Code)
	}

	if got, want := heroImage(cat, card.Code), card.Faces[0].Images[0]; got != want {
		t.Errorf("heroImage(%s) = %q, want %q", card.Code, got, want)
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
