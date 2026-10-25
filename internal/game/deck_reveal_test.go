package game

import (
	"errors"
	"slices"
	"strings"
	"testing"
)

// revealTop reveals the top card of pile for token and returns its id.
func (f *doFixture) revealTop(t *testing.T, token, pile string, seconds int) string {
	t.Helper()
	deckID := pile
	if deckID == "" {
		deckID = PileEncounter
	}
	id := topCards(f.g.Table.Piles[deckID], 1)[0]
	f.mustDo(t, token, Action{Kind: ActReveal, Pile: pile}, at(seconds))
	return id
}

// checkRevealedOn fails unless card id lies face up on the table, revealed on
// pile at the pile's position, and is the only card revealed there.
func checkRevealedOn(t *testing.T, table *Table, id, pile string) {
	t.Helper()
	c, deck := table.Cards[id], table.Piles[pile]
	if c.Zone != ZoneTable || c.OnPile != pile || c.FaceDown || c.X != deck.X || c.Y != deck.Y {
		t.Errorf("%s = %+v, want it face up on the table, revealed on %s at (%d,%d)", id, c, pile, deck.X, deck.Y)
	}
	if slices.Contains(deck.Cards, id) {
		t.Errorf("%s is still in %s", id, pile)
	}
	if got := table.revealedOn(pile); len(got) != 1 {
		t.Errorf("%d cards revealed on %s, want 1", len(got), pile)
	}
}

func TestRevealOwnDeck(t *testing.T) {
	f := newDoFixture(t)
	count := len(f.g.Table.Piles["deck:p0"].Cards)

	id := f.revealTop(t, "h", "deck:p0", 1)

	checkRevealedOn(t, f.g.Table, id, "deck:p0")
	if got := len(f.g.Table.Piles["deck:p0"].Cards); got != count-1 {
		t.Errorf("deck holds %d cards, want %d", got, count-1)
	}
	if got, want := f.lastLog().Text, "revealed "+f.nameOf(t, id)+" from their deck"; got != want {
		t.Errorf("line = %q, want %q", got, want)
	}
	// Everybody sees the revealed card.
	for _, token := range []string{"h", "b", "nobody"} {
		i := slices.IndexFunc(f.g.ViewFor(token).Table.Cards, func(c CardView) bool { return c.ID == id })
		if i < 0 || f.g.ViewFor(token).Table.Cards[i].Code == "" {
			t.Errorf("%s does not see the revealed card", token)
		}
	}
	checkIntegrity(t, f.g.Table)
	checkHistory(t, f.g)
	checkReplay(t, f)
}

func TestRevealFaceDownSideDeck(t *testing.T) {
	f := heroGame(t, heroDeck(t, newCatalog(t), herculesIdentity, "Hercules"))
	labor := f.sideDeckLabeled(t, "Labor")

	id := f.revealTop(t, "h", labor, 1)

	checkRevealedOn(t, f.g.Table, id, labor)
	want := "revealed " + f.nameOf(t, id) + " from " + f.g.pileName(f.g.actorOf(0), labor)
	if got := f.lastLog().Text; got != want {
		t.Errorf("line = %q, want %q", got, want)
	}
	// The client finds the deck by the name ending the line (lastNamedPile in animate.ts).
	if suffix := " from their Labor deck"; !strings.HasSuffix(f.lastLog().Text, suffix) {
		t.Errorf("line = %q, want it to end with %q", f.lastLog().Text, suffix)
	}
	checkIntegrity(t, f.g.Table)
	checkHistory(t, f.g)
}

func TestRevealOfTheEncounterDeckNamesNoPile(t *testing.T) {
	f := newDoFixture(t)

	id := f.revealTop(t, "b", "", 1)

	checkRevealedOn(t, f.g.Table, id, PileEncounter)
	if got, want := f.lastLog().Text, "revealed "+f.nameOf(t, id); got != want {
		t.Errorf("line = %q, want %q", got, want)
	}
	if got := f.g.History.Events[len(f.g.History.Events)-1].Action.Pile; got != "" {
		t.Errorf("recorded pile = %q, want none, as stored reveals have", got)
	}
}

