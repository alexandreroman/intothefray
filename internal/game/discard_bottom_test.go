package game

import (
	"errors"
	"slices"
	"strings"
	"testing"

	"github.com/alexandreroman/intothefray/packs/packstest"
)

// TestSenseDeckDiscardsToItsBottom checks the pile the Sense deck records
// for its discarded cards, under the rule "bottom": the deck itself.
func TestSenseDeckDiscardsToItsBottom(t *testing.T) {
	f := sideDeckFixture(t)
	sense := f.g.Table.Piles[senseDeck]
	if sense.Discard != senseDeck || !sense.discardsToBottom() {
		t.Errorf("Sense deck discard = %q, want %s", sense.Discard, senseDeck)
	}
	for _, pv := range f.g.ViewFor("nobody").Table.Piles {
		if pv.ID == senseDeck && pv.Discard != senseDeck {
			t.Errorf("a spectator sees the Sense deck discard as %q, want %s", pv.Discard, senseDeck)
		}
	}
}

// TestSenseCardDiscardGoesUnderItsDeck discards a Sense card: it goes to the
// bottom of the Sense deck, out of sight under a new id, as a toDeck at the
// bottom puts it.
func TestSenseCardDiscardGoesUnderItsDeck(t *testing.T) {
	tests := []struct {
		name    string
		onTable bool
		line    string
	}{
		{"from the table", true, "put <name> at the bottom of their Sense deck"},
		// Nobody else saw the card in the hand, nor sees it under the deck.
		{"from the hand", false, "put a card at the bottom of their Sense deck"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := sideDeckFixture(t)
			card := drawSide(t, f, "b", senseDeck, 1)
			if tt.onTable {
				f.mustDo(t, "b", Action{Kind: ActPlay, Card: card, X: 800, Y: 770}, at(2))
				f.mustDo(t, "b", Action{Kind: ActExhaust, Card: card}, at(3))
			}
			name := f.nameOf(t, card)

			f.mustDo(t, "b", Action{Kind: ActDiscard, Card: card}, at(4))

			tb := f.g.Table
			id := f.renamedID(t, card)
			if id == card {
				t.Errorf("card %s keeps its id under the deck", card)
			}
			if got := tb.Piles[senseDeck].Cards; len(got) != 5 || got[0] != id {
				t.Errorf("%s = %v, want 5 cards, %s at the bottom", senseDeck, got, id)
			}
			c := tb.Cards[id]
			if c.Zone != ZonePile || c.Pile != senseDeck || c.Home != senseDeck || c.Exhausted || c.FaceDown {
				t.Errorf("discarded card = %+v, want ready, face up, at the bottom of %s", c, senseDeck)
			}
			if got, want := f.lastLog().Text, strings.ReplaceAll(tt.line, "<name>", name); got != want {
				t.Errorf("line = %q, want %q", got, want)
			}
			checkIntegrity(t, tb)
			checkHistory(t, f.g)
			checkReplay(t, f)

			f.mustDo(t, "b", Action{Kind: ActUndo}, at(5))
			if c := f.g.Table.Cards[card]; c == nil || c.Pile == senseDeck {
				t.Errorf("card after undo = %+v, want out of the Sense deck", c)
			}
			checkIntegrity(t, f.g.Table)
		})
	}
}

// TestSenseCardDiscardIntoAnEmptyDeckStaysInSight discards a Sense card once
// every other card of the deck is in the hand: alone in its face-up deck, the
// card lies in everybody's sight and keeps its id.
func TestSenseCardDiscardIntoAnEmptyDeckStaysInSight(t *testing.T) {
	f := sideDeckFixture(t)
	f.mustDo(t, "b", Action{Kind: ActDraw, N: 5, Pile: senseDeck}, at(1))
	card := f.lastInHand("p1")
	f.mustDo(t, "b", Action{Kind: ActPlay, Card: card, X: 800, Y: 770}, at(2))
	name := f.nameOf(t, card)

	f.mustDo(t, "b", Action{Kind: ActDiscard, Card: card}, at(3))

	if id := f.renamedID(t, card); id != card {
		t.Errorf("card %s gets the new id %s on an empty face-up deck", card, id)
	}
	if got := f.g.Table.Piles[senseDeck].Cards; !slices.Equal(got, []string{card}) {
		t.Errorf("%s = %v, want [%s]", senseDeck, got, card)
	}
	if got, want := f.lastLog().Text, "put "+name+" at the bottom of their Sense deck"; got != want {
		t.Errorf("line = %q, want %q", got, want)
	}
	checkIntegrity(t, f.g.Table)
	checkHistory(t, f.g)
}

