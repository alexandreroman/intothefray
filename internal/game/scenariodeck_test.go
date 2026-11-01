package game

import (
	"errors"
	"slices"
	"testing"
)

// scenarioFixture is a started game whose table gains the encounter deck
// "enc:w" (Wrecker, with its own discard pile "encd:w") and the scenario deck
// "sdeck:x" (Experimental Weapons, with no discard pile of its own: its cards
// are discarded to the encounter discard pile). Cards w1..w3 and x1..x2 lie in
// their decks, the last one on top. The game starts from that table, so that
// Undo rebuilds it.
func scenarioFixture(t *testing.T) *doFixture {
	t.Helper()
	f := newDoFixture(t)
	tb := f.g.Table
	code := tb.Cards[tb.Piles[PileEncounter].Cards[0]].Code
	tb.Piles["enc:w"] = &Pile{
		ID: "enc:w", Kind: KindEncounter, Owner: NoOwner,
		Label: "Wrecker", Compact: true, X: 0, Y: 30, Discard: "encd:w",
	}
	tb.Piles["encd:w"] = &Pile{
		ID: "encd:w", Kind: KindEncounterDiscard, Owner: NoOwner,
		Label: "Wrecker", Compact: true, X: 100, Y: 30,
	}
	tb.Piles["sdeck:x"] = &Pile{
		ID: "sdeck:x", Kind: KindScenarioDeck, Owner: NoOwner,
		Label: "Experimental Weapons", Compact: true, X: 300, Y: 30, Discard: PileEncounterDiscard,
	}
	add := func(deck string, ids ...string) {
		for _, id := range ids {
			tb.Cards[id] = &Card{ID: id, Code: code, Owner: NoOwner, Home: deck, Zone: ZonePile, Pile: deck}
			tb.Piles[deck].Cards = append(tb.Piles[deck].Cards, id)
		}
	}
	add("enc:w", "w1", "w2", "w3")
	add("sdeck:x", "x1", "x2")
	f.g.History = newHistory(testSeed, tb, testNow)
	return f
}

func TestDealFromScenarioDeck(t *testing.T) {
	f := scenarioFixture(t)
	f.mustDo(t, "h", Action{Kind: ActDeal, Pile: "enc:w", Area: "p1", X: 500, Y: 300}, at(1))
	c := f.g.Table.Cards["w3"]
	if c.Zone != ZoneTable || !c.FaceDown {
		t.Errorf("w3 = zone %s face down %t, want on the table face down", c.Zone, c.FaceDown)
	}
	if got := f.g.Table.Piles["enc:w"].Cards; !slices.Equal(got, []string{"w1", "w2"}) {
		t.Errorf("enc:w = %v", got)
	}
	err := f.do("h", Action{Kind: ActDeal, Pile: "sdeck:x", Area: "p1", X: 500, Y: 300}, at(2))
	if !errors.Is(err, ErrInvalid) {
		t.Errorf("deal from a plain scenario deck: err = %v, want ErrInvalid", err)
	}
}

func TestDiscardGoesToHomeDiscard(t *testing.T) {
	f := scenarioFixture(t)
	f.mustDo(t, "h", Action{Kind: ActDeal, Pile: "enc:w", Area: "p1", X: 500, Y: 300}, at(1))
	f.mustDo(t, "h", Action{Kind: ActDiscard, Card: "w3"}, at(2))
	if got := f.g.Table.Piles["encd:w"].Cards; !slices.Equal(got, []string{"w3"}) {
		t.Errorf("encd:w = %v, want [w3]", got)
	}
	if len(f.g.Table.Piles[PileEncounterDiscard].Cards) != 0 {
		t.Error("the classic encounter discard pile received the card")
	}
}

