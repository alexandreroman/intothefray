package game

import (
	"errors"
	"maps"
	"slices"
	"testing"
	"time"
)

// The tests in this file play twoDeckGame: Alex ("a") holds seats 0 and 1,
// Sam ("s") seat 2, all three decks Spider-Man.

// multiDeckFixture returns twoDeckGame as a doFixture.
func multiDeckFixture(t *testing.T) *doFixture {
	t.Helper()
	return &doFixture{g: twoDeckGame(t), cat: newCatalog(t)}
}

// doAs performs a for the player holding token, credited to seat.
func (f *doFixture) doAs(token string, seat int, a Action, at time.Time) error {
	return f.g.Do(token, seat, a, f.cat, at)
}

func (f *doFixture) mustDoAs(t *testing.T, token string, seat int, a Action, at time.Time) {
	t.Helper()
	if err := f.doAs(token, seat, a, at); err != nil {
		t.Fatalf("Do(%s, seat %d, %+v) = %v", token, seat, a, err)
	}
}

// lastEvent returns the newest recorded event.
func (f *doFixture) lastEvent(t *testing.T) Event {
	t.Helper()
	events := f.g.History.Events
	if len(events) == 0 {
		t.Fatal("no event recorded")
	}
	return events[len(events)-1]
}

// identityOf returns the id of the identity card of seat, on the table.
func identityOf(t *testing.T, g *Game, seat int) string {
	t.Helper()
	for _, id := range slices.Sorted(maps.Keys(g.Table.Cards)) {
		c := g.Table.Cards[id]
		if c.Zone == ZoneTable && c.Owner == seat {
			return id
		}
	}
	t.Fatalf("seat %d has no card on the table", seat)
	return ""
}

func TestDoDefaultSeat(t *testing.T) {
	f := multiDeckFixture(t)

	f.mustDoAs(t, "a", -1, Action{Kind: ActDraw, N: 1}, at(1))
	if got := f.lastEvent(t).Seat; got != 0 {
		t.Errorf("Alex's event seat = %d, want his home seat 0", got)
	}
	f.mustDoAs(t, "s", -1, Action{Kind: ActDraw, N: 1}, at(2))
	if got := f.lastEvent(t).Seat; got != 2 {
		t.Errorf("Sam's event seat = %d, want his home seat 2", got)
	}
	if len(f.g.Table.Hands["p0"]) != 1 || len(f.g.Table.Hands["p2"]) != 1 {
		t.Errorf("hands = %v, want one card in p0 and p2", f.g.Table.Hands)
	}
}

func TestForeignSeatForbidden(t *testing.T) {
	f := multiDeckFixture(t)

	for _, seat := range []int{2, 3, 7} {
		if err := f.doAs("a", seat, Action{Kind: ActDraw, N: 1}, at(1)); !errors.Is(err, ErrForbidden) {
			t.Errorf("Alex acting as seat %d = %v, want ErrForbidden", seat, err)
		}
	}
	if err := f.doAs("s", 0, Action{Kind: ActDraw, N: 1}, at(1)); !errors.Is(err, ErrForbidden) {
		t.Errorf("Sam acting as seat 0 = %v, want ErrForbidden", err)
	}
	if len(f.g.History.Events) != 0 {
		t.Errorf("a forbidden action recorded %d events", len(f.g.History.Events))
	}
}

func TestPlayerWithoutSeatCannotAct(t *testing.T) {
	f := multiDeckFixture(t)
	// Only a stored game from before deck slots holds a player without any.
	f.g.Players[1].Decks = nil

	err := f.doAs("s", -1, Action{Kind: ActLook, Pile: PileEncounterDiscard, N: 1}, at(1))
	if !errors.Is(err, ErrForbidden) {
		t.Errorf("Do by a player without a seat = %v, want ErrForbidden", err)
	}
	if f.g.Players[1].ready() {
		t.Error("a player without a deck slot must not be ready")
	}
}

func TestDrawOtherOwnDeck(t *testing.T) {
	f := multiDeckFixture(t)
	deck := f.g.Table.Piles["deck:p1"].Cards
	top := deck[len(deck)-1]

	f.mustDoAs(t, "a", 0, Action{Kind: ActDraw, N: 1, Pile: "deck:p1"}, at(1))
	if !slices.Equal(f.g.Table.Hands["p1"], []string{top}) || len(f.g.Table.Hands["p0"]) != 0 {
		t.Errorf("hands = %v, want the top card of deck:p1 in hand p1", f.g.Table.Hands)
	}
	if got := f.lastEvent(t).Seat; got != 0 {
		t.Errorf("event seat = %d, want the credited seat 0", got)
	}

	if err := f.doAs("s", -1, Action{Kind: ActDraw, N: 1, Pile: "deck:p1"}, at(2)); !errors.Is(err, ErrForbidden) {
		t.Errorf("Sam drawing from Alex's deck = %v, want ErrForbidden", err)
	}
}

