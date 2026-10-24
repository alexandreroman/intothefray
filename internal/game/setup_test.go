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

const (
	spiderManIdentity = "01001a"
	// milesMoralesIdentity is the other Spider-Man: the same hero name with
	// another alter ego, so another hero.
	milesMoralesIdentity = "27030a"
)

// seatDeck stores the deck in the player's slot as SetDeck does, without the
// lobby checks. Table fixtures give several seats the same Spider-Man deck,
// which SetDeck refuses since a hero sits at the table only once.
func seatDeck(t *testing.T, g *Game, token string, slot int, deck DeckChoice, cat *pack.Catalog) {
	t.Helper()
	player := g.player(token)
	if player == nil || !player.hasSlot(slot) {
		t.Fatalf("%s has no deck slot %d", token, slot)
	}
	deck.Cards = slices.Clone(deck.Cards)
	deck.HeroImage = heroImage(cat, deck.Hero)
	player.Decks[slot] = &deck
}

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
	g := mustNewGame(t, "g1", "h", "Host", testNow)
	if _, err := g.Join("b", "Bob"); err != nil {
		t.Fatal(err)
	}
	if err := g.Configure("h", cfg, cat); err != nil {
		t.Fatal(err)
	}
	for _, token := range []string{"h", "b"} {
		seatDeck(t, g, token, 0, spiderManDeck(t, cat), cat)
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
	if villain.Zone != ZoneTable || villain.X != 360 || villain.Y != 30 {
		t.Errorf("Rhino I = %+v, want on the table at (360, 30)", villain)
	}
	for _, code := range []string{"01095", "01096"} {
		if c := cardWithCode(t, table, code); c.Zone != ZoneStage {
			t.Errorf("%s zone = %q, want stage", code, c.Zone)
		}
	}

	scheme := cardWithCode(t, table, "01097")
	if scheme.Zone != ZoneTable || scheme.Face != 0 || scheme.X != 520 || scheme.Y != 30 {
		t.Errorf("main scheme = %+v, want on the table at (520, 30), face 0", scheme)
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

// inPlayCard is a card expected in play on the villain side at setup.
type inPlayCard struct {
	code string
	face int
	x    int
}

func TestSetupStandardAndExpertSets(t *testing.T) {
	const (
		formidableFoe    = "24049"
		pursuedByThePast = "45075"
		drawingNear      = "45080"
	)
	tests := []struct {
		name       string
		difficulty pack.Difficulty
		standard   string
		expert     string
		inPlay     []inPlayCard
	}{
		{"standard", pack.Standard, "standard", "", nil},
		{"standard ii", pack.Standard, "standard_ii", "", []inPlayCard{{formidableFoe, 0, 760}}},
		{"standard iii", pack.Standard, "standard_iii", "", []inPlayCard{{pursuedByThePast, 0, 760}}},
		{"expert with standard", pack.Expert, "standard", "expert", nil},
		{"expert ii with standard", pack.Expert, "standard", "expert_ii", nil},
		{"expert ii with standard ii", pack.Expert, "standard_ii", "expert_ii", []inPlayCard{{formidableFoe, 1, 760}}},
		{"expert with standard ii", pack.Expert, "standard_ii", "expert", []inPlayCard{{formidableFoe, 1, 760}}},
		{"expert with standard iii", pack.Expert, "standard_iii", "expert", []inPlayCard{{pursuedByThePast, 0, 760}}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cat := newCatalog(t)
			cfg := rhinoConfig()
			cfg.Difficulty, cfg.Standard, cfg.Expert = tt.difficulty, tt.standard, tt.expert
			table := startedGame(t, cfg).Table

			skip := []string{"01094", "01095", "01096", "01097"}
			for _, want := range tt.inPlay {
				c := cardWithCode(t, table, want.code)
				if c.Zone != ZoneTable || c.Face != want.face || c.X != want.x || c.Y != 30 {
					t.Errorf("%s = %+v, want in the villain row at (%d, 30), face %d", want.code, c, want.x, want.face)
				}
				if c.Owner != NoOwner || c.Home != PileEncounter {
					t.Errorf("%s owner/home = %d %q, want the encounter deck's", want.code, c.Owner, c.Home)
				}
				skip = append(skip, want.code)
			}

			sets := []string{"rhino", "bomb_scare", tt.standard}
			if tt.expert != "" {
				sets = append(sets, tt.expert)
			}
			want := setCodes(t, cat, skip, sets...)
			want = append(want, "01165", "01165")
			slices.Sort(want)
			got := codesOf(table, table.Piles[PileEncounter].Cards)
			if !slices.Equal(got, want) {
				t.Errorf("encounter deck = %v, want %v", got, want)
			}
			if tt.standard == "standard_iii" && !slices.Contains(got, drawingNear) {
				t.Errorf("Drawing Near (%s) is missing from the encounter deck", drawingNear)
			}
		})
	}
}

func TestStartWithoutStandard(t *testing.T) {
	cat := newCatalog(t)
	cfg := rhinoConfig()
	cfg.Standard = ""
	table := startedGame(t, cfg).Table

	want := setCodes(t, cat, []string{"01094", "01095", "01096", "01097"}, "rhino", "bomb_scare")
	want = append(want, "01165", "01165")
	slices.Sort(want)
	if got := codesOf(table, table.Piles[PileEncounter].Cards); !slices.Equal(got, want) {
		t.Errorf("encounter deck = %v, want %v", got, want)
	}

	for _, c := range table.Cards {
		card, _, err := cat.Card(c.Code)
		if err != nil {
			t.Fatal(err)
		}
		if set, ok := cat.Set(card.Set); ok && set.Kind == "standard" {
			t.Errorf("standard card %s is on the table (zone %q)", c.Code, c.Zone)
		}
	}
}

func TestStartExpertWithoutExpertSet(t *testing.T) {
	cat := newCatalog(t)
	cfg := rhinoConfig()
	cfg.Difficulty = pack.Expert
	cfg.Expert = ""
	table := startedGame(t, cfg).Table

	for _, c := range table.Cards {
		card, _, err := cat.Card(c.Code)
		if err != nil {
			t.Fatal(err)
		}
		if set, ok := cat.Set(card.Set); ok && set.Kind == "expert" {
			t.Errorf("expert card %s is on the table (zone %q)", c.Code, c.Zone)
		}
	}
}

func TestSetupSetInPlayFollowsScenarioInPlay(t *testing.T) {
	cfg := rhinoConfig()
	cfg.Scenario = "ultron"
	cfg.Modulars = []string{"under_attack"}
	cfg.Difficulty, cfg.Standard, cfg.Expert = pack.Expert, "standard_ii", "expert"
	table := startedGame(t, cfg).Table

	// Ultron Drones take the first in-play slot, Formidable Foe the next.
	if c := cardWithCode(t, table, "01140"); c.Zone != ZoneTable || c.X != 760 || c.Y != 30 {
		t.Errorf("Ultron Drones = %+v, want on the table at (760, 30)", c)
	}
	foe := cardWithCode(t, table, "24049")
	if foe.Zone != ZoneTable || foe.Face != 1 || foe.X != 980 || foe.Y != 30 {
		t.Errorf("Formidable Foe = %+v, want in the villain row at (980, 30), face 1", foe)
	}
}

func TestSetupWithSetInPlayIsDeterministic(t *testing.T) {
	cfg := rhinoConfig()
	cfg.Standard = "standard_iii"
	first := startedGame(t, cfg).Table
	second := startedGame(t, cfg).Table

	if !slices.Equal(first.Piles[PileEncounter].Cards, second.Piles[PileEncounter].Cards) {
		t.Error("the same seed gives two different encounter decks")
	}
	if a, b := cardWithCode(t, first, "45075").ID, cardWithCode(t, second, "45075").ID; a != b {
		t.Errorf("Pursued by the Past ids = %s and %s, want the same", a, b)
	}
}

func TestSetupPlayers(t *testing.T) {
	cat := newCatalog(t)
	g := startedGame(t, rhinoConfig())
	table := g.Table
	deck := spiderManDeck(t, cat)

	for seat := range 2 {
		area := PlayerArea(seat)
		rowY := 500 + 330*seat
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
		if got := table.Piles["deck:"+string(area)]; got.X != 0 || got.Y != rowY {
			t.Errorf("deck at (%d, %d), want (0, %d)", got.X, got.Y, rowY)
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
		if aside.X != 0 || aside.Y != rowY || aside.Owner != seat {
			t.Errorf("aside pile = %+v", aside)
		}
		disc := table.Piles["disc:"+string(area)]
		if disc == nil || disc.X != 160 || disc.Y != rowY || len(disc.Cards) != 0 {
			t.Errorf("discard pile = %+v", disc)
		}
	}

	// The two Spider-Man cards, and only them, are marked as identities.
	var identities []*Card
	for _, c := range table.Cards {
		if c.Identity {
			identities = append(identities, c)
		}
	}
	if len(identities) != 2 {
		t.Fatalf("identity cards = %d, want 2", len(identities))
	}
	for _, identity := range identities {
		rowY := 500 + 330*identity.Owner
		if identity.Code != "01001" || identity.Face != 1 || identity.Zone != ZoneTable ||
			identity.X != 360 || identity.Y != rowY ||
			identity.Home != "deck:"+string(PlayerArea(identity.Owner)) {
			t.Errorf("identity = %+v, want alter ego on the table at (360, %d)", identity, rowY)
		}
	}

	// The first player token lies in the row of the first player, seat 0.
	if table.FirstPlayer != (Point{X: 520, Y: 500}) {
		t.Errorf("first player = %+v", table.FirstPlayer)
	}
}

func TestSetupVillainPiles(t *testing.T) {
	table := startedGame(t, rhinoConfig()).Table

	want := map[string][2]int{
		PileEncounter:        {0, 30},
		PileEncounterDiscard: {160, 30},
		PileVictory:          {0, 30},
		PileScenarioAside:    {0, 30},
	}
	for id, pos := range want {
		pile := table.Piles[id]
		if pile == nil {
			t.Fatalf("pile %s missing", id)
		}
		if pile.Owner != NoOwner || pile.X != pos[0] || pile.Y != pos[1] {
			t.Errorf("pile %s = %+v, want in the villain row at %v", id, pile, pos)
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

// TestSetupKlawSideSchemeStaysInEncounterDeck checks that a side scheme the
// main scheme's Setup text names is left to the players: only environments
// start in play.
func TestSetupKlawSideSchemeStaysInEncounterDeck(t *testing.T) {
	cfg := rhinoConfig()
	cfg.Scenario = "klaw"
	cfg.Modulars = []string{"the_doomsday_chair"}
	table := startedGame(t, cfg).Table

	defense := cardWithCode(t, table, "01125")
	if defense.Zone != ZonePile || defense.Pile != PileEncounter {
		t.Errorf("Defense Network = %+v, want in the encounter deck", defense)
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
	cat := newCatalog(t)
	b := &tableBuilder{cat: cat, rng: newTestRNG(), table: newEmptyTable(2)}

	// 01097 face 1 (Rhino's main scheme, stage 1B) prints a starting threat
	// of 0.
	c, def, err := b.newEncounterCard("01097")
	if err != nil {
		t.Fatal(err)
	}
	if err := b.placeFace(c, def, 1, 0, 0); err != nil {
		t.Fatal(err)
	}
	if c.Tokens != nil {
		t.Errorf("tokens = %v, want none", c.Tokens)
	}
}

func TestStartRequiresDecks(t *testing.T) {
	cat := newCatalog(t)
	g := mustNewGame(t, "g1", "h", "Host", testNow)
	if _, err := g.Join("b", "Bob"); err != nil {
		t.Fatal(err)
	}
	if err := g.Configure("h", rhinoConfig(), cat); err != nil {
		t.Fatal(err)
	}
	if err := g.SetDeck("h", 0, spiderManDeck(t, cat), cat); err != nil {
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

// twoDeckGame returns a started game where Alex ("a", host) plays two
// Spider-Man decks, seats 0 and 1, and Sam ("s") one, seat 2.
func twoDeckGame(t *testing.T) *Game {
	t.Helper()
	cat := newCatalog(t)
	g := twoSlotLobby(t)
	if err := g.Configure("a", rhinoConfig(), cat); err != nil {
		t.Fatal(err)
	}
	for _, slot := range []struct {
		token string
		deck  int
	}{{"a", 0}, {"a", 1}, {"s", 0}} {
		seatDeck(t, g, slot.token, slot.deck, spiderManDeck(t, cat), cat)
	}
	if err := g.Start("a", cat, testSeed, testNow); err != nil {
		t.Fatal(err)
	}
	return g
}

func TestStartNeedsEverySlot(t *testing.T) {
	cat := newCatalog(t)
	g := twoSlotLobby(t)
	if err := g.Configure("a", rhinoConfig(), cat); err != nil {
		t.Fatal(err)
	}
	if err := g.SetDeck("a", 0, spiderManDeck(t, cat), cat); err != nil {
		t.Fatal(err)
	}
	if err := g.SetDeck("s", 0, DeckChoice{Name: "Miles", Hero: milesMoralesIdentity}, cat); err != nil {
		t.Fatal(err)
	}

	err := g.Start("a", cat, testSeed, testNow)
	if !errors.Is(err, ErrInvalid) || !strings.Contains(err.Error(), "Alex") {
		t.Errorf("Start with an empty slot = %v, want ErrInvalid naming Alex", err)
	}
	if g.Phase != PhaseLobby || g.Table != nil {
		t.Error("a failed Start must leave the game in the lobby")
	}
}

func TestStartRowsPerSeat(t *testing.T) {
	g := twoDeckGame(t)
	table := g.Table

	for seat := range 3 {
		area := PlayerArea(seat)
		if hand, ok := table.Hands[area]; !ok || len(hand) != 0 {
			t.Errorf("%s hand = %v (exists %v), want empty", area, hand, ok)
		}
		for _, prefix := range []string{"deck:", "disc:", "aside:"} {
			pile := table.Piles[prefix+string(area)]
			if pile == nil || pile.Owner != seat || pile.Y != rowY(playerRow(seat)) {
				t.Errorf("pile %s%s = %+v, want owner %d in row %d", prefix, area, pile, seat, playerRow(seat))
			}
		}
	}
	if _, ok := table.Hands["p3"]; ok {
		t.Error("the table has a fourth seat")
	}

	identities := map[int]*Card{}
	for _, c := range table.Cards {
		if c.Code == "01001" {
			identities[c.Owner] = c
		}
	}
	for seat := range 3 {
		identity := identities[seat]
		if identity == nil || identity.Zone != ZoneTable || identity.Y != rowY(playerRow(seat)) {
			t.Errorf("identity of seat %d = %+v, want on row %d", seat, identity, playerRow(seat))
		}
	}
	if table.FirstPlayer != (Point{X: firstPlayerX, Y: rowY(playerRow(0))}) {
		t.Errorf("first player = %+v, want in the row of seat 0", table.FirstPlayer)
	}

	// Starting threat per player counts the seats, one per hero.
	b := &tableBuilder{cat: newCatalog(t), rng: newTestRNG(), table: table}
	c, def, err := b.newEncounterCard("01108") // 2 per player
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

func TestStartGuards(t *testing.T) {
	cat := newCatalog(t)

	t.Run("not configured", func(t *testing.T) {
		g := mustNewGame(t, "g1", "h", "Host", testNow)
		if err := g.SetDeck("h", 0, spiderManDeck(t, cat), cat); err != nil {
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

// gameOfPlayers returns a started game of n Spider-Man players, one deck each.
func gameOfPlayers(t *testing.T, n int) *Game {
	t.Helper()
	cat := newCatalog(t)
	g := mustNewGame(t, "g1", "p0", "Player 0", testNow)
	for i := 1; i < n; i++ {
		if _, err := g.Join(fmt.Sprintf("p%d", i), fmt.Sprintf("Player %d", i)); err != nil {
			t.Fatal(err)
		}
	}
	if err := g.Configure("p0", rhinoConfig(), cat); err != nil {
		t.Fatal(err)
	}
	for i := range n {
		seatDeck(t, g, fmt.Sprintf("p%d", i), 0, spiderManDeck(t, cat), cat)
	}
	if err := g.Start("p0", cat, testSeed, testNow); err != nil {
		t.Fatal(err)
	}
	return g
}

// faceHeight returns the height a face up card takes on the table, in table units.
func faceHeight(t *testing.T, cat *pack.Catalog, c *Card) int {
	t.Helper()
	def, _, err := cat.Card(c.Code)
	if err != nil {
		t.Fatal(err)
	}
	switch size := def.Faces[c.Face].Size; size {
	case pack.SizeStd, pack.SizeDoubleLand:
		return 196
	case pack.SizeLand:
		return 140
	case pack.SizeDoubleStd:
		return 280
	default:
		t.Fatalf("card %s has an unknown size %q", c.Code, size)
		return 0
	}
}

func TestSetupLeavesRoomUnderTheVillainRow(t *testing.T) {
	const pileHeight = 196
	// About 1.2 portrait card heights (196 each), the first player's row on the 10-unit grid.
	const wantGap = 244

	cat := newCatalog(t)
	for _, players := range []int{1, 2} {
		t.Run(fmt.Sprintf("%d players", players), func(t *testing.T) {
			table := gameOfPlayers(t, players).Table

			villainBottom := 0
			for _, pile := range table.Piles {
				if pile.Owner == NoOwner {
					villainBottom = max(villainBottom, pile.Y+pileHeight)
				}
			}
			for _, c := range table.Cards {
				if c.Zone == ZoneTable && c.Owner == NoOwner {
					villainBottom = max(villainBottom, c.Y+faceHeight(t, cat, c))
				}
			}

			// The owner label of the first player's row lies in the room above its piles.
			deck := table.Piles["deck:"+string(PlayerArea(0))]
			firstRowTop := deck.Y - rowContentY
			if gap := firstRowTop - villainBottom; gap != wantGap {
				t.Errorf("room under the villain row = %d, want %d", gap, wantGap)
			}
			if deck.Y%10 != 0 || table.FirstPlayer.Y%10 != 0 {
				t.Errorf("first player row at y %d (token %d), want on the 10-unit grid", deck.Y, table.FirstPlayer.Y)
			}
			if table.FirstPlayer.Y != deck.Y {
				t.Errorf("first player token at y %d, want in the first player row at %d", table.FirstPlayer.Y, deck.Y)
			}

			for seat := 1; seat < players; seat++ {
				previous := table.Piles["deck:"+string(PlayerArea(seat-1))]
				current := table.Piles["deck:"+string(PlayerArea(seat))]
				if pitch := current.Y - previous.Y; pitch != rowHeight {
					t.Errorf("seat %d row %d below seat %d, want %d", seat, pitch, seat-1, rowHeight)
				}
			}
		})
	}
}