func TestRevealRefused(t *testing.T) {
	tests := []struct {
		name    string
		fixture func(t *testing.T) *doFixture
		// prepare acts before the refused reveal, and returns its pile.
		prepare func(t *testing.T, f *doFixture) string
		want    error
	}{
		{"another player's deck", newDoFixture, func(*testing.T, *doFixture) string {
			return "deck:p1"
		}, ErrForbidden},
		{"a side deck showing its top card", sideDeckFixture, func(*testing.T, *doFixture) string {
			return invocationDeck
		}, ErrInvalid},
		{"a discard pile", newDoFixture, func(t *testing.T, f *doFixture) string {
			f.mustDo(t, "h", Action{Kind: ActDiscardTop, Pile: "deck:p0", N: 1}, at(1))
			return "disc:p0"
		}, ErrInvalid},
		{"a deck with a card revealed on it", newDoFixture, func(t *testing.T, f *doFixture) string {
			f.revealTop(t, "h", "deck:p0", 1)
			return "deck:p0"
		}, ErrInvalid},
		{"an empty deck", newDoFixture, func(t *testing.T, f *doFixture) string {
			f.mustDo(t, "h", Action{Kind: ActDiscardTop, Pile: "deck:p0", N: len(f.g.Table.Piles["deck:p0"].Cards)}, at(1))
			return "deck:p0"
		}, ErrInvalid},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := tt.fixture(t)
			pile := tt.prepare(t, f)
			before := mustJSON(t, f.g)

			err := f.do("h", Action{Kind: ActReveal, Pile: pile}, at(5))

			if !errors.Is(err, tt.want) {
				t.Errorf("err = %v, want %v", err, tt.want)
			}
			if mustJSON(t, f.g) != before {
				t.Error("the refused reveal changed the game")
			}
		})
	}
}

func TestRevealTakesTheRecordedCardAnywhereInTheDeck(t *testing.T) {
	table := newTestTable()

	mustApply(t, table, Action{Kind: ActReveal, Pile: "deck:p0", Cards: []string{"c4"}})

	checkRevealedOn(t, table, "c4", "deck:p0")
	if got := table.Piles["deck:p0"].Cards; !slices.Equal(got, []string{"c5", "c6"}) {
		t.Errorf("deck = %v, want [c5 c6]", got)
	}
	checkIntegrity(t, table)
}

// TestRebuildKeepsTheRevealedDeckCard undoes Bob's older action: the rebuild
// replays Host's reveal, which reveals the same card again.
func TestRebuildKeepsTheRevealedDeckCard(t *testing.T) {
	f := newDoFixture(t)
	f.mustDo(t, "b", Action{Kind: ActExhaust, Card: f.villain()}, at(1))
	id := f.revealTop(t, "h", "deck:p0", 2)

	f.mustDo(t, "b", Action{Kind: ActUndo}, at(3))

	checkRevealedOn(t, f.g.Table, id, "deck:p0")
	checkIntegrity(t, f.g.Table)
	checkHistory(t, f.g)
	checkReplay(t, f)
}

// revealedDecks are the decks every deck action is checked on with a card
// revealed on it: a player's own deck, and the shared encounter deck.
var revealedDecks = []struct{ name, pile, reveal string }{
	{"deck", "deck:p0", "deck:p0"},
	{"encounter deck", PileEncounter, ""},
}

func TestDrawTakesTheRevealedCardFirst(t *testing.T) {
	for _, n := range []int{1, 3} {
		f := newDoFixture(t)
		id := f.revealTop(t, "h", "deck:p0", 1)
		top := topCards(f.g.Table.Piles["deck:p0"], n-1)
		hand := slices.Clone(f.g.Table.Hands["p0"])

		f.mustDo(t, "h", Action{Kind: ActDraw, N: n}, at(2))

		want := slices.Concat(hand, []string{id}, top)
		if got := f.g.Table.Hands["p0"]; !slices.Equal(got, want) {
			t.Errorf("draw %d: hand = %v, want %v", n, got, want)
		}
		if c := f.g.Table.Cards[id]; c.Zone != ZoneHand || c.OnPile != "" {
			t.Errorf("draw %d: revealed card = %+v, want it in the hand", n, c)
		}
		checkIntegrity(t, f.g.Table)
		checkHistory(t, f.g)
		checkReplay(t, f)
	}
}