// TestSenseCardsDiscardedInAGroupGoUnderTheirDeck discards two Sense cards
// of the table at once: both go to the bottom of the Sense deck, in order,
// and the line says so.
func TestSenseCardsDiscardedInAGroupGoUnderTheirDeck(t *testing.T) {
	f := sideDeckFixture(t)
	first := drawSide(t, f, "b", senseDeck, 1)
	second := drawSide(t, f, "b", senseDeck, 2)
	f.mustDo(t, "b", Action{Kind: ActPlay, Card: first, X: 800, Y: 770}, at(3))
	f.mustDo(t, "b", Action{Kind: ActPlay, Card: second, X: 960, Y: 770}, at(4))
	names := f.nameOf(t, first) + ", " + f.nameOf(t, second)

	f.mustDo(t, "b", group(
		Action{Kind: ActDiscard, Card: first},
		Action{Kind: ActDiscard, Card: second},
	), at(5))

	first, second = f.renamedID(t, first), f.renamedID(t, second)
	if got := f.g.Table.Piles[senseDeck].Cards[:2]; !slices.Equal(got, []string{second, first}) {
		t.Errorf("bottom of %s = %v, want [%s %s]", senseDeck, got, second, first)
	}
	if got, want := f.lastLog().Text, "put 2 cards at the bottom of their Sense deck ("+names+")"; got != want {
		t.Errorf("line = %q, want %q", got, want)
	}
	checkIntegrity(t, f.g.Table)
	checkHistory(t, f.g)
	checkReplay(t, f)
}

// TestSenseDeckDiscardTopCyclesToItsBottom discards the top cards of the
// Sense deck: they go under it one after the other, in the recorded order,
// out of sight under new ids, and the line names the top card everybody saw.
func TestSenseDeckDiscardTopCyclesToItsBottom(t *testing.T) {
	tests := []struct {
		n    int
		line string
	}{
		{1, "put <name> at the bottom of their Sense deck"},
		{2, "put 2 cards at the bottom of their Sense deck (<name>, a card)"},
	}
	for _, tt := range tests {
		t.Run(tt.line, func(t *testing.T) {
			f := sideDeckFixture(t)
			before := slices.Clone(f.g.Table.Piles[senseDeck].Cards)
			top := topCards(f.g.Table.Piles[senseDeck], tt.n)
			name := f.nameOf(t, top[0])

			f.mustDo(t, "b", Action{Kind: ActDiscardTop, Pile: senseDeck, N: tt.n}, at(1))

			if got := f.lastEvent(t).Action.Cards; !slices.Equal(got, top) {
				t.Errorf("recorded cards = %v, want %v", got, top)
			}
			// The top card goes under the deck first, the next one under it.
			var moved []string
			for _, id := range slices.Backward(top) {
				renamed := f.renamedID(t, id)
				if renamed == id {
					t.Errorf("card %s keeps its id under the deck", id)
				}
				moved = append(moved, renamed)
			}
			want := slices.Concat(moved, before[:len(before)-tt.n])
			if got := f.g.Table.Piles[senseDeck].Cards; !slices.Equal(got, want) {
				t.Errorf("%s = %v, want %v", senseDeck, got, want)
			}
			if got, want := f.lastLog().Text, strings.ReplaceAll(tt.line, "<name>", name); got != want {
				t.Errorf("line = %q, want %q", got, want)
			}
			checkIntegrity(t, f.g.Table)
			checkHistory(t, f.g)
			checkReplay(t, f)

			f.mustDo(t, "b", Action{Kind: ActUndo}, at(2))
			if got := f.g.Table.Piles[senseDeck].Cards; !slices.Equal(got, before) {
				t.Errorf("%s after undo = %v, want %v", senseDeck, got, before)
			}
		})
	}
}

