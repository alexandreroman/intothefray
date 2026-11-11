package game

import (
	"fmt"
	"slices"
	"testing"

	"github.com/alexandreroman/intothefray/packs/packstest"
)

// Player cards with the Starting keyword (see pack.Card.Starting).
const (
	innateReflexes    = "60038"
	innateAggression  = "61034"
	innatePerception  = "61036"
	innateInspiration = "61037"
)

// withStarting returns a Spider-Man deck listing the Starting cards codes, one
// copy each, in that order.
func withStarting(t *testing.T, codes ...string) DeckChoice {
	t.Helper()
	deck := spiderManDeck(t, packstest.Catalog(t))
	for _, code := range codes {
		deck.Cards = append(deck.Cards, DeckEntry{Code: code, Qty: 1})
	}
	return deck
}

// handCodes returns the codes of the cards in seat's hand, in hand order.
func handCodes(table *Table, seat int) []string {
	var codes []string
	for _, id := range table.Hands[PlayerArea(seat)] {
		codes = append(codes, table.Cards[id].Code)
	}
	return codes
}

// checkStartingHand fails unless seat's hand holds exactly the cards of the
// codes, in that order, owned by the seat and at home in its deck, and its
// deck holds the rest of the deck list.
func checkStartingHand(t *testing.T, table *Table, seat int, deck DeckChoice, codes []string) {
	t.Helper()
	area := PlayerArea(seat)
	deckID := playerDeckID(area)
	if got := handCodes(table, seat); !slices.Equal(got, codes) {
		t.Errorf("hand of %s = %v, want %v", area, got, codes)
	}
	for _, id := range table.Hands[area] {
		c := table.Cards[id]
		if c.Zone != ZoneHand || c.Pile != "" || c.Owner != seat || c.Home != deckID {
			t.Errorf("hand card %+v, want in the hand of seat %d, at home in %s", c, seat, deckID)
		}
	}

	want := expectedDeckCodes(t, packstest.Catalog(t), deck)
	for _, code := range codes {
		i := slices.Index(want, code)
		if i < 0 {
			t.Fatalf("deck list lacks %s", code)
		}
		want = slices.Delete(want, i, i+1)
	}
	if got := codesOf(table, table.Piles[deckID].Cards); !slices.Equal(got, want) {
		t.Errorf("%s = %v, want %v", deckID, got, want)
	}
}

func TestSetupPutsStartingCardsInHand(t *testing.T) {
	tests := []struct {
		name     string
		starting []string
	}{
		{"no Starting card", nil},
		{"one Starting card", []string{innateReflexes}},
		{"in deck list order", []string{innateInspiration, innateReflexes, innateAggression}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			deck := withStarting(t, tt.starting...)
			table := heroGame(t, deck).g.Table

			checkStartingHand(t, table, 0, deck, tt.starting)
			checkIntegrity(t, table)
		})
	}
}

func TestSetupPutsStartingCardsInTheirSeatsHand(t *testing.T) {
	t.Run("two players", func(t *testing.T) {
		host, bob := withStarting(t, innateReflexes), withStarting(t, innateAggression, innatePerception)
		table := heroGame(t, host, bob).g.Table

		checkStartingHand(t, table, 0, host, []string{innateReflexes})
		checkStartingHand(t, table, 1, bob, []string{innateAggression, innatePerception})
		checkIntegrity(t, table)
	})

	t.Run("several decks for one player", func(t *testing.T) {
		decks := [3]DeckChoice{
			withStarting(t),
			withStarting(t, innatePerception),
			withStarting(t, innateInspiration),
		}
		table := threeSeatGame(t, decks).Table

		hands := [][]string{nil, {innatePerception}, {innateInspiration}}
		for seat, hand := range hands {
			t.Run(fmt.Sprintf("seat %d", seat), func(t *testing.T) {
				checkStartingHand(t, table, seat, decks[seat], hand)
			})
		}
		checkIntegrity(t, table)
	})
}

func TestStartingCardsShowToTheirOwnerOnly(t *testing.T) {
	g := heroGame(t, withStarting(t, innateReflexes), withStarting(t)).g
	starting := g.Table.Hands["p0"][0]

	host := g.ViewFor("h")
	if got := host.Table.Hands["p0"]; !slices.Equal(got, []string{starting}) {
		t.Errorf("host's view of hand p0 = %v, want [%s]", got, starting)
	}
	if !slices.ContainsFunc(host.Table.Cards, func(c CardView) bool { return c.ID == starting }) {
		t.Errorf("host's view lacks the Starting card %s", starting)
	}

	bob := g.ViewFor("b")
	if _, ok := bob.Table.Hands["p0"]; ok {
		t.Error("Bob's view lists the hand of p0")
	}
	if slices.ContainsFunc(bob.Table.Cards, func(c CardView) bool { return c.ID == starting }) {
		t.Errorf("Bob's view lists the Starting card %s of p0", starting)
	}
	if got := bob.Players[0].Decks[0].HandCount; got != 1 {
		t.Errorf("Bob's view of the hand count of p0 = %d, want 1", got)
	}
}

func TestStartingCardGameReplays(t *testing.T) {
	t.Run("at setup", func(t *testing.T) {
		f := heroGame(t, withStarting(t, innateReflexes), withStarting(t, innateAggression))
		checkReplay(t, f)
	})

	t.Run("after discarding a Starting card", func(t *testing.T) {
		f := heroGame(t, withStarting(t, innateReflexes), withStarting(t, innateAggression))
		f.mustDo(t, "h", Action{Kind: ActDiscard, Card: f.g.Table.Hands["p0"][0]}, at(1))
		f.mustDo(t, "b", Action{Kind: ActDraw, N: 2}, at(2))
		f.mustDo(t, "b", Action{Kind: ActUndo}, at(3))

		checkIntegrity(t, f.g.Table)
		checkHistory(t, f.g)
		checkReplay(t, f)
	})
}