func TestDrawFromASideDeckTakesTheRevealedCardFirst(t *testing.T) {
	f := heroGame(t, heroDeck(t, newCatalog(t), herculesIdentity, "Hercules"))
	labor := f.sideDeckLabeled(t, "Labor")
	id := f.revealTop(t, "h", labor, 1)

	f.mustDo(t, "h", Action{Kind: ActDraw, N: 1, Pile: labor}, at(2))

	if got := f.g.Table.Hands["p0"]; len(got) == 0 || got[len(got)-1] != id {
		t.Errorf("hand = %v, want the revealed card %s last", got, id)
	}
	checkIntegrity(t, f.g.Table)
	checkHistory(t, f.g)
}

func TestTopCountsTakeTheRevealedCard(t *testing.T) {
	for _, kind := range []Kind{ActDraw, ActDiscardTop} {
		f := newDoFixture(t)
		f.revealTop(t, "h", "deck:p0", 1)
		all := len(f.g.Table.Piles["deck:p0"].Cards) + 1

		if err := f.do("h", Action{Kind: kind, Pile: "deck:p0", N: all + 1}, at(2)); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s of %d cards: err = %v, want ErrInvalid", kind, all+1, err)
		}
		f.mustDo(t, "h", Action{Kind: kind, Pile: "deck:p0", N: all}, at(3))

		if got := f.g.Table.Piles["deck:p0"].Cards; len(got) != 0 {
			t.Errorf("%s of %d cards: deck = %v, want it empty", kind, all, got)
		}
		if got := f.g.Table.revealedOn("deck:p0"); len(got) != 0 {
			t.Errorf("%s of %d cards: revealed = %v, want none", kind, all, got)
		}
	}
}

func TestDiscardTopTakesTheRevealedCardFirst(t *testing.T) {
	for _, deck := range revealedDecks {
		t.Run(deck.name, func(t *testing.T) {
			f := newDoFixture(t)
			id := f.revealTop(t, "h", deck.reveal, 1)
			top := topCards(f.g.Table.Piles[deck.pile], 1)[0]
			discardID, _ := discardPileOf(deck.pile)

			f.mustDo(t, "h", Action{Kind: ActDiscardTop, Pile: deck.pile, N: 2}, at(2))

			if got := f.g.Table.Piles[discardID].Cards; !slices.Equal(got, []string{id, top}) {
				t.Errorf("discard = %v, want [%s %s]", got, id, top)
			}
			checkIntegrity(t, f.g.Table)
			checkHistory(t, f.g)
			checkReplay(t, f)
		})
	}
}

func TestLookAndSearchShowTheRevealedCardOnTop(t *testing.T) {
	for _, deck := range revealedDecks {
		for _, kind := range []Kind{ActLook, ActSearch} {
			t.Run(deck.name+" "+string(kind), func(t *testing.T) {
				f := newDoFixture(t)
				id := f.revealTop(t, "h", deck.reveal, 1)
				below := topCards(f.g.Table.Piles[deck.pile], 2)

				f.mustDo(t, "h", Action{Kind: kind, Pile: deck.pile, N: 3}, at(2))

				private := f.g.ViewFor("h").Table.Private
				if private == nil || len(private.Cards) < 3 || !slices.Equal(private.Cards[:3], append([]string{id}, below...)) {
					t.Errorf("view = %+v, want %s on top of %v", private, id, below)
				}
				if kind == ActSearch && len(private.Cards) != len(f.g.Table.Piles[deck.pile].Cards)+1 {
					t.Errorf("search shows %d cards, want the whole deck and the revealed card", len(private.Cards))
				}
			})
		}
	}
}

