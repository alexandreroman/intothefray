package game

import (
	"errors"
	"reflect"
	"slices"
	"testing"
)

func TestAsideTop(t *testing.T) {
	table := newTestTable()

	mustApply(t, table, Action{Kind: ActAsideTop, Pile: "deck:p0", N: 2, Cards: []string{"c6", "c5"}})

	if got := table.Piles["deck:p0"].Cards; !slices.Equal(got, []string{"c4"}) {
		t.Errorf("deck = %v, want [c4]", got)
	}
	if got := table.Piles["aside:p0"].Cards; !slices.Equal(got, []string{"c6", "c5"}) {
		t.Errorf("set-aside pile = %v, want [c6 c5]", got)
	}
	for _, id := range []string{"c5", "c6"} {
		c := table.Cards[id]
		if c.Zone != ZonePile || c.Pile != "aside:p0" || c.Owner != 0 || c.Home != "deck:p0" {
			t.Errorf("%s = %+v, want in aside:p0, owned by seat 0, at home in deck:p0", id, c)
		}
	}

	mustApply(t, table, Action{Kind: ActAsideTop, Pile: PileEncounter, N: 1, Cards: []string{"c8"}})
	if got := table.Piles[PileScenarioAside].Cards; !slices.Equal(got, []string{"c8"}) {
		t.Errorf("saside = %v, want [c8]", got)
	}
	if c := table.Cards["c8"]; c.Owner != NoOwner || c.Home != PileEncounter {
		t.Errorf("c8 = %+v, want owned by nobody, at home in the encounter deck", c)
	}
	checkIntegrity(t, table)
}

// TestAsideTopEqualsSettingAsideOneByOne checks that setting aside the top
// cards of a deck leaves the table as so many "Set aside" moves of its top
// card would.
func TestAsideTopEqualsSettingAsideOneByOne(t *testing.T) {
	once := newTestTable()
	mustApply(t, once, Action{Kind: ActAsideTop, Pile: "deck:p0", N: 3, Cards: []string{"c6", "c5", "c4"}})

	oneByOne := newTestTable()
	for _, id := range []string{"c6", "c5", "c4"} {
		mustApply(t, oneByOne, Action{Kind: ActToPile, Card: id, Target: "aside:p0"})
	}

	if !reflect.DeepEqual(once, oneByOne) {
		t.Errorf("table = %+v, want %+v", once, oneByOne)
	}
}

func TestAsideTopRejectsBadInput(t *testing.T) {
	for name, a := range map[string]Action{
		"zero":        {Kind: ActAsideTop, Pile: "deck:p0", N: 0},
		"not in pile": {Kind: ActAsideTop, Pile: "deck:p0", N: 1, Cards: []string{"c8"}},
		"twice":       {Kind: ActAsideTop, Pile: "deck:p0", N: 2, Cards: []string{"c6", "c6"}},
		"not a deck":  {Kind: ActAsideTop, Pile: "disc:p0", N: 1, Cards: []string{"c6"}},
	} {
		t.Run(name, func(t *testing.T) {
			table := newTestTable()
			before := table.Clone()
			if err := apply(table, a); !errors.Is(err, ErrInvalid) {
				t.Errorf("err = %v, want ErrInvalid", err)
			}
			if !reflect.DeepEqual(table, before) {
				t.Error("table changed after a rejected action")
			}
		})
	}
}

func TestResolveAsideTop(t *testing.T) {
	f := newResolveFixture(t)
	deck := f.g.Table.Piles["deck:p0"]

	got, err := resolve(f.g, f.g.actorOf(0), Action{Kind: ActAsideTop, Pile: "deck:p0", N: 2}, newTestRNG())
	if err != nil {
		t.Fatal(err)
	}
	if want := topCards(deck, 2); !slices.Equal(got.Cards, want) {
		t.Errorf("Cards = %v, want %v", got.Cards, want)
	}
	if got.Renames != nil {
		t.Errorf("Renames = %v, want none: the cards stay in sight", got.Renames)
	}

	tests := []struct {
		name string
		seat int
		a    Action
		want error
	}{
		{"other sets aside from deck", 1, Action{Kind: ActAsideTop, Pile: "deck:p0", N: 1}, ErrForbidden},
		{"anyone sets aside from encounter deck", 1, Action{Kind: ActAsideTop, Pile: PileEncounter, N: 1}, nil},
		{"set aside zero", 0, Action{Kind: ActAsideTop, Pile: "deck:p0", N: 0}, ErrInvalid},
		{"set aside 100", 0, Action{Kind: ActAsideTop, Pile: "deck:p0", N: 100}, ErrInvalid},
		{"set aside more than the deck", 0, Action{Kind: ActAsideTop, Pile: "deck:p0", N: f.deckCount}, ErrInvalid},
		{"set aside from a discard pile", 0, Action{Kind: ActAsideTop, Pile: "disc:p0", N: 1}, ErrInvalid},
		{"unknown pile", 0, Action{Kind: ActAsideTop, Pile: "nope", N: 1}, ErrInvalid},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := resolve(f.g, f.g.actorOf(tt.seat), tt.a, newTestRNG())
			if tt.want == nil && err != nil || tt.want != nil && !errors.Is(err, tt.want) {
				t.Errorf("resolve() error = %v, want %v", err, tt.want)
			}
		})
	}
}

