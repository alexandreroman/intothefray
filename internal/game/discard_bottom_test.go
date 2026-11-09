package game

import (
	"slices"
	"strings"
	"testing"

	"github.com/alexandreroman/intothefray/internal/pack"
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
// and keep their ids.
func TestSenseDeckDiscardTopCyclesToItsBottom(t *testing.T) {
	tests := []struct {
		n    int
		line string
	}{
		{1, "put the top card of their Sense deck at the bottom"},
		{2, "put the top 2 cards of their Sense deck at the bottom"},
	}
	for _, tt := range tests {
		t.Run(tt.line, func(t *testing.T) {
			f := sideDeckFixture(t)
			before := slices.Clone(f.g.Table.Piles[senseDeck].Cards)
			top := topCards(f.g.Table.Piles[senseDeck], tt.n)

			f.mustDo(t, "b", Action{Kind: ActDiscardTop, Pile: senseDeck, N: tt.n}, at(1))

			// The top card goes under the deck first, the next one under it.
			moved := slices.Clone(top)
			slices.Reverse(moved)
			want := slices.Concat(moved, before[:len(before)-tt.n])
			if got := f.g.Table.Piles[senseDeck].Cards; !slices.Equal(got, want) {
				t.Errorf("%s = %v, want %v", senseDeck, got, want)
			}
			if got := f.lastEvent(t).Action.Cards; !slices.Equal(got, top) {
				t.Errorf("recorded cards = %v, want %v", got, top)
			}
			if got := f.lastLog().Text; got != tt.line {
				t.Errorf("line = %q, want %q", got, tt.line)
			}
			checkIntegrity(t, f.g.Table)
			checkHistory(t, f.g)
			checkReplay(t, f)
		})
	}
}

// TestBottomDiscardScenarioDeck sets up a scenario deck whose cards are
// discarded to its bottom: it records itself as its discard pile.
func TestBottomDiscardScenarioDeck(t *testing.T) {
	b := &tableBuilder{cat: setupCatalog(t), rng: newTestRNG(), table: newEmptyTable(1)}
	b.addDeckGroup(pack.ScenarioDeck{Key: "b", Label: "Bottom", Sets: []string{"sa"}, Discard: pack.DiscardBottom})
	deckID, discardID := scenarioDeckIDs("b", false)
	if got := b.table.Piles[deckID].Discard; got != deckID {
		t.Errorf("%s discard = %q, want %s", deckID, got, deckID)
	}
	if b.table.Piles[discardID] != nil {
		t.Errorf("a deck discarding to its bottom has %s", discardID)
	}
}
