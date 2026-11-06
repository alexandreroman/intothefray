package game

import (
	"errors"
	"fmt"
	"maps"
	"reflect"
	"slices"
	"testing"
)

func TestDetachClosesTheStack(t *testing.T) {
	table := newChainTable(t)

	mustApply(t, table, Action{Kind: ActDetach, Card: "c10", X: 1004, Y: 496})

	// c11 takes the place of c10, under c9; c10 lies alone on top, snapped.
	checkStack(t, table, "c7", "c9", "c11")
	checkAt(t, table, "c10", 1000, 500)
	checkStack(t, table, "c10")
	checkZOrder(t, table, "c11", "c9", "c7", "c10")
	checkUniqueZ(t, table)
}

func TestDetachKeepsTheCardState(t *testing.T) {
	table := newTestTable()
	c2 := table.Cards["c2"]
	c2.Face, c2.Faces, c2.FaceDown, c2.Exhausted = 1, 2, true, true
	c2.Tokens = map[string]int{"dmg": 3}
	c2.Status = map[string]int{"tough": 1}
	c2.Mods = map[string]int{"atk": 2}

	mustApply(t, table, Action{Kind: ActDetach, Card: "c2", X: 400, Y: 200})

	got := table.Cards["c2"]
	if got.Parent != "" || got.Zone != ZoneTable {
		t.Fatalf("c2 = %+v, want alone on the table", got)
	}
	if got.Face != 1 || !got.FaceDown || !got.Exhausted {
		t.Errorf("c2 face %d, face down %v, exhausted %v; want 1, true, true", got.Face, got.FaceDown, got.Exhausted)
	}
	if !maps.Equal(got.Tokens, map[string]int{"dmg": 3}) || !maps.Equal(got.Status, map[string]int{"tough": 1}) ||
		!maps.Equal(got.Mods, map[string]int{"atk": 2}) {
		t.Errorf("c2 counters = %v %v %v, want them kept", got.Tokens, got.Status, got.Mods)
	}
}

func TestDetachRefusesACardTuckedUnderNone(t *testing.T) {
	tests := []struct {
		name string
		card string
	}{
		{"main card", "c1"},
		{"single card", "c7"},
		{"hand card", "c3"},
		{"deck card", "c4"},
		{"unknown card", "nope"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			table := newTestTable()
			before := table.Clone()

			err := apply(table, Action{Kind: ActDetach, Card: tt.card, X: 400, Y: 200})

			if !errors.Is(err, ErrInvalid) || !reflect.DeepEqual(before, table) {
				t.Errorf("err = %v, table unchanged = %t; want ErrInvalid, unchanged", err, reflect.DeepEqual(before, table))
			}
		})
	}
}

// TestDetachIsOneUndoableStep detaches a card played under the villain: one
// line names it and the stack's main card, and an undo tucks it back.
func TestDetachIsOneUndoableStep(t *testing.T) {
	f := newDoFixture(t)
	f.mustDo(t, "h", Action{Kind: ActDraw, N: 2}, at(1))
	hand := slices.Clone(f.g.Table.Hands["p0"])
	f.mustDo(t, "h", Action{Kind: ActPlay, Card: hand[0], Target: f.villain()}, at(2))
	f.mustDo(t, "h", Action{Kind: ActPlay, Card: hand[1], Target: f.villain()}, at(3))
	lines := len(f.g.Log)

	f.mustDo(t, "b", Action{Kind: ActDetach, Card: hand[0], X: 1200, Y: 300}, at(4))

	c := f.g.Table.Cards[hand[0]]
	if c.Zone != ZoneTable || c.Parent != "" || c.X != 1200 || c.Y != 300 {
		t.Fatalf("detached card = %+v, want alone at (1200,300)", c)
	}
	if got := f.g.Table.Cards[hand[1]].Parent; got != f.villain() {
		t.Errorf("the next card is tucked under %q, want the villain %s", got, f.villain())
	}
	if got := len(f.g.Log); got != lines+1 {
		t.Fatalf("detach wrote %d lines, want 1", got-lines)
	}
	want := fmt.Sprintf("detached %s from %s", f.nameOf(t, hand[0]), f.nameOf(t, f.villain()))
	if got := f.lastLog().Text; got != want {
		t.Errorf("line = %q, want %q", got, want)
	}
	if got := f.lastLog().Cards; !slices.Equal(got, []string{hand[0], f.villain()}) {
		t.Errorf("line cards = %v, want [%s %s]", got, hand[0], f.villain())
	}
	checkIntegrity(t, f.g.Table)

	f.mustDo(t, "b", Action{Kind: ActUndo}, at(5))

	if got := f.g.Table.Cards[hand[0]].Parent; got != f.villain() {
		t.Errorf("after undo, tucked under %q, want the villain %s", got, f.villain())
	}
	if got := f.g.Table.Cards[hand[1]].Parent; got != hand[0] {
		t.Errorf("after undo, the next card is tucked under %q, want %s", got, hand[0])
	}
	checkIntegrity(t, f.g.Table)
}

func TestDetachRefusesAMainCardInAGame(t *testing.T) {
	f := newDoFixture(t)
	lines := len(f.g.Log)

	err := f.do("h", Action{Kind: ActDetach, Card: f.villain(), X: 400, Y: 200}, at(1))

	if !errors.Is(err, ErrInvalid) {
		t.Fatalf("Do = %v, want ErrInvalid", err)
	}
	if got := len(f.g.Log); got != lines {
		t.Errorf("the refused detach wrote %d lines", got-lines)
	}
}