// TestReorderOfTheTopPutsTheRevealedCardBack moves the revealed card second
// in a Top X: it goes back into its deck there, face down, and the reordered
// cards get new ids. The reorder is a tracked action: a line tells it, and an
// undo reveals the card again.
func TestReorderOfTheTopPutsTheRevealedCardBack(t *testing.T) {
	for _, deck := range revealedDecks {
		t.Run(deck.name, func(t *testing.T) {
			f := newDoFixture(t)
			id := f.revealTop(t, "h", deck.reveal, 1)
			next := topCards(f.g.Table.Piles[deck.pile], 1)[0]
			codes := []string{f.g.Table.Cards[next].Code, f.g.Table.Cards[id].Code}
			name := f.nameOf(t, id)
			f.mustDo(t, "h", Action{Kind: ActLook, Pile: deck.pile, N: 2}, at(2))

			f.mustDo(t, "h", Action{Kind: ActReorderTop, Pile: deck.pile, Cards: []string{next, id}}, at(3))

			top := topCards(f.g.Table.Piles[deck.pile], 2)
			for i, newID := range top {
				if newID == id || newID == next {
					t.Errorf("reordered card %s keeps its id", newID)
				}
				if got := f.g.Table.Cards[newID].Code; got != codes[i] {
					t.Errorf("card %d of the top = %s, want %s", i, got, codes[i])
				}
			}
			if got := f.g.Table.revealedOn(deck.pile); len(got) != 0 {
				t.Errorf("revealed = %v, want none", got)
			}
			// The viewer keeps looking at the reordered cards.
			if got := f.g.ViewFor("h").Table.Private.Cards; !slices.Equal(got, top) {
				t.Errorf("view = %v, want %v", got, top)
			}
			want := "put " + name + " back into " + f.g.pileName(f.g.actorOf(0), deck.pile)
			if got := f.lastLog().Text; got != want {
				t.Errorf("line = %q, want %q", got, want)
			}
			if got := f.lastLog().Cards; len(got) != 0 {
				t.Errorf("line follows cards %v into the deck, want none", got)
			}
			checkIntegrity(t, f.g.Table)
			checkHistory(t, f.g)
			checkReplay(t, f)

			f.mustDo(t, "h", Action{Kind: ActUndo}, at(4))

			checkRevealedOn(t, f.g.Table, id, deck.pile)
			if got := topCards(f.g.Table.Piles[deck.pile], 1)[0]; got != next {
				t.Errorf("top after undo = %s, want %s", got, next)
			}
			checkIntegrity(t, f.g.Table)
			checkHistory(t, f.g)
		})
	}
}

func TestReorderWithNoRevealedCardOnlyArranges(t *testing.T) {
	f := newDoFixture(t)
	top := topCards(f.g.Table.Piles["deck:p0"], 2)
	slices.Reverse(top)
	lines := len(f.g.Log)

	f.mustDo(t, "h", Action{Kind: ActReorderTop, Pile: "deck:p0", Cards: top}, at(1))

	if got := topCards(f.g.Table.Piles["deck:p0"], 2); !slices.Equal(got, top) {
		t.Errorf("top = %v, want %v, under the same ids", got, top)
	}
	if len(f.g.Log) != lines {
		t.Errorf("history lines = %d, want %d", len(f.g.Log), lines)
	}
	if e := f.g.History.Events[len(f.g.History.Events)-1]; e.Tracked || e.Action.Renames != nil {
		t.Errorf("reorder event = %+v, want an untracked one with no renames", e)
	}
}

