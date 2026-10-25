package game

import (
	"errors"
	"strings"
	"testing"
)

// seenBy returns card id as the player holding token sees it, and whether
// their view lists it.
func seenBy(g *Game, token, id string) (CardView, bool) {
	for _, c := range g.ViewFor(token).Table.Cards {
		if c.ID == id {
			return c, true
		}
	}
	return CardView{}, false
}

// checkNeverSeenAgain fails when the view of the player holding token holds
// id anywhere.
func checkNeverSeenAgain(t *testing.T, g *Game, token, id string) {
	t.Helper()
	if strings.Contains(viewJSON(t, g, token), id) {
		t.Errorf("%s sees the id %s again: they can tie the card to the one they saw before", token, id)
	}
}

// lastInHand returns the card last in the hand of area.
func (f *doFixture) lastInHand(area Area) string {
	hand := f.g.Table.Hands[area]
	return hand[len(hand)-1]
}

// renamedID returns the id card id goes by after the last event: the fresh
// one the event gave it, if any (see freshID), or else id.
func (f *doFixture) renamedID(t *testing.T, id string) string {
	t.Helper()
	a := f.lastEvent(t).Action
	for _, sub := range append([]Action{a}, a.Actions...) {
		if renamed, ok := sub.Renames[id]; ok {
			return renamed
		}
	}
	return id
}

// dragFaceDown drags the top card of p0's deck onto the table, where it lands
// face down, and returns its id.
func (f *doFixture) dragFaceDown(t *testing.T, x, seconds int) string {
	t.Helper()
	top := topCards(f.g.Table.Piles["deck:p0"], 1)[0]
	f.mustDo(t, "h", Action{Kind: ActPlay, Pile: "deck:p0", X: x, Y: 400}, at(seconds))
	if !f.g.Table.Cards[top].FaceDown {
		t.Fatalf("card %s dragged off the deck lies face up", top)
	}
	return top
}

func TestHandCardPutOnTheDeckGetsAFreshID(t *testing.T) {
	f := newDoFixture(t)
	f.mustDo(t, "h", Action{Kind: ActDraw, N: 4}, at(1))
	played := f.g.Table.Hands["p0"][0]
	f.mustDo(t, "h", Action{Kind: ActPlay, Card: played, X: 400, Y: 400}, at(2))
	if c, ok := seenBy(f.g, "b", played); !ok || c.Code == "" {
		t.Fatalf("Bob does not see the card %s played face up: %+v", played, c)
	}
	f.mustDo(t, "h", Action{Kind: ActToHand, Card: played}, at(3))

	f.mustDo(t, "h", Action{Kind: ActToDeck, Card: played, Where: whereTop}, at(4))
	f.dragFaceDown(t, 600, 5)

	checkNeverSeenAgain(t, f.g, "b", played)
	checkIntegrity(t, f.g.Table)
	checkHistory(t, f.g)
	checkReplay(t, f)
}

func TestFaceDownCardTakenIntoHandGetsAFreshID(t *testing.T) {
	f := newDoFixture(t)
	f.mustDo(t, "h", Action{Kind: ActDraw, N: 3}, at(1))
	hidden := f.dragFaceDown(t, 400, 2)
	if c, ok := seenBy(f.g, "b", hidden); !ok || c.Code != "" {
		t.Fatalf("Bob does not see the face-down card %s without its code: %+v", hidden, c)
	}

	f.mustDo(t, "h", Action{Kind: ActToHand, Card: hidden}, at(3))
	taken := f.lastInHand("p0")
	f.mustDo(t, "h", Action{Kind: ActPlay, Card: taken, X: 600, Y: 400}, at(4))

	checkNeverSeenAgain(t, f.g, "b", hidden)
	checkIntegrity(t, f.g.Table)
	checkHistory(t, f.g)
	checkReplay(t, f)
}

func TestFaceDownCardPutOnTheDeckGetsAFreshID(t *testing.T) {
	tests := []struct {
		where string
		// play returns the play that puts the card back face up, out of the
		// deck where it lies.
		play func(deck *Pile) Action
	}{
		{whereTop, func(*Pile) Action {
			return Action{Kind: ActPlay, Pile: "deck:p0", X: 600, Y: 400, FaceUp: true}
		}},
		{whereBottom, func(deck *Pile) Action {
			return Action{Kind: ActPlay, Card: deck.Cards[0], X: 600, Y: 400, FaceUp: true}
		}},
	}
	for _, tt := range tests {
		t.Run(tt.where, func(t *testing.T) {
			f := newDoFixture(t)
			hidden := f.dragFaceDown(t, 400, 1)

			f.mustDo(t, "h", Action{Kind: ActToDeck, Card: hidden, Where: tt.where}, at(2))
			f.mustDo(t, "h", tt.play(f.g.Table.Piles["deck:p0"]), at(3))

			checkNeverSeenAgain(t, f.g, "b", hidden)
			checkIntegrity(t, f.g.Table)
			checkHistory(t, f.g)
			checkReplay(t, f)
		})
	}
}

