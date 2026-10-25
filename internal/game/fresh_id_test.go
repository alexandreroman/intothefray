package game

import (
	"errors"
	"math/rand/v2"
	"slices"
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

// A face-up card everybody sees go into its owner's hand keeps its id.
func TestFaceUpCardTakenIntoHandKeepsItsID(t *testing.T) {
	f := newDoFixture(t)
	played := f.playCards(t, "h", "p0", 1)[0]

	f.mustDo(t, "h", Action{Kind: ActToHand, Card: played}, at(2))

	if _, ok := f.g.Table.Cards[played]; !ok {
		t.Errorf("card %s lost its id", played)
	}
	if e := f.lastEvent(t); e.Action.Renames != nil {
		t.Errorf("event renames %v, want none", e.Action.Renames)
	}
}

// Every card going onto a deck gets a new id, a face-up one too: once the
// owner reorders or searches the deck, its old id would tell where it lies.
func TestFaceUpCardPutOnTheDeckGetsAFreshID(t *testing.T) {
	f := newDoFixture(t)
	played := f.playCards(t, "h", "p0", 1)[0]
	f.mustDo(t, "h", Action{Kind: ActToDeck, Card: played, Where: whereTop}, at(2))
	top := topCards(f.g.Table.Piles["deck:p0"], 2)
	f.mustDo(t, "h", Action{Kind: ActReorderTop, Pile: "deck:p0", Cards: []string{top[1], top[0]}}, at(3))
	f.mustDo(t, "h", Action{Kind: ActSearch, Pile: "deck:p0"}, at(4))

	// Dragged out of the Search box, it lands face down.
	f.mustDo(t, "h", Action{Kind: ActPlay, Card: top[0], X: 600, Y: 400}, at(5))

	if !f.g.Table.Cards[top[0]].FaceDown {
		t.Fatalf("card %s dragged out of the Search box lies face up", top[0])
	}
	checkNeverSeenAgain(t, f.g, "b", played)
	checkIntegrity(t, f.g.Table)
	checkHistory(t, f.g)
	checkReplay(t, f)
}

func TestCardPutOnTheDeckOutOfAPileGetsAFreshID(t *testing.T) {
	f := newDoFixture(t)
	played := f.playCards(t, "h", "p0", 1)[0]
	f.mustDo(t, "h", Action{Kind: ActDiscard, Card: played}, at(2))

	f.mustDo(t, "h", Action{Kind: ActToDeck, Card: played, Where: whereBottom}, at(3))

	if _, ok := f.g.Table.Cards[played]; ok {
		t.Errorf("card %s keeps its id", played)
	}
	checkIntegrity(t, f.g.Table)
	checkHistory(t, f.g)
	checkReplay(t, f)
}

// A revealed card turned face down goes back on top of its deck: onto a deck.
func TestRevealedCardTurnedFaceDownGetsAFreshID(t *testing.T) {
	f := newDoFixture(t)
	id := f.revealTop(t, "h", "deck:p0", 1)

	f.mustDo(t, "h", Action{Kind: ActFlip, Card: id}, at(2))

	if _, ok := f.g.Table.Cards[id]; ok {
		t.Errorf("revealed card %s keeps its id back in the deck", id)
	}
	checkIntegrity(t, f.g.Table)
	checkHistory(t, f.g)
	checkReplay(t, f)
}

// A card tucked under one leaving the table goes to the bottom of its side
// deck when that deck has no discard pile (tuckedDestination): onto a deck.
func TestTuckedCardSentUnderItsDeckGetsAFreshID(t *testing.T) {
	tests := []struct {
		name string
		// host returns the card the Sense card is tucked under, on the table.
		host  func(t *testing.T, f *doFixture) string
		leave func(host string) Action
	}{
		{"discarded host", revealedEnemy, func(host string) Action {
			return Action{Kind: ActDiscard, Card: host}
		}},
		{"host to the victory display", revealedEnemy, func(host string) Action {
			return Action{Kind: ActToPile, Card: host, Target: PileVictory}
		}},
		{"host taken into hand", playedFromDeck, func(host string) Action {
			return Action{Kind: ActToHand, Card: host}
		}},
		{"host shuffled into its deck", playedFromDeck, func(host string) Action {
			return Action{Kind: ActToDeck, Card: host, Where: whereShuffle}
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f, sense := tuckedSenseFixture(t)
			host := tt.host(t, f)
			f.mustDo(t, "h", Action{Kind: ActPlay, Card: sense, Target: host}, at(3))
			f.mustDo(t, "h", Action{Kind: ActFlip, Card: sense}, at(4))
			if !f.g.Table.Cards[sense].FaceDown {
				t.Fatalf("the tucked Sense card %s lies face up", sense)
			}

			f.mustDo(t, "h", tt.leave(host), at(10))

			if _, ok := f.g.Table.Cards[sense]; ok {
				t.Errorf("tucked card %s keeps its id under its deck", sense)
			}
			if got := len(f.g.Table.Piles["side:p0:0"].Cards); got != 5 {
				t.Errorf("Sense deck holds %d cards, want 5", got)
			}
			checkIntegrity(t, f.g.Table)
			checkHistory(t, f.g)
			checkReplay(t, f)
		})
	}
}

// revealedEnemy reveals the top card of the encounter deck and returns it.
func revealedEnemy(t *testing.T, f *doFixture) string {
	t.Helper()
	f.mustDo(t, "h", Action{Kind: ActReveal}, at(2))
	return f.g.Table.revealedOn(PileEncounter)[0].ID
}

// playedFromDeck plays the top card of p0's deck face up and returns it.
func playedFromDeck(t *testing.T, f *doFixture) string {
	t.Helper()
	top := topCards(f.g.Table.Piles["deck:p0"], 1)[0]
	f.mustDo(t, "h", Action{Kind: ActPlay, Pile: "deck:p0", X: 800, Y: 500, FaceUp: true}, at(2))
	return top
}

// repeatingRNG returns a random stream whose first two card ids are the same.
func repeatingRNG() *rand.Rand {
	source := rand.NewPCG(7, 7)
	first := make([]uint64, idLength)
	for i := range first {
		first[i] = source.Uint64()
	}
	return rand.New(&replaySource{values: slices.Concat(first, first), rest: rand.NewPCG(1, 2)}) //nolint:gosec // deterministic test
}

// replaySource returns its values, then those of rest.
type replaySource struct {
	values []uint64
	rest   rand.Source
}

func (s *replaySource) Uint64() uint64 {
	if len(s.values) == 0 {
		return s.rest.Uint64()
	}
	v := s.values[0]
	s.values = s.values[1:]
	return v
}

func TestFreshIDsOfOneActionAreDistinct(t *testing.T) {
	table := newTestTable()
	renames := map[string]string{}

	addFreshIDs(table, renames, []string{"c3", "c4"}, repeatingRNG())

	if renames["c3"] == renames["c4"] {
		t.Errorf("renames %v give one id twice", renames)
	}
}

func TestFreshIDsOfOneGroupAreDistinct(t *testing.T) {
	f := newDoFixture(t)
	f.mustDo(t, "h", Action{Kind: ActDraw, N: 2}, at(1))
	hand := f.g.Table.Hands["p0"]
	a := groupOf(ActToDeck, whereTop, "", hand...)

	resolved, err := resolve(f.g, f.g.actorOf(0), a, repeatingRNG())
	if err != nil {
		t.Fatal(err)
	}

	first, second := resolved.Actions[0].Renames[hand[0]], resolved.Actions[1].Renames[hand[1]]
	if first == "" || first == second {
		t.Fatalf("the group gives ids %q and %q", first, second)
	}
	if err := apply(f.g.Table, resolved); err != nil {
		t.Errorf("apply = %v", err)
	}
}

// A hand card that lands on top of a side deck that shows its top card stays
// in everybody's sight, and its line names it: put on top, or under a deck
// left empty.
func TestHandCardOnAFaceUpSideDeckKeepsItsID(t *testing.T) {
	tests := []struct {
		where string
		draws int // the cards drawn out of the Invocation deck
		line  string
	}{
		{whereTop, 1, "put <name> on top of their Invocation deck"},
		{whereBottom, 5, "put <name> at the bottom of their Invocation deck"},
	}
	for _, tt := range tests {
		t.Run(tt.where, func(t *testing.T) {
			f := sideDeckFixture(t)
			var id string
			for i := range tt.draws {
				id = drawSide(t, f, "h", invocationDeck, 1+i)
			}

			f.mustDo(t, "h", Action{Kind: ActToDeck, Card: id, Where: tt.where}, at(10))

			if top := topCards(f.g.Table.Piles[invocationDeck], 1)[0]; top != id {
				t.Errorf("top of the Invocation deck = %s, want %s", top, id)
			}
			if want := strings.ReplaceAll(tt.line, "<name>", f.nameOf(t, id)); f.lastLog().Text != want {
				t.Errorf("line = %q, want %q", f.lastLog().Text, want)
			}
		})
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
