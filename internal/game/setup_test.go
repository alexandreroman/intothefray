package game

import (
	"errors"
	"fmt"
	"math/rand/v2"
	"slices"
	"strings"
	"testing"

	"github.com/alexandreroman/intothefray/internal/pack"
)

// testSeed is the seed of the test games: setup must be reproducible.
const testSeed = 1

// newTestRNG returns a fixed-seed generator for the functions that take one.
func newTestRNG() *rand.Rand {
	return rand.New(rand.NewPCG(1, 2)) //nolint:gosec // deterministic test fixture
}

const spiderManIdentity = "01001a"

// spiderManDeck builds a deck from the catalog's spider_man set, without the
// identity and the obligation, plus ten basic cards. The identity is listed
// too, under an alias, to check that setup skips it.
func spiderManDeck(t *testing.T, cat *pack.Catalog) DeckChoice {
	t.Helper()
	set, ok := cat.Set("spider_man")
	if !ok {
		t.Fatal("no spider_man set")
	}
	hero, ok := cat.HeroByIdentity(spiderManIdentity)
	if !ok {
		t.Fatal("no spider-man hero")
	}

	deck := DeckChoice{Name: "Spidey", Hero: spiderManIdentity, HeroName: "Spider-Man"}
	deck.Cards = append(deck.Cards, DeckEntry{Code: spiderManIdentity, Qty: 1})
	for _, code := range set.Cards {
		if code == hero.Identity || code == hero.Obligation {
			continue
		}
		deck.Cards = append(deck.Cards, DeckEntry{Code: code, Qty: 1})
	}

	basics := 0
	for number := 1050; basics < 10 && number < 1100; number++ {
		code := fmt.Sprintf("%05d", number)
		card, _, err := cat.Card(code)
		if err != nil || card.Back != pack.BackPlayer || card.Set != "" {
			continue
		}
		deck.Cards = append(deck.Cards, DeckEntry{Code: code, Qty: 1})
		basics++
	}
	if basics < 10 {
		t.Fatalf("found only %d basic cards", basics)
	}
	return deck
}

// expectedDeckCodes returns the sorted canonical codes the deck must hold at
// setup: every copy of every entry, except the identity.
func expectedDeckCodes(t *testing.T, cat *pack.Catalog, deck DeckChoice) []string {
	t.Helper()
	identity, _, err := cat.Card(deck.Hero)
	if err != nil {
		t.Fatal(err)
	}
	var codes []string
	for _, entry := range deck.Cards {
		card, _, err := cat.Card(entry.Code)
		if err != nil {
			t.Fatal(err)
		}
		if card.Code == identity.Code {
			continue
		}
		for range entry.Qty {
			codes = append(codes, card.Code)
		}
	}
	slices.Sort(codes)
	return codes
}

// startedGame returns a started game of two Spider-Man players.
func startedGame(t *testing.T, cfg LobbyConfig) *Game {
	t.Helper()
	cat := newCatalog(t)
	g := NewGame("g1", "h", "Host", testNow)
	if _, err := g.Join("b", "Bob"); err != nil {
		t.Fatal(err)
	}
	if err := g.Configure("h", cfg, cat); err != nil {
		t.Fatal(err)
	}
	for _, token := range []string{"h", "b"} {
		if err := g.SetDeck(token, spiderManDeck(t, cat), cat); err != nil {
			t.Fatal(err)
		}
	}
	if err := g.Start("h", cat, testSeed, testNow); err != nil {
		t.Fatal(err)
	}
	return g
}

func rhinoConfig() LobbyConfig {
	return LobbyConfig{
		Scenario:   "rhino",
		Difficulty: pack.Standard,
		Standard:   "standard",
		Modulars:   []string{"bomb_scare"},
	}
}

// codesOf returns the sorted codes of the cards with the given ids.
func codesOf(table *Table, ids []string) []string {
	codes := make([]string, 0, len(ids))
	for _, id := range ids {
		codes = append(codes, table.Cards[id].Code)
	}
	slices.Sort(codes)
	return codes
}