func TestGroupGivesFreshIDs(t *testing.T) {
	tests := []struct {
		name string
		// prepare returns the cards of the group, which Bob saw.
		prepare func(t *testing.T, f *doFixture) []string
		group   func(cards []string) Action
	}{
		{
			"hand cards put on the deck",
			func(t *testing.T, f *doFixture) []string {
				cards := f.playCards(t, "h", "p0", 2)
				f.mustDo(t, "h", groupOf(ActToHand, "", "", cards...), at(2))
				return cards
			},
			func(cards []string) Action { return groupOf(ActToDeck, whereTop, "", cards...) },
		},
		{
			"face-down cards taken into hand",
			func(t *testing.T, f *doFixture) []string {
				return []string{f.dragFaceDown(t, 400, 1), f.dragFaceDown(t, 600, 2)}
			},
			func(cards []string) Action { return groupOf(ActToHand, "", "", cards...) },
		},
		{
			"face-down cards put under the deck",
			func(t *testing.T, f *doFixture) []string {
				return []string{f.dragFaceDown(t, 400, 1), f.dragFaceDown(t, 600, 2)}
			},
			func(cards []string) Action { return groupOf(ActToDeck, whereBottom, "", cards...) },
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := newDoFixture(t)
			cards := tt.prepare(t, f)

			f.mustDo(t, "h", tt.group(cards), at(10))

			for _, id := range cards {
				if _, ok := f.g.Table.Cards[id]; ok {
					t.Errorf("card %s keeps its id", id)
				}
				checkNeverSeenAgain(t, f.g, "b", id)
			}
			checkIntegrity(t, f.g.Table)
			checkHistory(t, f.g)
			checkReplay(t, f)
		})
	}
}

// A card everybody sees go keeps its id: nothing is hidden on its way.
func TestFaceUpCardKeepsItsID(t *testing.T) {
	tests := []struct {
		name string
		move func(id string) Action
	}{
		{"taken into hand", func(id string) Action { return Action{Kind: ActToHand, Card: id} }},
		{"put on the deck", func(id string) Action { return Action{Kind: ActToDeck, Card: id, Where: whereTop} }},
		{"put under the deck", func(id string) Action { return Action{Kind: ActToDeck, Card: id, Where: whereBottom} }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := newDoFixture(t)
			played := f.playCards(t, "h", "p0", 1)[0]

			f.mustDo(t, "h", tt.move(played), at(2))

			if _, ok := f.g.Table.Cards[played]; !ok {
				t.Errorf("card %s lost its id", played)
			}
			if e := f.lastEvent(t); e.Action.Renames != nil {
				t.Errorf("event renames %v, want none", e.Action.Renames)
			}
		})
	}
}

// A hand card put on top of a side deck that shows its top card stays in
// everybody's sight, and its line names it.
func TestHandCardOnAFaceUpSideDeckKeepsItsID(t *testing.T) {
	f := sideDeckFixture(t)
	id := drawSide(t, f, "h", invocationDeck, 1)

	f.mustDo(t, "h", Action{Kind: ActToDeck, Card: id, Where: whereTop}, at(2))

	if top := topCards(f.g.Table.Piles[invocationDeck], 1)[0]; top != id {
		t.Errorf("top of the Invocation deck = %s, want %s", top, id)
	}
	if want := "put " + f.nameOf(t, id) + " on top of their Invocation deck"; f.lastLog().Text != want {
		t.Errorf("line = %q, want %q", f.lastLog().Text, want)
	}
}

func TestApplyRefusesAFreshIDAlreadyInUse(t *testing.T) {
	tests := []struct {
		name string
		a    Action
	}{
		{"to hand", Action{Kind: ActToHand, Card: "c1", Renames: map[string]string{"c1": "c7"}}},
		{"to deck", Action{Kind: ActToDeck, Card: "c3", Where: whereTop, Renames: map[string]string{"c3": "c7"}}},
		{"another card", Action{Kind: ActToDeck, Card: "c3", Where: whereTop, Renames: map[string]string{"c1": "n"}}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			table := newTestTable()
			if err := apply(table, tt.a); !errors.Is(err, ErrInvalid) {
				t.Errorf("apply(%+v) = %v, want ErrInvalid", tt.a, err)
			}
		})
	}
}
