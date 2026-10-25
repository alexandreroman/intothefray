package game

import (
	"slices"
	"strings"
	"testing"
)

// playCards has the player holding token draw n cards and play them face up
// on the table, side by side, and returns their ids.
func (f *doFixture) playCards(t *testing.T, token string, area Area, n int) []string {
	t.Helper()
	f.mustDo(t, token, Action{Kind: ActDraw, N: n}, at(1))
	played := f.g.Table.Hands[area][len(f.g.Table.Hands[area])-n:]
	ids := append([]string(nil), played...)
	for i, id := range ids {
		f.mustDo(t, token, Action{Kind: ActPlay, Card: id, X: 400 + 200*i, Y: 400}, at(1))
	}
	return ids
}

// moveGroup moves cards as a group, each to (x+200*i, y).
func moveGroup(x, y int, cards ...string) Action {
	subs := make([]Action, 0, len(cards))
	for i, id := range cards {
		subs = append(subs, Action{Kind: ActMove, Card: id, X: x + 200*i, Y: y})
	}
	return group(subs...)
}

// groupOf returns a group of one sub-action of kind per card, sharing where
// and target.
func groupOf(kind Kind, where, target string, cards ...string) Action {
	subs := make([]Action, 0, len(cards))
	for _, id := range cards {
		subs = append(subs, Action{Kind: kind, Card: id, Where: where, Target: target})
	}
	return group(subs...)
}

func TestGroupMoveIsArranging(t *testing.T) {
	f := newDoFixture(t)
	cards := f.playCards(t, "h", "p0", 2)
	lines := len(f.g.Log)
	undoable := f.g.History.lastUndoable(0)

	f.mustDo(t, "h", moveGroup(800, 600, cards...), at(10))

	if len(f.g.Log) != lines {
		t.Errorf("a group move wrote the line %q", f.lastLog().Text)
	}
	event := f.lastEvent(t)
	if event.Action.Kind != ActGroup || event.Tracked || event.Log != -1 {
		t.Errorf("group move recorded as %s, tracked %v, line %d; want an untracked group, no line",
			event.Action.Kind, event.Tracked, event.Log)
	}
	// Undo would still take back the last play, not the move.
	if got := f.g.History.lastUndoable(0); !slices.Equal(got, undoable) {
		t.Errorf("last undoable burst = %v after a group move, want %v", got, undoable)
	}
	checkHistory(t, f.g)
}

func TestGroupMoveReplacesSameSet(t *testing.T) {
	f := newDoFixture(t)
	cards := f.playCards(t, "h", "p0", 3)
	c1, c2, c3 := cards[0], cards[1], cards[2]
	events := len(f.g.History.Events)

	f.mustDo(t, "h", moveGroup(800, 600, c1, c2), at(10))
	// The same set in another order replaces the first move.
	f.mustDo(t, "h", moveGroup(900, 700, c2, c1), at(11))
	if got := len(f.g.History.Events); got != events+1 {
		t.Errorf("two group moves of {c1,c2} left %d events, want 1", got-events)
	}
	if c := f.g.Table.Cards[c2]; c.X != 900 || c.Y != 700 {
		t.Errorf("c2 at (%d,%d), want (900,700)", c.X, c.Y)
	}
	checkHistory(t, f.g)

	// A move of one of them, or of another set, does not.
	f.mustDo(t, "h", Action{Kind: ActMove, Card: c1, X: 1000, Y: 800}, at(12))
	f.mustDo(t, "h", moveGroup(800, 600, c1, c3), at(13))
	if got := len(f.g.History.Events); got != events+3 {
		t.Errorf("group, single and other group moves left %d events, want 3", got-events)
	}
	checkHistory(t, f.g)
}

func TestGroupMoveByAnotherSeatDoesNotReplace(t *testing.T) {
	f := newDoFixture(t)
	cards := f.playCards(t, "h", "p0", 2)
	events := len(f.g.History.Events)

	f.mustDo(t, "h", moveGroup(800, 600, cards...), at(10))
	f.mustDo(t, "b", moveGroup(900, 700, cards...), at(11))

	if got := len(f.g.History.Events); got != events+2 {
		t.Errorf("group moves by two players left %d events, want 2", got-events)
	}
	checkHistory(t, f.g)
}

