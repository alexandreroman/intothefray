package game

import (
	"errors"
	"slices"
	"testing"
)

// scenarioFixture is a started game whose table gains the encounter deck
// "enc:w" (Wrecker, with its discard "encd:w") and the scenario deck "sdeck:x"
// (Experimental Weapons, with no discard pile). Cards w1..w3 and x1..x2 lie in
// their decks, the last one on top.
func scenarioFixture(t *testing.T) *doFixture {
	t.Helper()
	f := newDoFixture(t)
	tb := f.g.Table
	code := tb.Cards[tb.Piles[PileEncounter].Cards[0]].Code
	tb.Piles["enc:w"] = &Pile{ID: "enc:w", Kind: KindEncounter, Owner: NoOwner,
		Label: "Wrecker", Compact: true, X: 0, Y: 30,
	}
	tb.Piles["encd:w"] = &Pile{ID: "encd:w", Kind: KindEncounterDiscard, Owner: NoOwner,
		Label: "Wrecker", Compact: true, X: 120, Y: 30,
	}
	tb.Piles["sdeck:x"] = &Pile{ID: "sdeck:x", Kind: KindScenarioDeck, Owner: NoOwner,
		Label: "Experimental Weapons", Compact: true, X: 300, Y: 30,
	}
	add := func(deck string, ids ...string) {
		for _, id := range ids {
			tb.Cards[id] = &Card{ID: id, Code: code, Owner: NoOwner, Home: deck, Zone: ZonePile, Pile: deck}
			tb.Piles[deck].Cards = append(tb.Piles[deck].Cards, id)
		}
	}
	add("enc:w", "w1", "w2", "w3")
	add("sdeck:x", "x1", "x2")
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
	if d, ok := discardPileOf("sdeck:x"); !ok || d != "sdisc:x" {
		t.Errorf("discardPileOf(sdeck:x) = %q %t", d, ok)
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
		if p.ID == "sdeck:x" && (p.Label != "Experimental Weapons" || !p.Compact) {
			t.Errorf("pile view = %+v, want its label and compact", p)
		}
	}
}