func TestNoDiscardScenarioDeck(t *testing.T) {
	f := scenarioFixture(t)
	tb := f.g.Table
	// A deck whose cards are never discarded ("none").
	tb.Piles["sdeck:x"].Discard = ""
	// Draw x2 out onto the table, then tuck x1 under it: leaving the table sends x1 to the bottom of its deck.
	tb.Piles["sdeck:x"].Cards = []string{"x1"}
	tb.Cards["x2"].Zone, tb.Cards["x2"].Pile = ZoneTable, ""
	tb.Cards["x2"].X, tb.Cards["x2"].Y, tb.Cards["x2"].Z = 600, 300, 50
	tb.Cards["x1"].Zone, tb.Cards["x1"].Pile = ZoneTable, ""
	tb.Cards["x1"].Parent, tb.Cards["x1"].X, tb.Cards["x1"].Y, tb.Cards["x1"].Z = "x2", 600, 320, 49
	tb.Piles["sdeck:x"].Cards = nil
	tb.Cards["w1"].Zone, tb.Cards["w1"].Pile = ZoneTable, ""
	tb.Cards["w1"].X, tb.Cards["w1"].Y, tb.Cards["w1"].Z = 700, 300, 51
	tb.Piles["enc:w"].Cards = []string{"w2", "w3"}

	err := f.do("h", Action{Kind: ActDiscard, Card: "x2"}, at(1))
	if !errors.Is(err, ErrInvalid) {
		t.Errorf("discard of a card with no discard pile: err = %v, want ErrInvalid", err)
	}
	if pile, bottom, ok := tb.tuckedDestination(tb.Cards["x1"]); !ok || !bottom || pile.ID != "sdeck:x" {
		t.Errorf("tucked destination = %v %t %t, want the bottom of sdeck:x", pile, bottom, ok)
	}
}

// TestWeaponDiscardGoesToEncounterDiscard discards a card of a deck with no
// discard pile of its own, played to the table: it goes to the encounter
// discard pile, its owner's, and Undo brings it back.
func TestWeaponDiscardGoesToEncounterDiscard(t *testing.T) {
	f := scenarioFixture(t)
	tb := f.g.Table
	f.mustDo(t, "h", Action{Kind: ActPlay, Pile: "sdeck:x", X: 500, Y: 300}, at(1))

	f.mustDo(t, "h", Action{Kind: ActDiscard, Card: "x2"}, at(2))
	if got := topCards(tb.Piles[PileEncounterDiscard], 1); !slices.Equal(got, []string{"x2"}) {
		t.Errorf("encounter discard top = %v, want [x2]", got)
	}
	if c := tb.Cards["x2"]; c.Zone != ZonePile || c.Pile != PileEncounterDiscard || c.Home != "sdeck:x" {
		t.Errorf("x2 = %+v, want on the encounter discard pile, at home in sdeck:x", c)
	}
	if got, want := f.lastLog().Text, "discarded "+f.nameOf(t, "x2"); got != want {
		t.Errorf("line = %q, want %q", got, want)
	}
	checkIntegrity(t, tb)

	f.mustDo(t, "h", Action{Kind: ActUndo}, at(3))
	tb = f.g.Table
	if c := tb.Cards["x2"]; c.Zone != ZoneTable || c.X != 500 || c.Y != 300 {
		t.Errorf("x2 after undo = %+v, want back on the table at (500,300)", c)
	}
	if slices.Contains(tb.Piles[PileEncounterDiscard].Cards, "x2") {
		t.Error("x2 is still on the encounter discard pile after undo")
	}
	checkIntegrity(t, tb)
}

// TestTuckedWeaponGoesToEncounterDiscard discards a table card a weapon is
// tucked under: the weapon follows to the encounter discard pile, not to the
// bottom of its deck.
func TestTuckedWeaponGoesToEncounterDiscard(t *testing.T) {
	f := scenarioFixture(t)
	tb := f.g.Table
	f.mustDo(t, "h", Action{Kind: ActDeal, Pile: "enc:w", Area: "p1", X: 500, Y: 300}, at(1))
	f.mustDo(t, "h", Action{Kind: ActPlay, Pile: "sdeck:x", Target: "w3", X: 500, Y: 320}, at(2))

	if pile, bottom, ok := tb.tuckedDestination(tb.Cards["x2"]); !ok || bottom || pile.ID != PileEncounterDiscard {
		t.Errorf("tucked destination = %v %t %t, want the top of the encounter discard pile", pile, bottom, ok)
	}
	f.mustDo(t, "h", Action{Kind: ActDiscard, Card: "w3"}, at(3))
	if got := tb.Piles[PileEncounterDiscard].Cards; !slices.Equal(got, []string{"x2"}) {
		t.Errorf("encounter discard = %v, want [x2]", got)
	}
	if got := tb.Piles["encd:w"].Cards; !slices.Equal(got, []string{"w3"}) {
		t.Errorf("encd:w = %v, want [w3]", got)
	}
	if got := tb.Piles["sdeck:x"].Cards; !slices.Equal(got, []string{"x1"}) {
		t.Errorf("sdeck:x = %v, want [x1]: nothing under the deck", got)
	}
	checkIntegrity(t, tb)
}