// setCodes returns the sorted codes of every copy of the sets' cards.
func setCodes(t *testing.T, cat *pack.Catalog, skip []string, setCodes ...string) []string {
	t.Helper()
	var codes []string
	for _, setCode := range setCodes {
		set, ok := cat.Set(setCode)
		if !ok {
			t.Fatalf("no set %q", setCode)
		}
		for _, code := range set.Cards {
			if slices.Contains(skip, code) {
				continue
			}
			card, _, err := cat.Card(code)
			if err != nil {
				t.Fatal(err)
			}
			for range card.Quantity {
				codes = append(codes, card.Code)
			}
		}
	}
	slices.Sort(codes)
	return codes
}

func cardWithCode(t *testing.T, table *Table, code string) *Card {
	t.Helper()
	var found *Card
	for _, c := range table.Cards {
		if c.Code != code {
			continue
		}
		if found != nil {
			t.Fatalf("several cards with code %s", code)
		}
		found = c
	}
	if found == nil {
		t.Fatalf("no card with code %s", code)
	}
	return found
}

func TestSetupStages(t *testing.T) {
	g := startedGame(t, rhinoConfig())
	table := g.Table

	if g.Phase != PhasePlaying {
		t.Errorf("phase = %q, want playing", g.Phase)
	}

	villain := cardWithCode(t, table, "01094")
	if villain.Zone != ZoneTable || villain.Area != AreaVillain || villain.X != 280 || villain.Y != 0 {
		t.Errorf("Rhino I = %+v, want on the table at villain (280, 0)", villain)
	}
	for _, code := range []string{"01095", "01096"} {
		if c := cardWithCode(t, table, code); c.Zone != ZoneStage {
			t.Errorf("%s zone = %q, want stage", code, c.Zone)
		}
	}

	scheme := cardWithCode(t, table, "01097")
	if scheme.Zone != ZoneTable || scheme.Face != 1 || scheme.X != 420 || scheme.Y != 20 {
		t.Errorf("main scheme = %+v, want on the table at (420, 20), face 1", scheme)
	}

	if len(table.Stages) != 2 {
		t.Fatalf("stages = %d, want 2", len(table.Stages))
	}
	if table.Stages[0].Key != "villain" || table.Stages[0].Current != villain.ID {
		t.Errorf("villain stage = %+v", table.Stages[0])
	}
	if got := codesOf(table, table.Stages[0].Cards); !slices.Equal(got, []string{"01094", "01095", "01096"}) {
		t.Errorf("villain stage cards = %v", got)
	}
	if villain.Owner != NoOwner || villain.Home != PileEncounter || villain.Faces != 1 || villain.Back != pack.BackVillain {
		t.Errorf("Rhino I owner/home/faces/back = %d %q %d %q", villain.Owner, villain.Home, villain.Faces, villain.Back)
	}
}

func TestSetupEncounterDeck(t *testing.T) {
	cat := newCatalog(t)
	g := startedGame(t, rhinoConfig())
	table := g.Table

	want := setCodes(t, cat, []string{"01094", "01095", "01096", "01097"}, "rhino", "bomb_scare", "standard")
	want = append(want, "01165", "01165")
	slices.Sort(want)

	enc := table.Piles[PileEncounter]
	if got := codesOf(table, enc.Cards); !slices.Equal(got, want) {
		t.Errorf("encounter deck = %v, want %v", got, want)
	}
	if !slices.Contains(codesOf(table, enc.Cards), "01107") {
		t.Error("Breakin' & Takin' (01107) is missing from the encounter deck")
	}
	for _, id := range enc.Cards {
		c := table.Cards[id]
		if c.Owner != NoOwner || c.Home != PileEncounter || c.Zone != ZonePile || c.Pile != PileEncounter {
			t.Fatalf("encounter card %+v is not a plain encounter-deck card", c)
		}
	}
}

func TestSetupEncounterDeckIsShuffledDeterministically(t *testing.T) {
	first := startedGame(t, rhinoConfig()).Table.Piles[PileEncounter].Cards
	second := startedGame(t, rhinoConfig()).Table.Piles[PileEncounter].Cards
	if !slices.Equal(first, second) {
		t.Error("the same seed gives two different encounter decks")
	}
	if slices.IsSorted(first) {
		t.Error("the encounter deck is not shuffled")
	}
}