// TestAsideTopRefusesSideAndScenarioDecks refuses a set-aside from a deck with
// no set-aside pile of its own: a hero side deck, a scenario deck, a scenario
// encounter deck.
func TestAsideTopRefusesSideAndScenarioDecks(t *testing.T) {
	f := scenarioFixture(t)
	for _, pile := range []string{"sdeck:x", "enc:w"} {
		if err := f.do("h", Action{Kind: ActAsideTop, Pile: pile, N: 1}, at(1)); !errors.Is(err, ErrInvalid) {
			t.Errorf("set aside from %s: err = %v, want ErrInvalid", pile, err)
		}
	}
	side := sideDeckFixture(t)
	if err := side.do("h", Action{Kind: ActAsideTop, Pile: invocationDeck, N: 1}, at(1)); !errors.Is(err, ErrInvalid) {
		t.Errorf("set aside from the Invocation deck: err = %v, want ErrInvalid", err)
	}
}

func TestAsideTopFromDecks(t *testing.T) {
	tests := []struct {
		name, token, pile, aside, line string
	}{
		{"own deck", "h", "deck:p0", "aside:p0", "set aside the top 2 cards of their deck"},
		{"encounter deck", "b", PileEncounter, PileScenarioAside, "set aside the top 2 cards of the encounter deck"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := newDoFixture(t)
			before := mustJSON(t, f.g.Table)
			deck := len(f.g.Table.Piles[tt.pile].Cards)
			aside := slices.Clone(f.g.Table.Piles[tt.aside].Cards)
			top := topCards(f.g.Table.Piles[tt.pile], 2)

			f.mustDo(t, tt.token, Action{Kind: ActAsideTop, Pile: tt.pile, N: 2}, at(1))

			if got := len(f.g.Table.Piles[tt.pile].Cards); got != deck-2 {
				t.Errorf("deck holds %d cards, want %d", got, deck-2)
			}
			if got, want := f.g.Table.Piles[tt.aside].Cards, slices.Concat(aside, top); !slices.Equal(got, want) {
				t.Errorf("set-aside pile = %v, want %v", got, want)
			}
			entry := f.lastLog()
			if entry.Text != tt.line {
				t.Errorf("line = %q, want %q", entry.Text, tt.line)
			}
			// A set-aside pile shows its cards to everyone: the line names them.
			if !slices.Equal(entry.Cards, top) {
				t.Errorf("line cards = %v, want %v", entry.Cards, top)
			}
			checkIntegrity(t, f.g.Table)
			checkHistory(t, f.g)
			checkReplay(t, f)

			f.mustDo(t, tt.token, Action{Kind: ActUndo}, at(2))
			if got := mustJSON(t, f.g.Table); got != before {
				t.Errorf("table after undo = %s, want %s", got, before)
			}
			checkIntegrity(t, f.g.Table)
			checkHistory(t, f.g)
		})
	}
}

// TestAsideTopOfAnotherSeatsDeck sets aside the top card of the deck of a
// player's other seat, into that seat's set-aside pile; another player may
// not.
func TestAsideTopOfAnotherSeatsDeck(t *testing.T) {
	f := multiDeckFixture(t)
	top := topCards(f.g.Table.Piles["deck:p1"], 1)

	if err := f.doAs("s", 2, Action{Kind: ActAsideTop, Pile: "deck:p1", N: 1}, at(1)); !errors.Is(err, ErrForbidden) {
		t.Errorf("Sam sets aside from Alex's deck: err = %v, want ErrForbidden", err)
	}
	f.mustDoAs(t, "a", 0, Action{Kind: ActAsideTop, Pile: "deck:p1", N: 1}, at(2))

	if got := f.g.Table.Piles["aside:p1"].Cards; !slices.Contains(got, top[0]) {
		t.Errorf("aside:p1 = %v, want it to hold %s", got, top[0])
	}
	if got, want := f.g.Log[len(f.g.Log)-1].Text, "set aside the top card of their Spider-Man deck"; got != want {
		t.Errorf("line = %q, want %q", got, want)
	}
}

func TestAsideTopTakesTheRevealedCardFirst(t *testing.T) {
	for _, deck := range revealedDecks {
		t.Run(deck.name, func(t *testing.T) {
			f := newDoFixture(t)
			id := f.revealTop(t, "h", deck.reveal, 1)
			top := topCards(f.g.Table.Piles[deck.pile], 1)[0]
			asideID := asideOf(f.g.Table.Piles[deck.pile])
			want := slices.Concat(f.g.Table.Piles[asideID].Cards, []string{id, top})

			f.mustDo(t, "h", Action{Kind: ActAsideTop, Pile: deck.pile, N: 2}, at(2))

			if got := f.g.Table.Piles[asideID].Cards; !slices.Equal(got, want) {
				t.Errorf("set-aside pile = %v, want %v", got, want)
			}
			if got := f.g.Table.revealedOn(deck.pile); len(got) != 0 {
				t.Errorf("revealed = %v, want none", got)
			}
			checkIntegrity(t, f.g.Table)
			checkHistory(t, f.g)
			checkReplay(t, f)
		})
	}
}

// TestRebuildReplaysAsideTop undoes an action recorded before a set-aside:
// the rebuild sets the same cards aside again.
func TestRebuildReplaysAsideTop(t *testing.T) {
	f := newDoFixture(t)
	f.mustDo(t, "b", Action{Kind: ActExhaust, Card: f.villain()}, at(1))
	top := topCards(f.g.Table.Piles["deck:p0"], 3)
	f.mustDo(t, "h", Action{Kind: ActAsideTop, Pile: "deck:p0", N: 3}, at(2))

	f.mustDo(t, "b", Action{Kind: ActUndo}, at(3))

	if f.g.Table.Cards[f.villain()].Exhausted {
		t.Error("the villain is still exhausted after Bob's undo")
	}
	aside := f.g.Table.Piles["aside:p0"].Cards
	if got := aside[len(aside)-3:]; !slices.Equal(got, top) {
		t.Errorf("set aside after the rebuild = %v, want %v", got, top)
	}
	checkIntegrity(t, f.g.Table)
	checkHistory(t, f.g)
	checkReplay(t, f)
}