// TestRevealedWeaponDiscardGoesToEncounterDiscard discards the card revealed
// on a deck with no discard pile of its own.
func TestRevealedWeaponDiscardGoesToEncounterDiscard(t *testing.T) {
	f := scenarioFixture(t)
	tb := f.g.Table
	f.mustDo(t, "h", Action{Kind: ActReveal, Pile: "sdeck:x"}, at(1))

	f.mustDo(t, "h", Action{Kind: ActDiscard, Card: "x2"}, at(2))
	if got := tb.Piles[PileEncounterDiscard].Cards; !slices.Equal(got, []string{"x2"}) {
		t.Errorf("encounter discard = %v, want [x2]", got)
	}
	if c := tb.Cards["x2"]; c.OnPile != "" || c.Pile != PileEncounterDiscard {
		t.Errorf("x2 = %+v, want on the encounter discard pile", c)
	}
	checkIntegrity(t, tb)
}

// TestDiscardTopOfWeaponsDeck discards the top cards of a deck with no
// discard pile of its own onto the encounter discard pile.
func TestDiscardTopOfWeaponsDeck(t *testing.T) {
	f := scenarioFixture(t)
	tb := f.g.Table

	f.mustDo(t, "b", Action{Kind: ActDiscardTop, Pile: "sdeck:x", N: 1}, at(1))
	if got := tb.Piles[PileEncounterDiscard].Cards; !slices.Equal(got, []string{"x2"}) {
		t.Errorf("encounter discard = %v, want [x2]", got)
	}
	if got := tb.Piles["sdeck:x"].Cards; !slices.Equal(got, []string{"x1"}) {
		t.Errorf("sdeck:x = %v, want [x1]", got)
	}
	if got, want := f.lastLog().Text, "discarded the top card of the Experimental Weapons deck"; got != want {
		t.Errorf("line = %q, want %q", got, want)
	}
	checkIntegrity(t, tb)

	f.mustDo(t, "b", Action{Kind: ActUndo}, at(2))
	tb = f.g.Table
	if got := tb.Piles["sdeck:x"].Cards; !slices.Equal(got, []string{"x1", "x2"}) {
		t.Errorf("sdeck:x after undo = %v, want [x1 x2]", got)
	}
	if n := len(tb.Piles[PileEncounterDiscard].Cards); n != 0 {
		t.Errorf("encounter discard holds %d cards after undo, want 0", n)
	}
}

// TestShuffleBackTakesTheDiscardedWeapon shuffles the encounter discard pile
// back into the encounter deck: the weapon discarded there goes with it,
// under a new id, still at home in its own deck.
func TestShuffleBackTakesTheDiscardedWeapon(t *testing.T) {
	f := scenarioFixture(t)
	tb := f.g.Table
	before := len(tb.Piles[PileEncounter].Cards)
	f.mustDo(t, "h", Action{Kind: ActDiscardTop, Pile: "sdeck:x", N: 1}, at(1))

	f.mustDo(t, "h", Action{Kind: ActShuffleBack, Pile: PileEncounterDiscard}, at(2))
	if n := len(tb.Piles[PileEncounterDiscard].Cards); n != 0 {
		t.Errorf("encounter discard holds %d cards, want 0", n)
	}
	enc := tb.Piles[PileEncounter].Cards
	if len(enc) != before+1 {
		t.Fatalf("encounter deck holds %d cards, want %d", len(enc), before+1)
	}
	if _, ok := tb.Cards["x2"]; ok || slices.Contains(enc, "x2") {
		t.Error("x2 kept its id in the encounter deck")
	}
	weapons := 0
	for _, id := range enc {
		if tb.Cards[id].Home == "sdeck:x" {
			weapons++
		}
	}
	if weapons != 1 {
		t.Errorf("encounter deck holds %d weapons, want 1", weapons)
	}
	checkIntegrity(t, tb)
}