func TestToHandOwnSeat(t *testing.T) {
	f := multiDeckFixture(t)
	deck := f.g.Table.Piles["deck:p1"].Cards
	card := deck[0]

	f.mustDoAs(t, "a", 0, Action{Kind: ActToHand, Card: card}, at(1))
	if !slices.Equal(f.g.Table.Hands["p1"], []string{card}) {
		t.Errorf("hand p1 = %v, want [%s]: a card goes to its owner's hand", f.g.Table.Hands["p1"], card)
	}

	// Alex uses that hand from his other seat; Sam may not touch it.
	f.mustDoAs(t, "a", 0, Action{Kind: ActDiscard, Card: card}, at(2))
	f.mustDoAs(t, "a", 0, Action{Kind: ActToHand, Card: card}, at(3))
	if err := f.doAs("s", -1, Action{Kind: ActDiscard, Card: card}, at(4)); !errors.Is(err, ErrForbidden) {
		t.Errorf("Sam discarding from Alex's hand = %v, want ErrForbidden", err)
	}
	f.mustDoAs(t, "a", 0, Action{Kind: ActHandOrder, Area: "p1", Cards: []string{card}}, at(5))
}

func TestPrivateViewHomeSeat(t *testing.T) {
	f := multiDeckFixture(t)

	f.mustDoAs(t, "a", 1, Action{Kind: ActSearch, Pile: "deck:p1"}, at(1))
	view := f.g.Table.Views["p0"]
	if view == nil || view.Pile != "deck:p1" {
		t.Fatalf("Views = %v, want Alex's search of deck:p1 under p0", f.g.Table.Views)
	}
	if _, ok := f.g.Table.Views["p1"]; ok {
		t.Error("the view must not be stored under the credited seat p1")
	}
	if got := f.g.ViewFor("a").Table.Private; got == nil || got.Pile != "deck:p1" {
		t.Errorf("Alex's private view = %+v, want deck:p1", got)
	}

	f.mustDoAs(t, "a", 1, Action{Kind: ActCloseView}, at(2))
	if len(f.g.Table.Views) != 0 {
		t.Errorf("Views after close = %v, want none", f.g.Table.Views)
	}

	if err := f.doAs("s", -1, Action{Kind: ActSearch, Pile: "deck:p1"}, at(3)); !errors.Is(err, ErrForbidden) {
		t.Errorf("Sam searching Alex's deck = %v, want ErrForbidden", err)
	}
}

func TestUndoAcrossOwnSeats(t *testing.T) {
	f := multiDeckFixture(t)
	first, second, sams := identityOf(t, f.g, 0), identityOf(t, f.g, 1), identityOf(t, f.g, 2)

	f.mustDoAs(t, "a", 0, Action{Kind: ActExhaust, Card: first}, at(1))
	f.mustDoAs(t, "a", 1, Action{Kind: ActExhaust, Card: second}, at(2))
	f.mustDoAs(t, "s", -1, Action{Kind: ActExhaust, Card: sams}, at(3))
	exhausted := func(id string) bool { return f.g.Table.Cards[id].Exhausted }

	f.mustDoAs(t, "a", -1, Action{Kind: ActUndo}, at(4))
	if !exhausted(first) || exhausted(second) || !exhausted(sams) {
		t.Errorf("after one undo: %v %v %v, want only the seat-1 exhaust undone",
			exhausted(first), exhausted(second), exhausted(sams))
	}
	if !f.g.ViewFor("a").CanUndo {
		t.Error("Alex can still undo his seat-0 exhaust")
	}

	f.mustDoAs(t, "a", 1, Action{Kind: ActUndo}, at(5))
	if exhausted(first) || exhausted(second) || !exhausted(sams) {
		t.Errorf("after two undos: %v %v %v, want Sam's exhaust only",
			exhausted(first), exhausted(second), exhausted(sams))
	}
	if f.g.ViewFor("a").CanUndo {
		t.Error("Alex has nothing left to undo")
	}
	if err := f.doAs("a", -1, Action{Kind: ActUndo}, at(6)); !errors.Is(err, ErrInvalid) {
		t.Errorf("third undo = %v, want ErrInvalid", err)
	}
}