func TestSetupExpertAddsExpertSet(t *testing.T) {
	cat := newCatalog(t)
	cfg := rhinoConfig()
	cfg.Difficulty = pack.Expert
	cfg.Expert = "expert"
	table := startedGame(t, cfg).Table

	// Expert Rhino starts with 01095 as the villain; 01094 waits in the stage zone.
	if c := cardWithCode(t, table, "01095"); c.Zone != ZoneTable {
		t.Errorf("01095 zone = %q, want table", c.Zone)
	}
	expert, _ := cat.Set("expert")
	encCodes := codesOf(table, table.Piles[PileEncounter].Cards)
	for _, code := range expert.Cards {
		if !slices.Contains(encCodes, code) {
			t.Errorf("expert card %s is missing from the encounter deck", code)
		}
	}
}

func TestSetupPlayers(t *testing.T) {
	cat := newCatalog(t)
	g := startedGame(t, rhinoConfig())
	table := g.Table
	deck := spiderManDeck(t, cat)

	for seat := range 2 {
		area := PlayerArea(seat)
		if hand := table.Hands[area]; hand == nil || len(hand) != 0 {
			t.Errorf("%s hand = %v, want empty and non-nil", area, hand)
		}

		deckPile := table.Piles["deck:"+string(area)]
		if got, want := codesOf(table, deckPile.Cards), expectedDeckCodes(t, cat, deck); !slices.Equal(got, want) {
			t.Errorf("%s deck = %v, want %v", area, got, want)
		}
		for _, id := range deckPile.Cards {
			c := table.Cards[id]
			if c.Owner != seat || c.Home != "deck:"+string(area) || c.Zone != ZonePile {
				t.Fatalf("deck card %+v has wrong owner, home or zone", c)
			}
		}
		if got, want := table.Piles["deck:"+string(area)].X, 0; got != want {
			t.Errorf("deck x = %d, want %d", got, want)
		}

		aside := table.Piles["aside:"+string(area)]
		if got, want := codesOf(table, aside.Cards), setCodes(t, cat, nil, "spider_man_nemesis"); !slices.Equal(got, want) {
			t.Errorf("%s aside = %v, want %v", area, got, want)
		}
		for _, id := range aside.Cards {
			if c := table.Cards[id]; c.Owner != NoOwner || c.Home != PileEncounter {
				t.Fatalf("nemesis card %+v should belong to the encounter deck", c)
			}
		}
		if aside.X != 1200 || aside.Y != 0 || aside.Area != area || aside.Owner != seat {
			t.Errorf("aside pile = %+v", aside)
		}
		if disc := table.Piles["disc:"+string(area)]; disc == nil || disc.X != 120 || len(disc.Cards) != 0 {
			t.Errorf("discard pile = %+v", disc)
		}
	}

	var identities []*Card
	for _, c := range table.Cards {
		if c.Code == "01001" {
			identities = append(identities, c)
		}
	}
	if len(identities) != 2 {
		t.Fatalf("identity cards = %d, want 2", len(identities))
	}
	for _, identity := range identities {
		if identity.Face != 1 || identity.Zone != ZoneTable || identity.X != 280 || identity.Y != 0 ||
			identity.Area != PlayerArea(identity.Owner) || identity.Home != "deck:"+string(identity.Area) {
			t.Errorf("identity = %+v, want alter ego on the table at (280, 0)", identity)
		}
	}

	if table.FirstPlayer != (Point{Area: "p0", X: 420, Y: 0}) {
		t.Errorf("first player = %+v", table.FirstPlayer)
	}
}

func TestSetupVillainPiles(t *testing.T) {
	table := startedGame(t, rhinoConfig()).Table

	want := map[string][2]int{
		PileEncounter:        {0, 0},
		PileEncounterDiscard: {120, 0},
		PileVictory:          {1080, 0},
		PileScenarioAside:    {1200, 0},
	}
	for id, pos := range want {
		pile := table.Piles[id]
		if pile == nil {
			t.Fatalf("pile %s missing", id)
		}
		if pile.Area != AreaVillain || pile.Owner != NoOwner || pile.X != pos[0] || pile.Y != pos[1] {
			t.Errorf("pile %s = %+v, want villain area at %v", id, pile, pos)
		}
	}
}

func TestSetupIDsAreUnique(t *testing.T) {
	table := startedGame(t, rhinoConfig()).Table

	for id, c := range table.Cards {
		if c.ID != id || !strings.HasPrefix(id, "c") {
			t.Fatalf("card key %q has id %q", id, c.ID)
		}
	}
	// Table cards get increasing Z, so NextZ is above every one of them.
	for _, c := range table.Cards {
		if c.Zone == ZoneTable && c.Z >= table.NextZ {
			t.Fatalf("card %s has Z %d, NextZ is %d", c.ID, c.Z, table.NextZ)
		}
	}
}