func TestShuffleBackScenarioDeck(t *testing.T) {
	f := scenarioFixture(t)
	f.mustDo(t, "h", Action{Kind: ActDiscardTop, Pile: "enc:w", N: 2}, at(1))
	if got := len(f.g.Table.Piles["encd:w"].Cards); got != 2 {
		t.Fatalf("encd:w holds %d cards, want 2", got)
	}
	f.mustDo(t, "h", Action{Kind: ActShuffleBack, Pile: "encd:w"}, at(2))
	if len(f.g.Table.Piles["encd:w"].Cards) != 0 || len(f.g.Table.Piles["enc:w"].Cards) != 3 {
		t.Errorf("enc:w = %d, encd:w = %d cards, want 3 and 0",
			len(f.g.Table.Piles["enc:w"].Cards), len(f.g.Table.Piles["encd:w"].Cards))
	}
	f.mustDo(t, "h", Action{Kind: ActShuffle, Pile: "sdeck:x"}, at(3))
	if got := len(f.g.Table.Piles["sdeck:x"].Cards); got != 2 {
		t.Errorf("sdeck:x holds %d cards after a shuffle, want 2", got)
	}
	if d, ok := deckOfDiscard("sdisc:x"); !ok || d != "sdeck:x" {
		t.Errorf("deckOfDiscard(sdisc:x) = %q %t", d, ok)
	}
	if d := discardOf(f.g.Table.Piles["sdeck:x"]); d != PileEncounterDiscard {
		t.Errorf("discardOf(sdeck:x) = %q, want %s", d, PileEncounterDiscard)
	}
}

func TestRevealScenarioDeck(t *testing.T) {
	f := scenarioFixture(t)
	f.mustDo(t, "h", Action{Kind: ActReveal, Pile: "sdeck:x"}, at(1))
	if c := f.g.Table.Cards["x2"]; c.Zone != ZoneTable || c.OnPile != "sdeck:x" {
		t.Errorf("x2 = zone %s on pile %q, want revealed on sdeck:x", c.Zone, c.OnPile)
	}
	f.mustDo(t, "h", Action{Kind: ActReveal, Pile: "enc:w"}, at(2))
	// A revealed card counts as the deck's top card: it is the one dealt.
	f.mustDo(t, "h", Action{Kind: ActDeal, Pile: "enc:w", Area: "p1", X: 500, Y: 300}, at(3))
	c := f.g.Table.Cards["w3"]
	if c.Zone != ZoneTable || !c.FaceDown || c.OnPile != "" {
		t.Errorf("w3 = zone %s face down %t on pile %q, want dealt face down", c.Zone, c.FaceDown, c.OnPile)
	}
}

// TestPlayFromScenarioDeck plays the top of a scenario deck that is not an
// encounter deck: any player may, and the card lands face up, at a point or
// tucked under a table card.
func TestPlayFromScenarioDeck(t *testing.T) {
	f := scenarioFixture(t)
	tb := f.g.Table

	f.mustDo(t, "b", Action{Kind: ActPlay, Pile: "sdeck:x", X: 500, Y: 300}, at(1))
	if c := tb.Cards["x2"]; c.Zone != ZoneTable || c.FaceDown || c.X != 500 || c.Y != 300 {
		t.Errorf("x2 = %+v, want it played face up at (500,300)", c)
	}
	if got, want := f.lastLog().Text, "played "+f.nameOf(t, "x2"); got != want {
		t.Errorf("line = %q, want %q", got, want)
	}

	villain := f.villain()
	f.mustDo(t, "h", Action{Kind: ActPlay, Pile: "sdeck:x", Target: villain, X: 40, Y: 60}, at(2))
	if c := tb.Cards["x1"]; c.Zone != ZoneTable || c.FaceDown || c.Parent != villain {
		t.Errorf("x1 = %+v, want it face up under the villain", c)
	}
	want := "played " + f.nameOf(t, "x1") + " under " + f.nameOf(t, villain)
	if got := f.lastLog().Text; got != want {
		t.Errorf("line = %q, want %q", got, want)
	}
	if got := len(tb.Piles["sdeck:x"].Cards); got != 0 {
		t.Errorf("sdeck:x holds %d cards, want 0", got)
	}
	checkIntegrity(t, tb)

	err := f.do("h", Action{Kind: ActPlay, Pile: "enc:w", X: 500, Y: 300}, at(3))
	if !errors.Is(err, ErrInvalid) {
		t.Errorf("play from an encounter deck: err = %v, want ErrInvalid", err)
	}
}