func TestGroupDiscardOneUndo(t *testing.T) {
	f := newDoFixture(t)
	cards := f.playCards(t, "h", "p0", 3)
	before := f.g.Table.Clone()
	lines := len(f.g.Log)

	f.mustDo(t, "h", groupOf(ActDiscard, "", "", cards...), at(10))

	if got := len(f.g.Log); got != lines+1 {
		t.Fatalf("a group discard wrote %d lines, want 1", got-lines)
	}
	line := len(f.g.Log) - 1
	event := f.lastEvent(t)
	if !event.Tracked || event.Log != line {
		t.Errorf("group discard tracked %v with line %d, want tracked with line %d", event.Tracked, event.Log, line)
	}

	f.mustDo(t, "h", Action{Kind: ActUndo}, at(11))

	if !f.g.Log[line].Undone {
		t.Errorf("line %q is not struck after the undo", f.g.Log[line].Text)
	}
	for _, id := range cards {
		if c, want := f.g.Table.Cards[id], before.Cards[id]; c.Zone != ZoneTable || c.X != want.X || c.Y != want.Y {
			t.Errorf("%s in zone %q at (%d,%d) after the undo, want back on the table at (%d,%d)",
				id, c.Zone, c.X, c.Y, want.X, want.Y)
		}
	}
	if pile := f.g.Table.Piles["disc:p0"]; len(pile.Cards) != len(before.Piles["disc:p0"].Cards) {
		t.Errorf("discard pile holds %d cards after the undo, want %d", len(pile.Cards), len(before.Piles["disc:p0"].Cards))
	}
	checkIntegrity(t, f.g.Table)
	checkHistory(t, f.g)
}

func TestGroupLines(t *testing.T) {
	f := newDoFixture(t)
	cards := f.playCards(t, "h", "p0", 11)
	names := func(ids ...string) string {
		named := make([]string, 0, len(ids))
		for _, id := range ids {
			named = append(named, f.nameOf(t, id))
		}
		return strings.Join(named, ", ")
	}

	tests := []struct {
		name   string
		action Action
		want   string
	}{
		{
			"discard", groupOf(ActDiscard, "", "", cards[0], cards[1], cards[2]),
			"discarded 3 cards (" + names(cards[0], cards[1], cards[2]) + ")",
		},
		{
			"toHand", groupOf(ActToHand, "", "", cards[3], cards[4]),
			"took 2 cards into hand (" + names(cards[3], cards[4]) + ")",
		},
		{
			"toPile", groupOf(ActToPile, "", PileVictory, cards[5], cards[6]),
			"moved 2 cards to the victory display (" + names(cards[5], cards[6]) + ")",
		},
		{
			"toDeck top", groupOf(ActToDeck, whereTop, "", cards[7], cards[8]),
			"put 2 cards on top of their deck (" + names(cards[7], cards[8]) + ")",
		},
		{
			"toPile several", group(
				Action{Kind: ActToPile, Card: cards[9], Target: PileVictory},
				Action{Kind: ActToPile, Card: cards[10], Target: "aside:p0"},
			),
			"moved 2 cards to several piles (" + names(cards[9], cards[10]) + ")",
		},
	}
	for i, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f.mustDo(t, "h", tt.action, at(10+20*i))
			line := f.lastLog()
			if line.Text != tt.want {
				t.Errorf("line = %q, want %q", line.Text, tt.want)
			}
			checkPartsSpellText(t, line)
		})
	}
}

func TestGroupLineCards(t *testing.T) {
	f := newDoFixture(t)
	cards := f.playCards(t, "h", "p0", 4)

	f.mustDo(t, "h", groupOf(ActDiscard, "", "", cards[0], cards[1]), at(10))
	if got := f.lastLog().Cards; !slices.Equal(got, cards[:2]) {
		t.Errorf("discard line cards = %v, want %v", got, cards[:2])
	}
	if got := cardNames(f.lastLog()); len(got) != 2 {
		t.Errorf("discard line names cards %q, want 2", got)
	}

	// Cards gone into a hand are no longer visible: the line lights none.
	f.mustDo(t, "h", groupOf(ActToHand, "", "", cards[2], cards[3]), at(30))
	if got := f.lastLog().Cards; len(got) != 0 {
		t.Errorf("toHand line cards = %v, want none", got)
	}
}

func TestGroupLineFaceDown(t *testing.T) {
	f := newDoFixture(t)
	f.mustDo(t, "b", Action{Kind: ActDeal, Area: "p1", X: 400, Y: 200}, at(1))
	dealt := f.lastDealt(t)
	f.mustDo(t, "b", Action{Kind: ActReveal}, at(2))
	revealed := f.g.Table.revealedOn(PileEncounter)[0].ID
	name := f.nameOf(t, revealed)

	f.mustDo(t, "b", groupOf(ActToDeck, whereBottom, "", dealt, revealed), at(10))

	want := "put 2 cards at the bottom of the encounter deck (a card, " + name + ")"
	if line := f.lastLog(); line.Text != want {
		t.Errorf("line = %q, want %q", line.Text, want)
	}
	if got := cardNames(f.lastLog()); len(got) != 1 || got[0] != name {
		t.Errorf("line names cards %q, want only the revealed one", got)
	}
	checkPartsSpellText(t, f.lastLog())
}

// lastDealt returns the face-down encounter card on the table.
func (f *doFixture) lastDealt(t *testing.T) string {
	t.Helper()
	for id, c := range f.g.Table.Cards {
		if c.Zone == ZoneTable && c.FaceDown {
			return id
		}
	}
	t.Fatal("no face-down card on the table")
	return ""
}