// TestSenseDeckDiscardOfAllItsCardsKeepsTheirIDs discards every card of the
// Sense deck to its bottom: they end in the same order, the top card in
// sight, and keep their ids.
func TestSenseDeckDiscardOfAllItsCardsKeepsTheirIDs(t *testing.T) {
	f := sideDeckFixture(t)
	before := slices.Clone(f.g.Table.Piles[senseDeck].Cards)

	f.mustDo(t, "b", Action{Kind: ActDiscardTop, Pile: senseDeck, N: len(before)}, at(1))

	if renames := f.lastEvent(t).Action.Renames; len(renames) != 0 {
		t.Errorf("renames = %v, want none", renames)
	}
	if got := f.g.Table.Piles[senseDeck].Cards; !slices.Equal(got, before) {
		t.Errorf("%s = %v, want %v", senseDeck, got, before)
	}
	checkIntegrity(t, f.g.Table)
	checkHistory(t, f.g)
	checkReplay(t, f)
}

// TestDiscardTopRefusesMissingRenames refuses a discard of the Sense deck's
// top card that gives it no new id, and one that renames a deck's top cards
// discarded to a discard pile.
func TestDiscardTopRefusesMissingRenames(t *testing.T) {
	f := sideDeckFixture(t)
	tb := f.g.Table.Clone()
	sense := Action{Kind: ActDiscardTop, Pile: senseDeck, N: 1, Cards: topCards(tb.Piles[senseDeck], 1)}
	if err := apply(tb, sense); !errors.Is(err, ErrInvalid) {
		t.Errorf("discard to the bottom without renames = %v, want ErrInvalid", err)
	}
	top := topCards(tb.Piles["deck:p1"], 1)
	deck := Action{Kind: ActDiscardTop, Pile: "deck:p1", N: 1, Cards: top, Renames: map[string]string{top[0]: "cnew"}}
	if err := apply(tb, deck); !errors.Is(err, ErrInvalid) {
		t.Errorf("discard to a discard pile with renames = %v, want ErrInvalid", err)
	}
}

// carriedSenseFixture returns a game of Daredevil alone whose whole Sense
// deck is in his hand but two cards: host on the table, the other tucked
// under it. The Sense deck is empty.
func carriedSenseFixture(t *testing.T) (f *doFixture, host, tucked string) {
	t.Helper()
	f = heroGame(t, heroDeck(t, packstest.Catalog(t), daredevilIdentity, "Daredevil"))
	sense := sideDeckID(0, 0)
	f.mustDo(t, "h", Action{Kind: ActDraw, N: len(f.g.Table.Piles[sense].Cards), Pile: sense}, at(1))
	hand := f.g.Table.Hands["p0"]
	host, tucked = hand[len(hand)-2], hand[len(hand)-1]
	f.mustDo(t, "h", Action{Kind: ActPlay, Card: host, X: 800, Y: 500}, at(2))
	f.mustDo(t, "h", Action{Kind: ActPlay, Card: tucked, Target: host}, at(3))
	return f, host, tucked
}

// TestSenseCardOverItsTuckedCardGoesOutOfSight takes a Sense card off the
// table to the bottom of its empty deck, discarded or put there, a Sense card
// tucked under it: the tucked card drops into the deck first, so the host
// lies under it, out of sight, under a new id.
func TestSenseCardOverItsTuckedCardGoesOutOfSight(t *testing.T) {
	for _, a := range []Action{
		{Kind: ActDiscard},
		{Kind: ActToDeck, Where: whereBottom},
	} {
		t.Run(string(a.Kind), func(t *testing.T) {
			f, host, tucked := carriedSenseFixture(t)
			a.Card = host

			f.mustDo(t, "h", a, at(4))

			hostID, tuckedID := f.renamedID(t, host), f.renamedID(t, tucked)
			if hostID == host {
				t.Errorf("host %s keeps its id under the tucked card", host)
			}
			if got := f.g.Table.Piles[sideDeckID(0, 0)].Cards; !slices.Equal(got, []string{hostID, tuckedID}) {
				t.Errorf("Sense deck = %v, want [%s %s]", got, hostID, tuckedID)
			}
			checkIntegrity(t, f.g.Table)
			checkHistory(t, f.g)
			checkReplay(t, f)
		})
	}
}