// TestPlayFromScenarioDeckTakesTheRevealedCard plays the top of a scenario
// deck with a card revealed on it: that card, its top card.
func TestPlayFromScenarioDeckTakesTheRevealedCard(t *testing.T) {
	f := scenarioFixture(t)
	tb := f.g.Table
	f.mustDo(t, "h", Action{Kind: ActReveal, Pile: "sdeck:x"}, at(1))

	f.mustDo(t, "b", Action{Kind: ActPlay, Pile: "sdeck:x", Target: f.villain(), X: 40, Y: 60}, at(2))
	if c := tb.Cards["x2"]; c.Zone != ZoneTable || c.OnPile != "" || c.FaceDown || c.Parent != f.villain() {
		t.Errorf("x2 = %+v, want the revealed card played face up under the villain", c)
	}
	if got := tb.Piles["sdeck:x"].Cards; !slices.Equal(got, []string{"x1"}) {
		t.Errorf("sdeck:x = %v, want [x1]", got)
	}
	checkIntegrity(t, tb)
}

func TestShuffleInTarget(t *testing.T) {
	f := scenarioFixture(t)
	tb := f.g.Table
	aside := tb.Piles[PileScenarioAside]
	for _, id := range []string{"a1", "a2"} {
		home := "enc:w"
		if id == "a2" {
			home = PileEncounter
		}
		tb.Cards[id] = &Card{ID: id, Code: tb.Cards["w1"].Code, Owner: NoOwner, Home: home, Zone: ZonePile, Pile: aside.ID}
		aside.Cards = append(aside.Cards, id)
	}
	f.mustDo(t, "h", Action{Kind: ActShuffleIn, Pile: PileScenarioAside, Target: "enc:w"}, at(1))
	if got := len(tb.Piles["enc:w"].Cards); got != 4 {
		t.Errorf("enc:w holds %d cards, want 4", got)
	}
	if !slices.Contains(aside.Cards, "a2") || len(aside.Cards) != 1 {
		t.Errorf("set-aside = %v, want only the classic card left", aside.Cards)
	}
	if got := f.lastLog().Text; got != "shuffled the set-aside cards into Wrecker's encounter deck" {
		t.Errorf("log = %q", got)
	}
	f.mustDo(t, "h", Action{Kind: ActShuffleIn, Pile: PileScenarioAside}, at(2))
	if len(aside.Cards) != 0 {
		t.Errorf("set-aside = %v, want none after the default shuffle-in", aside.Cards)
	}
}

func TestScenarioDeckNarration(t *testing.T) {
	f := scenarioFixture(t)
	who := f.g.actorOf(0)
	for id, want := range map[string]string{
		"enc:w":   "Wrecker's encounter deck",
		"encd:w":  "Wrecker's encounter discard pile",
		"sdeck:x": "the Experimental Weapons deck",
	} {
		if got := f.g.pileName(who, id); got != want {
			t.Errorf("pileName(%s) = %q, want %q", id, got, want)
		}
	}
	f.g.Table.Piles["sdisc:x"] = &Pile{
		ID: "sdisc:x", Kind: KindScenarioDiscard, Owner: NoOwner, Label: "Experimental Weapons",
	}
	if got, want := f.g.pileName(who, "sdisc:x"), "the Experimental Weapons discard pile"; got != want {
		t.Errorf("pileName(sdisc:x) = %q, want %q", got, want)
	}
}

func TestViewSendsScenarioHome(t *testing.T) {
	f := scenarioFixture(t)
	f.mustDo(t, "h", Action{Kind: ActReveal, Pile: "sdeck:x"}, at(1))
	view := f.g.ViewFor("h").Table
	var found bool
	for _, c := range view.Cards {
		if c.ID == "x2" {
			found = true
			if c.Home != "sdeck:x" {
				t.Errorf("home = %q, want sdeck:x", c.Home)
			}
		}
	}
	if !found {
		t.Fatal("x2 is not in the view")
	}
	for _, p := range view.Piles {
		if p.ID == "sdeck:x" && (p.Label != "Experimental Weapons" || !p.Compact || p.Discard != PileEncounterDiscard) {
			t.Errorf("pile view = %+v, want its label, compact and its discard pile", p)
		}
		if p.ID == "enc:w" && p.Discard != "encd:w" {
			t.Errorf("pile view = %+v, want its own discard pile", p)
		}
	}
}