func TestGroupToDeckLine(t *testing.T) {
	t.Run("shared home", func(t *testing.T) {
		f := newDoFixture(t)
		cards := f.playCards(t, "h", "p0", 2)
		want := "put 2 cards at the bottom of their deck (" + f.nameOf(t, cards[0]) + ", " + f.nameOf(t, cards[1]) + ")"

		f.mustDo(t, "h", groupOf(ActToDeck, whereBottom, "", cards...), at(10))

		if line := f.lastLog(); line.Text != want {
			t.Errorf("line = %q, want %q", line.Text, want)
		}
		if line := f.lastLog(); len(line.Cards) != 0 {
			t.Errorf("line cards = %v, want none: decks hide their cards", line.Cards)
		}
	})

	t.Run("two homes", func(t *testing.T) {
		f := multiDeckFixture(t)
		// Alex plays one card from each of his decks.
		f.mustDoAs(t, "a", 0, Action{Kind: ActDraw, N: 1, Pile: "deck:p0"}, at(1))
		f.mustDoAs(t, "a", 0, Action{Kind: ActDraw, N: 1, Pile: "deck:p1"}, at(2))
		first, second := f.g.Table.Hands["p0"][0], f.g.Table.Hands["p1"][0]
		f.mustDoAs(t, "a", 0, Action{Kind: ActPlay, Card: first, X: 400, Y: 400}, at(3))
		f.mustDoAs(t, "a", 1, Action{Kind: ActPlay, Card: second, X: 600, Y: 400}, at(4))
		want := "put 2 cards on top of their decks (" + f.nameOf(t, first) + ", " + f.nameOf(t, second) + ")"

		f.mustDoAs(t, "a", 0, groupOf(ActToDeck, whereTop, "", first, second), at(10))

		if line := f.lastLog(); line.Text != want {
			t.Errorf("line = %q, want %q", line.Text, want)
		}
	})
}

// recordGroupGame plays a scripted two-player Rhino game with group actions
// and stores its setup and events at recording, and its live table at
// golden.
func recordGroupGame(t *testing.T, recording, golden string) {
	t.Helper()
	f := newDoFixture(t)
	host := f.playCards(t, "h", "p0", 3)
	bob := f.playCards(t, "b", "p1", 2)

	// Dragging a group around: the second move replaces the first.
	f.mustDo(t, "h", moveGroup(800, 600, host...), at(10))
	f.mustDo(t, "h", moveGroup(900, 700, host...), at(11))
	f.mustDo(t, "b", groupOf(ActDiscard, "", "", bob...), at(12))
	f.mustDo(t, "h", groupOf(ActDiscard, "", "", host[0], host[1]), at(13))
	f.mustDo(t, "h", Action{Kind: ActUndo}, at(14))
	f.mustDo(t, "h", groupOf(ActToHand, "", "", host[1], host[2]), at(15))
	checkReplay(t, f)

	setup, err := f.g.ReplaySetup()
	if err != nil {
		t.Fatal(err)
	}
	writeFile(t, recording, indentedJSON(t, recordedGame{Setup: setup, Events: f.g.History.Events}))
	writeFile(t, golden, indentedJSON(t, f.g.Table))
}

// TestGroupDroppedWhole undoes the play of a card that Bob has since moved in
// a group: the rebuild cannot move it any more, so Bob's whole group is
// dropped, and his other card stays where he played it.
func TestGroupDroppedWhole(t *testing.T) {
	f := newDoFixture(t)
	f.mustDo(t, "b", Action{Kind: ActDraw, N: 1}, at(1))
	bobs := f.g.Table.Hands["p1"][0]
	f.mustDo(t, "b", Action{Kind: ActPlay, Card: bobs, X: 600, Y: 200}, at(2))
	f.mustDo(t, "h", Action{Kind: ActDraw, N: 1}, at(3))
	hosts := f.g.Table.Hands["p0"][0]
	f.mustDo(t, "h", Action{Kind: ActPlay, Card: hosts, X: 400, Y: 200}, at(30))
	// Bob's card comes first: its move runs before the host's one fails.
	f.mustDo(t, "b", moveGroup(800, 600, bobs, hosts), at(31))

	f.mustDo(t, "h", Action{Kind: ActUndo}, at(32))

	// The undo is the last event; Bob's group comes just before it.
	events := f.g.History.Events
	moved := events[len(events)-2]
	if moved.Action.Kind != ActGroup || !moved.Dropped {
		t.Errorf("event before the undo = %+v, want Bob's group, dropped", moved)
	}
	if c := f.g.Table.Cards[hosts]; c.Zone != ZoneHand {
		t.Errorf("host's card in zone %q, want back in hand", c.Zone)
	}
	if c := f.g.Table.Cards[bobs]; c.Zone != ZoneTable || c.X != 600 || c.Y != 200 {
		t.Errorf("Bob's card in zone %q at (%d,%d), want on the table at (600,200)", c.Zone, c.X, c.Y)
	}
	checkIntegrity(t, f.g.Table)
	checkHistory(t, f.g)
}
