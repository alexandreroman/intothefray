package game

import (
	"slices"
	"strings"
	"testing"
)

// checkHiddenEverywhere fails when a view of the game, its owner's included,
// shows the code of card id or ties a history line to it.
func checkHiddenEverywhere(t *testing.T, g *Game, id string, tokens ...string) {
	t.Helper()
	for _, token := range append(tokens, "nobody") {
		v := g.ViewFor(token)
		for _, c := range v.Table.Cards {
			if c.ID == id && c.Code != "" {
				t.Errorf("%s sees the code %q of the face-down card", token, c.Code)
			}
		}
		for _, line := range v.Log {
			if slices.Contains(line.Cards, id) {
				t.Errorf("%s: line %q keeps the id of the face-down card", token, line.Text)
			}
		}
	}
}

// singleFacedInDeck returns a single-faced card of p0's deck, not its top one.
func (f *doFixture) singleFacedInDeck(t *testing.T) string {
	t.Helper()
	deck := f.g.Table.Piles["deck:p0"].Cards
	for _, id := range deck[:len(deck)-1] {
		if f.g.Table.Cards[id].Faces == 1 {
			return id
		}
	}
	t.Fatal("p0's deck has no single-faced card")
	return ""
}

func TestPlayOutOfAHiddenPileLandsFaceDown(t *testing.T) {
	hercules := func(t *testing.T) *doFixture {
		return heroGame(t, heroDeck(t, newCatalog(t), herculesIdentity, "Hercules"))
	}
	// laborDeck returns the id of Hercules' Labor deck, which lies face down.
	laborDeck := func(t *testing.T, f *doFixture) string {
		for i := range 2 {
			if pile := f.g.Table.Piles[sideDeckID(0, i)]; pile.Label == "Labor" {
				return pile.ID
			}
		}
		t.Fatal("Hercules has no Labor deck")
		return ""
	}
	tests := []struct {
		name    string
		fixture func(t *testing.T) *doFixture
		// play prepares the table and returns the card played and its play.
		play     func(t *testing.T, f *doFixture) (string, Action)
		faceDown bool
		line     string // the play line, "" to skip
	}{
		{"deck top", newDoFixture, func(_ *testing.T, f *doFixture) (string, Action) {
			top := topCards(f.g.Table.Piles["deck:p0"], 1)[0]
			return top, Action{Kind: ActPlay, Pile: "deck:p0", X: 400, Y: 200}
		}, true, "played a card face down from their deck"},
		{"deck card from a search", newDoFixture, func(t *testing.T, f *doFixture) (string, Action) {
			id := f.singleFacedInDeck(t)
			return id, Action{Kind: ActPlay, Card: id, X: 400, Y: 200}
		}, true, "played a card face down from their deck"},
		{"deck top under a card", newDoFixture, func(_ *testing.T, f *doFixture) (string, Action) {
			top := topCards(f.g.Table.Piles["deck:p0"], 1)[0]
			return top, Action{Kind: ActPlay, Pile: "deck:p0", Target: f.villain()}
		}, true, "played a card face down from their deck under Rhino"},
		{"face-down side deck", hercules, func(t *testing.T, f *doFixture) (string, Action) {
			labor := laborDeck(t, f)
			return topCards(f.g.Table.Piles[labor], 1)[0], Action{Kind: ActPlay, Pile: labor, X: 800, Y: 500}
		}, true, "played a card face down from their Labor deck"},
		{"face-up side deck", sideDeckFixture, func(_ *testing.T, f *doFixture) (string, Action) {
			top := topCards(f.g.Table.Piles[invocationDeck], 1)[0]
			return top, Action{Kind: ActPlay, Pile: invocationDeck, X: 800, Y: 500}
		}, false, ""},
		{"hand", newDoFixture, func(t *testing.T, f *doFixture) (string, Action) {
			f.mustDo(t, "h", Action{Kind: ActDraw, N: 1}, at(1))
			id := f.g.Table.Hands["p0"][0]
			return id, Action{Kind: ActPlay, Card: id, X: 400, Y: 200}
		}, false, ""},
		{"discard pile", newDoFixture, func(t *testing.T, f *doFixture) (string, Action) {
			f.mustDo(t, "h", Action{Kind: ActDiscardTop, Pile: "deck:p0", N: 1}, at(1))
			id := topCards(f.g.Table.Piles["disc:p0"], 1)[0]
			return id, Action{Kind: ActPlay, Card: id, X: 400, Y: 200}
		}, false, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := tt.fixture(t)
			id, play := tt.play(t, f)
			f.mustDo(t, "h", play, at(5))

			c := f.g.Table.Cards[id]
			if c.Zone != ZoneTable || c.FaceDown != tt.faceDown {
				t.Fatalf("played card = %+v, want on the table, face down %t", c, tt.faceDown)
			}
			if tt.line != "" && f.lastLog().Text != tt.line {
				t.Errorf("play line = %q, want %q", f.lastLog().Text, tt.line)
			}
			if !tt.faceDown {
				return
			}
			checkHiddenEverywhere(t, f.g, id, "h", "b")

			f.mustDo(t, "h", Action{Kind: ActFlip, Card: id}, at(10))
			if f.g.Table.Cards[id].FaceDown {
				t.Error("Flip left the played card face down")
			}
			checkPartRefs(t, f.cat, f.g.Log)
			checkIntegrity(t, f.g.Table)
			checkHistory(t, f.g)
		})
	}
}