func TestShuffleGathersTheRevealedCard(t *testing.T) {
	for _, deck := range revealedDecks {
		t.Run(deck.name, func(t *testing.T) {
			f := newDoFixture(t)
			id := f.revealTop(t, "h", deck.reveal, 1)
			count := len(f.g.Table.Piles[deck.pile].Cards) + 1

			f.mustDo(t, "h", Action{Kind: ActShuffle, Pile: deck.pile}, at(2))

			if got := len(f.g.Table.Piles[deck.pile].Cards); got != count {
				t.Errorf("deck holds %d cards, want %d", got, count)
			}
			if _, ok := f.g.Table.Cards[id]; ok {
				t.Errorf("revealed card %s keeps its id through the shuffle", id)
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

func TestShuffleOnClosingASearchGathersTheRevealedCard(t *testing.T) {
	f := newDoFixture(t)
	f.revealTop(t, "h", "deck:p0", 1)
	count := len(f.g.Table.Piles["deck:p0"].Cards) + 1
	f.mustDo(t, "h", Action{Kind: ActSearch, Pile: "deck:p0"}, at(2))

	f.mustDo(t, "h", Action{Kind: ActCloseView, Where: whereShuffle}, at(3))

	if got := len(f.g.Table.Piles["deck:p0"].Cards); got != count {
		t.Errorf("deck holds %d cards, want %d", got, count)
	}
	checkIntegrity(t, f.g.Table)
	checkHistory(t, f.g)
}

// TestPlayOfTheDeckTopPlaysTheRevealedCard plays the top of a deck with a
// card revealed on it: that card, face up, as everybody saw it.
func TestPlayOfTheDeckTopPlaysTheRevealedCard(t *testing.T) {
	f := newDoFixture(t)
	id := f.revealTop(t, "h", "deck:p0", 1)
	count := len(f.g.Table.Piles["deck:p0"].Cards)

	f.mustDo(t, "h", Action{Kind: ActPlay, Pile: "deck:p0", X: 400, Y: 200}, at(2))

	if c := f.g.Table.Cards[id]; c.Zone != ZoneTable || c.OnPile != "" || c.FaceDown || c.X != 400 {
		t.Errorf("revealed card = %+v, want it played face up at (400,200)", c)
	}
	if got := len(f.g.Table.Piles["deck:p0"].Cards); got != count {
		t.Errorf("deck holds %d cards, want %d", got, count)
	}
	if got, want := f.lastLog().Text, "played "+f.nameOf(t, id); got != want {
		t.Errorf("line = %q, want %q", got, want)
	}
	checkIntegrity(t, f.g.Table)
	checkHistory(t, f.g)
	checkReplay(t, f)

	// The next play of the deck's top, hidden, lands face down.
	next := topCards(f.g.Table.Piles["deck:p0"], 1)[0]
	f.mustDo(t, "h", Action{Kind: ActPlay, Pile: "deck:p0", X: 600, Y: 200}, at(3))
	if c := f.g.Table.Cards[next]; !c.FaceDown {
		t.Errorf("next card = %+v, want it played face down", c)
	}
}

func TestPlayOutOfASearchTakesTheRevealedCard(t *testing.T) {
	for _, deck := range revealedDecks {
		t.Run(deck.name, func(t *testing.T) {
			f := newDoFixture(t)
			id := f.revealTop(t, "h", deck.reveal, 1)
			f.mustDo(t, "h", Action{Kind: ActSearch, Pile: deck.pile}, at(2))

			f.mustDo(t, "h", Action{Kind: ActPlay, Card: id, X: 400, Y: 200}, at(3))

			c := f.g.Table.Cards[id]
			if c.Zone != ZoneTable || c.OnPile != "" || c.FaceDown || c.X != 400 || c.Y != 200 {
				t.Errorf("revealed card = %+v, want it played face up at (400,200)", c)
			}
			if got, want := f.lastLog().Text, "played "+f.nameOf(t, id); got != want {
				t.Errorf("line = %q, want %q", got, want)
			}
			checkIntegrity(t, f.g.Table)
			checkHistory(t, f.g)
		})
	}
}

func TestPutOnTopOfTheDeckCoversTheRevealedCard(t *testing.T) {
	f := newDoFixture(t)
	f.mustDo(t, "h", Action{Kind: ActDraw, N: 1}, at(1))
	drawn := f.g.Table.Hands["p0"][len(f.g.Table.Hands["p0"])-1]
	id := f.revealTop(t, "h", "deck:p0", 2)

	f.mustDo(t, "h", Action{Kind: ActToDeck, Card: drawn, Where: whereTop}, at(3))

	drawn = f.renamedID(t, drawn)
	if got := topCards(f.g.Table.Piles["deck:p0"], 2); !slices.Equal(got, []string{drawn, id}) {
		t.Errorf("top = %v, want [%s %s]", got, drawn, id)
	}
	checkIntegrity(t, f.g.Table)
	checkHistory(t, f.g)
}

func TestRevealedCardPutOnTopOfItsDeckGoesBackThere(t *testing.T) {
	f := newDoFixture(t)
	id := f.revealTop(t, "h", "deck:p0", 1)

	f.mustDo(t, "h", Action{Kind: ActToDeck, Card: id, Where: whereTop}, at(2))

	if got := topCards(f.g.Table.Piles["deck:p0"], 1); !slices.Equal(got, []string{id}) {
		t.Errorf("top = %v, want [%s]", got, id)
	}
	checkIntegrity(t, f.g.Table)
	checkHistory(t, f.g)
}

func TestShuffleBackGathersTheRevealedCard(t *testing.T) {
	f := newDoFixture(t)
	f.mustDo(t, "h", Action{Kind: ActDiscardTop, Pile: "deck:p0", N: 2}, at(1))
	f.revealTop(t, "h", "deck:p0", 2)
	count := len(f.g.Table.Piles["deck:p0"].Cards) + 1 + 2

	f.mustDo(t, "h", Action{Kind: ActShuffleBack, Pile: "disc:p0"}, at(3))

	if got := len(f.g.Table.Piles["deck:p0"].Cards); got != count {
		t.Errorf("deck holds %d cards, want %d", got, count)
	}
	if got := f.g.Table.revealedOn("deck:p0"); len(got) != 0 {
		t.Errorf("revealed = %v, want none", got)
	}
	checkIntegrity(t, f.g.Table)
	checkHistory(t, f.g)
}

// singleFacedOnTop reorders the top of pile so that its top card has a single
// face, which a flip turns face down.
func (f *doFixture) singleFacedOnTop(t *testing.T, token, pile string, seconds int) {
	t.Helper()
	deck := f.g.Table.Piles[pile]
	top := topCards(deck, len(deck.Cards))
	for k, id := range top {
		if faceCount(f.g.Table.Cards[id]) != 1 {
			continue
		}
		if k > 0 {
			order := append([]string{id}, top[:k]...)
			f.mustDo(t, token, Action{Kind: ActReorderTop, Pile: pile, Cards: order}, at(seconds))
		}
		return
	}
	t.Fatalf("%s holds no single-faced card", pile)
}

// TestFlipFaceDownPutsTheRevealedCardBack flips a single-faced revealed card:
// it goes back on top of its deck, and an undo reveals it again.
func TestFlipFaceDownPutsTheRevealedCardBack(t *testing.T) {
	for _, deck := range revealedDecks {
		t.Run(deck.name, func(t *testing.T) {
			f := newDoFixture(t)
			f.singleFacedOnTop(t, "h", deck.pile, 1)
			id := f.revealTop(t, "h", deck.reveal, 2)
			count := len(f.g.Table.Piles[deck.pile].Cards)

			f.mustDo(t, "h", Action{Kind: ActFlip, Card: id}, at(30))

			c := f.g.Table.Cards[id]
			if c.Zone != ZonePile || c.Pile != deck.pile || c.OnPile != "" || c.FaceDown {
				t.Errorf("flipped card = %+v, want it back in %s", c, deck.pile)
			}
			if got := topCards(f.g.Table.Piles[deck.pile], 1)[0]; got != id || len(f.g.Table.Piles[deck.pile].Cards) != count+1 {
				t.Errorf("top of %s = %s, want %s on top of %d cards", deck.pile, got, id, count)
			}
			name := f.g.pileName(f.g.actorOf(0), deck.pile)
			if got, want := f.lastLog().Text, "put "+f.nameOf(t, id)+" back on top of "+name; got != want {
				t.Errorf("line = %q, want %q", got, want)
			}
			if got := f.lastLog().Cards; len(got) != 0 {
				t.Errorf("line follows cards %v into the deck, want none", got)
			}
			checkIntegrity(t, f.g.Table)
			checkHistory(t, f.g)
			checkReplay(t, f)

			f.mustDo(t, "h", Action{Kind: ActUndo}, at(31))

			checkRevealedOn(t, f.g.Table, id, deck.pile)
			checkIntegrity(t, f.g.Table)
			checkHistory(t, f.g)
		})
	}
}

func TestFlipToAnotherFaceKeepsTheCardRevealed(t *testing.T) {
	table := newTestTable()
	c7 := table.Cards["c7"]
	c7.OnPile, c7.Faces = PileEncounter, 2

	mustApply(t, table, Action{Kind: ActFlip, Card: "c7", Face: 1, FaceDown: new(false)})

	if c := table.Cards["c7"]; c.Zone != ZoneTable || c.OnPile != PileEncounter || c.Face != 1 || c.FaceDown {
		t.Errorf("c7 = %+v, want it revealed on its other face", c)
	}
	if got := table.Piles[PileEncounter].Cards; !slices.Equal(got, []string{"c8"}) {
		t.Errorf("enc = %v, want [c8]", got)
	}
}

func TestFlipFaceDownOfACardOffItsDeckLeavesItOnTheTable(t *testing.T) {
	table := newTestTable()

	mustApply(t, table, Action{Kind: ActFlip, Card: "c7", FaceDown: new(true)})

	if c := table.Cards["c7"]; c.Zone != ZoneTable || !c.FaceDown {
		t.Errorf("c7 = %+v, want it face down on the table", c)
	}
}

// TestRevealedCardIsNotInPlay refuses to exhaust a card revealed on a deck,
// or to give it tokens, statuses or modifiers: it lies on its deck.
func TestRevealedCardIsNotInPlay(t *testing.T) {
	for _, deck := range revealedDecks {
		for name, a := range map[string]Action{
			"exhaust":  {Kind: ActExhaust},
			"token":    {Kind: ActToken, Name: "dmg", Delta: 1},
			"status":   {Kind: ActStatus, Name: "stunned", Delta: 1},
			"modifier": {Kind: ActModifier, Name: "atk", Delta: 1},
		} {
			t.Run(deck.name+" "+name, func(t *testing.T) {
				f := newDoFixture(t)
				a.Card = f.revealTop(t, "h", deck.reveal, 1)
				before := mustJSON(t, f.g)

				if err := f.do("h", a, at(2)); !errors.Is(err, ErrInvalid) {
					t.Errorf("err = %v, want ErrInvalid", err)
				}
				if mustJSON(t, f.g) != before {
					t.Error("the refused action changed the game")
				}
			})
		}
	}
}

// TestReadyAllLeavesTheRevealedCardOut readies the cards in play only: a
// card revealed on a deck is never exhausted.
func TestReadyAllLeavesTheRevealedCardOut(t *testing.T) {
	f := newDoFixture(t)
	f.mustDo(t, "h", Action{Kind: ActExhaust, Card: f.villain()}, at(1))
	id := f.revealTop(t, "h", "deck:p0", 2)

	f.mustDo(t, "h", Action{Kind: ActReadyAll}, at(3))

	if got := f.g.History.Events[len(f.g.History.Events)-1].Action.Cards; slices.Contains(got, id) {
		t.Errorf("readied %v, want the revealed card %s left out", got, id)
	}
	checkRevealedOn(t, f.g.Table, id, "deck:p0")
}

func TestApplyRefusesToMarkARevealedCard(t *testing.T) {
	table := newTestTable()
	table.Cards["c7"].OnPile = PileEncounter
	for _, a := range []Action{
		{Kind: ActExhaust, Card: "c7", Exhausted: new(true)},
		{Kind: ActToken, Card: "c7", Name: "thr", Delta: 1},
		{Kind: ActReadyAll, Cards: []string{"c7"}},
	} {
		if err := apply(table, a); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s: err = %v, want ErrInvalid", a.Kind, err)
		}
	}
}