func TestNarrateHeroNames(t *testing.T) {
	f := multiDeckFixture(t)
	g := f.g
	lastLine := func() string { return g.Log[len(g.Log)-1].Text }

	f.mustDoAs(t, "a", 0, Action{Kind: ActDiscardTop, Pile: "deck:p0", N: 1}, at(1))
	if got, want := lastLine(), "discarded the top card of their Spider-Man deck"; got != want {
		t.Errorf("line = %q, want %q", got, want)
	}
	// A pile of another own seat is still the player's own.
	f.mustDoAs(t, "a", 0, Action{Kind: ActShuffle, Pile: "deck:p1"}, at(2))
	if got, want := lastLine(), "shuffled their Spider-Man deck"; got != want {
		t.Errorf("line = %q, want %q", got, want)
	}
	f.mustDoAs(t, "s", -1, Action{Kind: ActDeal, Area: "p1"}, at(3))
	if got, want := lastLine(), "dealt an encounter card face down to Alex (Spider-Man)"; got != want {
		t.Errorf("line = %q, want %q", got, want)
	}
	if got := g.Log[len(g.Log)-1].Who; got != "Sam" {
		t.Errorf("Who = %q, want the player name", got)
	}

	for _, tt := range []struct {
		seat int
		pile string
		want string
	}{
		{2, "deck:p0", "Alex's Spider-Man deck"},
		{2, "disc:p1", "Alex's Spider-Man discard pile"},
		{2, "aside:p0", "Alex's Spider-Man set-aside cards"},
		{1, "disc:p0", "their Spider-Man discard pile"},
		// Sam holds one deck: his piles read as they always did.
		{2, "deck:p2", "their deck"},
		{0, "deck:p2", "Sam's deck"},
	} {
		if got := g.pileName(g.actorOf(tt.seat), tt.pile); got != tt.want {
			t.Errorf("pileName(seat %d, %s) = %q, want %q", tt.seat, tt.pile, got, tt.want)
		}
	}
}

// TestReplayTwoDecks round-trips a game where a player holds two decks:
// the replay seats every deck again in slot order and reproduces the game.
func TestReplayTwoDecks(t *testing.T) {
	f := multiDeckFixture(t)
	f.mustDoAs(t, "a", 0, Action{Kind: ActDraw, N: 2}, at(1))
	f.mustDoAs(t, "a", 0, Action{Kind: ActDraw, N: 1, Pile: "deck:p1"}, at(2))
	f.mustDoAs(t, "a", 1, Action{Kind: ActDiscard, Card: f.g.Table.Hands["p1"][0]}, at(3))
	f.mustDoAs(t, "a", 0, Action{Kind: ActShuffleBack, Pile: "disc:p1"}, at(4))
	f.mustDoAs(t, "s", -1, Action{Kind: ActExhaust, Card: identityOf(t, f.g, 2)}, at(5))
	f.mustDoAs(t, "a", 1, Action{Kind: ActSearch, Pile: "deck:p1"}, at(6))
	f.mustDoAs(t, "a", 1, Action{Kind: ActCloseView, Where: "shuffle"}, at(7))
	f.mustDoAs(t, "a", -1, Action{Kind: ActUndo}, at(8))

	checkReplay(t, f)

	setup, err := f.g.ReplaySetup()
	if err != nil {
		t.Fatal(err)
	}
	replayed, err := Replay(f.cat, setup, f.g.History.Events)
	if err != nil {
		t.Fatal(err)
	}
	for player := range f.g.Players {
		if got, want := replayed.seatsOf(player), f.g.seatsOf(player); !slices.Equal(got, want) {
			t.Errorf("replayed seats of player %d = %v, want %v", player, got, want)
		}
		live, again := f.g.Players[player].Decks, replayed.Players[player].Decks
		for slot := range live {
			if again[slot].URL != live[slot].URL || again[slot].Hero != live[slot].Hero {
				t.Errorf("replayed deck %d of player %d = %+v, want %+v", slot, player, again[slot], live[slot])
			}
		}
	}
	if got, want := replayed.ViewFor("replay-0").You.Areas, []Area{"p0", "p1"}; !slices.Equal(got, want) {
		t.Errorf("replayed areas of the first player = %v, want %v", got, want)
	}
}