// TestFaceDownPlayerCardLeavesTheTableFaceUp turns a player's card face down
// on the table, then sends it away: wherever it goes, it lies face up, and its
// owner sees it in a hand or a discard pile.
func TestFaceDownPlayerCardLeavesTheTableFaceUp(t *testing.T) {
	tests := []struct {
		name   string
		leave  Action // the test names the card
		pile   string // the pile it ends in, "" for p0's hand
		seenBy string // a player who sees it there, "" for nobody
		line   string // <name> stands for the card's name
	}{
		{"to the hand", Action{Kind: ActToHand}, "", "h", "took a card into hand"},
		{
			"to the top of the deck",
			Action{Kind: ActToDeck, Where: whereTop},
			"deck:p0", "",
			"put a card on top of their deck",
		},
		{
			"to the bottom of the deck",
			Action{Kind: ActToDeck, Where: whereBottom},
			"deck:p0", "",
			"put a card at the bottom of their deck",
		},
		{"to the discard pile", Action{Kind: ActDiscard}, "disc:p0", "b", "discarded <name>"},
		{
			"to the victory display",
			Action{Kind: ActToPile, Target: PileVictory},
			PileVictory, "b",
			"moved <name> to the victory display",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := newDoFixture(t)
			id := f.singleFacedInDeck(t)
			f.mustDo(t, "h", Action{Kind: ActToHand, Card: id}, at(1))
			f.mustDo(t, "h", Action{Kind: ActPlay, Card: id, X: 400, Y: 200}, at(2))
			f.mustDo(t, "h", Action{Kind: ActFlip, Card: id}, at(3))
			if !f.g.Table.Cards[id].FaceDown {
				t.Fatal("Flip left the single-faced player card face up")
			}
			if got, want := f.lastLog().Text, "turned "+f.nameOf(t, id)+" face down"; got != want {
				t.Errorf("flip line = %q, want %q", got, want)
			}
			checkHiddenEverywhere(t, f.g, id, "h", "b")

			leave := tt.leave
			leave.Card = id
			f.mustDo(t, "h", leave, at(30))
			c := f.g.Table.Cards[id]
			if c.FaceDown {
				t.Errorf("card = %+v, want face up off the table", c)
			}
			checkLeftTo(t, f.g.Table, c, tt.pile, tt.leave.Where)
			if tt.seenBy != "" && !slices.ContainsFunc(f.g.ViewFor(tt.seenBy).Table.Cards, func(v CardView) bool {
				return v.ID == c.ID && v.Code == c.Code
			}) {
				t.Errorf("%s does not see the card where it went", tt.seenBy)
			}
			// Nobody saw the card leave the table: only where it shows is it named.
			want := strings.ReplaceAll(tt.line, "<name>", f.nameOf(t, id))
			if got := f.lastLog().Text; got != want {
				t.Errorf("line = %q, want %q", got, want)
			}
			checkIntegrity(t, f.g.Table)
			checkHistory(t, f.g)
		})
	}
}

// checkLeftTo checks that c lies in pile, at its top or bottom for a deck,
// or in p0's hand when pile is "".
func checkLeftTo(t *testing.T, table *Table, c *Card, pile, where string) {
	t.Helper()
	if pile == "" {
		if c.Zone != ZoneHand || !slices.Contains(table.Hands["p0"], c.ID) {
			t.Errorf("card = %+v, want in p0's hand", c)
		}
		return
	}
	if c.Zone != ZonePile || c.Pile != pile {
		t.Errorf("card = %+v, want in pile %s", c, pile)
		return
	}
	cards := table.Piles[pile].Cards
	switch where {
	case whereTop:
		if cards[len(cards)-1] != c.ID {
			t.Errorf("card %s is not on top of %s", c.ID, pile)
		}
	case whereBottom:
		if cards[0] != c.ID {
			t.Errorf("card %s is not at the bottom of %s", c.ID, pile)
		}
	}
}
