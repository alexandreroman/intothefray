package game

import (
	"errors"
	"slices"
	"strings"
	"testing"
)

// tuckUnderVillain draws a card into the hand of p0 and plays it under the
// villain, which makes a stack of two cards. It returns the villain and the
// tucked card.
func tuckUnderVillain(t *testing.T, f *doFixture) (villain, tucked string) {
	t.Helper()
	villain = f.villain()
	f.mustDo(t, "h", Action{Kind: ActDraw, N: 1}, at(1))
	tucked = f.g.Table.Hands["p0"][0]
	f.mustDo(t, "h", Action{Kind: ActPlay, Card: tucked, Target: villain}, at(2))
	return villain, tucked
}

// TestPlayDeckTopUnderACard drops the top card of the player's deck on a
// card of a stack: it lands face down at the end of the chain, whatever card
// of it the drop names, and a single undo puts it back on top of the deck.
func TestPlayDeckTopUnderACard(t *testing.T) {
	f := newDoFixture(t)
	villain, tucked := tuckUnderVillain(t, f)
	top := topCards(f.g.Table.Piles["deck:p0"], 1)[0]

	f.mustDo(t, "h", Action{Kind: ActPlay, Pile: "deck:p0", Target: villain}, at(3))

	if !f.g.Table.Cards[top].FaceDown {
		t.Errorf("deck top %s lies face up, want face down", top)
	}
	checkStack(t, f.g.Table, villain, tucked, top)
	checkHiddenEverywhere(t, f.g, top, "h", "b")
	checkIntegrity(t, f.g.Table)

	f.mustDo(t, "h", Action{Kind: ActUndo}, at(4))

	if got := topCards(f.g.Table.Piles["deck:p0"], 1)[0]; got != top {
		t.Errorf("deck top = %s after the undo, want the played card %s", got, top)
	}
	checkStack(t, f.g.Table, villain, tucked)
	checkIntegrity(t, f.g.Table)
	checkHistory(t, f.g)
	checkReplay(t, f)
}

// TestDealUnderACard deals the top card of an encounter deck, the classic one
// or a scenario one, on a card of a stack: it lands face down at the end of
// the chain, laid out as any tucked card, whatever position the action
// gives. The line names the stack's main card, and a single undo puts the
// card back on top of its deck.
func TestDealUnderACard(t *testing.T) {
	tests := []struct {
		deck    string
		fixture func(t *testing.T) *doFixture
	}{
		{PileEncounter, newDoFixture},
		{"enc:w", scenarioFixture},
	}
	for _, tt := range tests {
		deck := tt.deck
		t.Run(deck, func(t *testing.T) {
			f := tt.fixture(t)
			villain, tucked := tuckUnderVillain(t, f)
			top := topCards(f.g.Table.Piles[deck], 1)[0]
			pile := ""
			if deck != PileEncounter {
				pile = deck
			}

			deal := Action{Kind: ActDeal, Pile: pile, Area: "p1", Target: tucked, X: 900, Y: 600}
			f.mustDo(t, "h", deal, at(3))

			if c := f.g.Table.Cards[top]; c.Zone != ZoneTable || !c.FaceDown {
				t.Errorf("%s = zone %s face down %t, want on the table face down", top, c.Zone, c.FaceDown)
			}
			checkStack(t, f.g.Table, villain, tucked, top)
			want := "dealt an encounter card face down to Bob under " + f.nameOf(t, villain)
			if got := f.lastLog().Text; got != want {
				t.Errorf("line = %q, want %q", got, want)
			}
			if got := f.lastLog().Cards; !slices.Equal(got, []string{villain}) {
				t.Errorf("line cards = %v, want [%s]", got, villain)
			}
			checkPartRefs(t, f.cat, f.g.Log)
			checkHiddenEverywhere(t, f.g, top, "h", "b")
			checkIntegrity(t, f.g.Table)

			f.mustDo(t, "h", Action{Kind: ActUndo}, at(4))

			if got := topCards(f.g.Table.Piles[deck], 1)[0]; got != top {
				t.Errorf("%s top = %s after the undo, want the dealt card %s", deck, got, top)
			}
			checkStack(t, f.g.Table, villain, tucked)
			if got, want := f.lastLog().Text, "undid “"+want+"”"; got != want {
				t.Errorf("undo line = %q, want %q", got, want)
			}
			checkIntegrity(t, f.g.Table)
			checkHistory(t, f.g)
			// The scenario fixture adds its decks to the table by hand: no setup
			// replays them.
			if deck == PileEncounter {
				checkReplay(t, f)
			}
		})
	}
}