func TestSetupStartingThreatKlaw(t *testing.T) {
	cfg := rhinoConfig()
	cfg.Scenario = "klaw"
	cfg.Modulars = []string{"the_doomsday_chair"}
	table := startedGame(t, cfg).Table

	defense := cardWithCode(t, table, "01125")
	if defense.Zone != ZoneTable || defense.Area != AreaVillain || defense.X != 600 || defense.Y != 20 {
		t.Errorf("Defense Network = %+v, want in the villain area at (600, 20)", defense)
	}
	if defense.Tokens["thr"] != 2 {
		t.Errorf("Defense Network threat = %d, want 2", defense.Tokens["thr"])
	}
	for _, id := range table.Piles[PileEncounter].Cards {
		if table.Cards[id].Code == "01125" {
			t.Error("Defense Network is also in the encounter deck")
		}
	}
}

func TestStartingThreatScalesWithPlayers(t *testing.T) {
	cat := newCatalog(t)
	b := &tableBuilder{cat: cat, rng: newTestRNG(), table: newEmptyTable(3)}

	// 01108 prints a starting threat of 2 per player.
	c, def, err := b.newEncounterCard("01108")
	if err != nil {
		t.Fatal(err)
	}
	if err := b.placeFace(c, def, 0, 0, 0); err != nil {
		t.Fatal(err)
	}
	if c.Tokens["thr"] != 6 {
		t.Errorf("threat = %d, want 6", c.Tokens["thr"])
	}
}

func TestZeroStartingThreatIsNotStored(t *testing.T) {
	table := startedGame(t, rhinoConfig()).Table

	// Face 1 of Rhino's main scheme prints a starting threat of 0.
	if scheme := cardWithCode(t, table, "01097"); scheme.Tokens != nil {
		t.Errorf("main scheme tokens = %v, want none", scheme.Tokens)
	}
}

func TestStartRequiresDecks(t *testing.T) {
	cat := newCatalog(t)
	g := NewGame("g1", "h", "Host", testNow)
	if _, err := g.Join("b", "Bob"); err != nil {
		t.Fatal(err)
	}
	if err := g.Configure("h", rhinoConfig(), cat); err != nil {
		t.Fatal(err)
	}
	if err := g.SetDeck("h", spiderManDeck(t, cat), cat); err != nil {
		t.Fatal(err)
	}

	err := g.Start("h", cat, testSeed, testNow)
	if !errors.Is(err, ErrInvalid) {
		t.Errorf("Start without a deck = %v, want ErrInvalid", err)
	}
	if g.Phase != PhaseLobby || g.Table != nil {
		t.Error("a failed Start must leave the game in the lobby")
	}
}

func TestStartGuards(t *testing.T) {
	cat := newCatalog(t)

	t.Run("not configured", func(t *testing.T) {
		g := NewGame("g1", "h", "Host", testNow)
		if err := g.SetDeck("h", spiderManDeck(t, cat), cat); err != nil {
			t.Fatal(err)
		}
		if err := g.Start("h", cat, testSeed, testNow); !errors.Is(err, ErrInvalid) {
			t.Errorf("Start = %v, want ErrInvalid", err)
		}
	})
	t.Run("not the host", func(t *testing.T) {
		g := startedGame(t, rhinoConfig())
		if err := g.Start("b", cat, testSeed, testNow); !errors.Is(err, ErrForbidden) {
			t.Errorf("Start = %v, want ErrForbidden", err)
		}
	})
	t.Run("already started", func(t *testing.T) {
		g := startedGame(t, rhinoConfig())
		if err := g.Start("h", cat, testSeed, testNow); !errors.Is(err, ErrPhase) {
			t.Errorf("Start = %v, want ErrPhase", err)
		}
	})
}

func TestStartLogsTheGame(t *testing.T) {
	g := startedGame(t, rhinoConfig())

	if len(g.Log) != 1 {
		t.Fatalf("log = %v, want one line", g.Log)
	}
	entry := g.Log[0]
	if want := "started the game (Rhino, Bomb Scare)"; entry.Text != want {
		t.Errorf("text = %q, want %q", entry.Text, want)
	}
	if entry.Who != "Host" || entry.Color != 0 || !entry.At.Equal(testNow) {
		t.Errorf("entry = %+v", entry)
	}
}