// TestDealUnderACardTheCardRevealedOnTheDeck deals while a card is revealed on
// the encounter deck, a Sense card tucked under it: the revealed card, back on
// top of the deck, is dealt face down to the end of the villain's stack, and
// the Sense card, whose deck has no discard pile, goes to the bottom of its
// deck under a new id. A single undo brings both back as they were.
func TestDealUnderACardTheCardRevealedOnTheDeck(t *testing.T) {
	f, sense := tuckedSenseFixture(t)
	villain := f.villain()
	f.mustDo(t, "h", Action{Kind: ActReveal}, at(2))
	revealed := f.g.Table.revealedOn(PileEncounter)[0].ID
	f.mustDo(t, "h", Action{Kind: ActPlay, Card: sense, Target: revealed}, at(3))
	before := mustJSON(t, f.g.Table)

	f.mustDo(t, "h", Action{Kind: ActDeal, Area: "p0", Target: villain}, at(4))

	if c := f.g.Table.Cards[revealed]; !c.FaceDown || c.OnPile != "" {
		t.Errorf("%s = %+v, want dealt face down", revealed, c)
	}
	checkStack(t, f.g.Table, villain, revealed)
	renamed := f.renamedID(t, sense)
	if renamed == sense {
		t.Errorf("the Sense card keeps its id %s under its deck", sense)
	}
	if bottom := f.g.Table.Piles["side:p0:0"].Cards[0]; bottom != renamed {
		t.Errorf("bottom of the Sense deck = %s, want %s", bottom, renamed)
	}
	line := f.lastLog()
	if want := " under " + f.nameOf(t, villain); !strings.HasSuffix(line.Text, want) {
		t.Errorf("line = %q, want it to end with %q", line.Text, want)
	}
	if !slices.Equal(line.Cards, []string{villain}) {
		t.Errorf("line cards = %v, want [%s]", line.Cards, villain)
	}
	checkIntegrity(t, f.g.Table)

	f.mustDo(t, "h", Action{Kind: ActUndo}, at(5))

	if got := mustJSON(t, f.g.Table); got != before {
		t.Errorf("table after the undo = %s, want %s", got, before)
	}
	checkIntegrity(t, f.g.Table)
	checkHistory(t, f.g)
	checkReplay(t, f)
}

// TestDealUnderABadTargetIsRefused deals under a card that is not on the
// table: the deal is refused and the encounter deck keeps its card. The card
// revealed on the deck counts as one: dealing takes it back into the deck
// first (see coveredFor), so that it cannot be dealt under itself.
func TestDealUnderABadTargetIsRefused(t *testing.T) {
	tests := []struct {
		name   string
		target func(t *testing.T, f *doFixture) string
	}{
		{"unknown card", func(*testing.T, *doFixture) string { return "nope" }},
		{"card in a deck", func(_ *testing.T, f *doFixture) string {
			return topCards(f.g.Table.Piles["deck:p0"], 1)[0]
		}},
		{"card revealed on the deck", func(t *testing.T, f *doFixture) string {
			f.mustDo(t, "h", Action{Kind: ActReveal}, at(1))
			return f.g.Table.revealedOn(PileEncounter)[0].ID
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := newDoFixture(t)
			target := tt.target(t, f)
			before := f.g.Table.Clone()

			err := f.do("h", Action{Kind: ActDeal, Area: "p1", Target: target}, at(2))

			if !errors.Is(err, ErrInvalid) {
				t.Errorf("err = %v, want ErrInvalid", err)
			}
			got, want := f.g.Table.Piles[PileEncounter].Cards, before.Piles[PileEncounter].Cards
			if !slices.Equal(got, want) {
				t.Errorf("encounter deck = %v, want %v", got, want)
			}
		})
	}
}
