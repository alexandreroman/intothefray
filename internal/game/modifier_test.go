package game

import (
	"errors"
	"maps"
	"reflect"
	"testing"
)

func TestModifierIsSigned(t *testing.T) {
	table := newTestTable()
	modifier := func(delta int) Action {
		return Action{Kind: ActModifier, Card: "c1", Name: "def", Delta: delta}
	}

	steps := []struct {
		delta int
		want  map[string]int
	}{
		{2, map[string]int{"def": 2}},
		{-3, map[string]int{"def": -1}},
		{-99, map[string]int{"def": -99}},
		{99, nil},
		{99, map[string]int{"def": 99}},
		{1, map[string]int{"def": 99}},
		{-99, nil},
	}
	for i, step := range steps {
		mustApply(t, table, modifier(step.delta))

		if got := table.Cards["c1"].Mods; !maps.Equal(got, step.want) {
			t.Fatalf("step %d (delta %d): mods = %v, want %v", i, step.delta, got, step.want)
		}
	}
}

func TestModifiersAreIndependent(t *testing.T) {
	table := newTestTable()

	mustApply(t, table, Action{Kind: ActModifier, Card: "c7", Name: "atk", Delta: -1})
	mustApply(t, table, Action{Kind: ActModifier, Card: "c7", Name: "sch", Delta: 2})

	if got, want := table.Cards["c7"].Mods, map[string]int{"atk": -1, "sch": 2}; !maps.Equal(got, want) {
		t.Errorf("mods = %v, want %v", got, want)
	}
}

func TestModifierRejectsBadInput(t *testing.T) {
	tests := []Action{
		{Kind: ActModifier, Card: "c1", Name: "hp", Delta: 1},
		{Kind: ActModifier, Card: "c1", Name: "dmg", Delta: 1},
		{Kind: ActModifier, Card: "c1", Name: "ATK", Delta: 1},
		{Kind: ActToken, Card: "c1", Name: "atk", Delta: 1},
		{Kind: ActModifier, Card: "c3", Name: "atk", Delta: 1}, // in hand
		{Kind: ActModifier, Card: "c999", Name: "atk", Delta: 1},
	}
	for _, a := range tests {
		table := newTestTable()
		before := table.Clone()

		if err := apply(table, a); !errors.Is(err, ErrInvalid) {
			t.Errorf("%+v: err = %v, want ErrInvalid", a, err)
		}
		if !reflect.DeepEqual(before, table) {
			t.Errorf("%+v: table changed by a rejected action", a)
		}
	}
}

func TestModifiersClearedWhenTheCardLeavesTheTable(t *testing.T) {
	table := newTestTable()
	mustApply(t, table, Action{Kind: ActModifier, Card: "c1", Name: "thw", Delta: 1})

	mustApply(t, table, Action{Kind: ActDiscard, Card: "c1"})

	if got := table.Cards["c1"].Mods; got != nil {
		t.Errorf("mods = %v, want none once discarded", got)
	}
}

func TestModifierNarration(t *testing.T) {
	f := newDoFixture(t)
	rhino := f.villain()
	modifier := func(name string, delta int) Action {
		return Action{Kind: ActModifier, Card: rhino, Name: name, Delta: delta}
	}

	f.mustDo(t, "h", modifier("atk", -2), at(0))
	if got, want := f.lastLog().Text, "gave Rhino −2 ATK"; got != want {
		t.Errorf("first line = %q, want %q", got, want)
	}
	checkPartsSpellText(t, f.lastLog())

	f.mustDo(t, "h", modifier("def", 1), at(30))
	if got, want := f.lastLog().Text, "gave Rhino +1 DEF"; got != want {
		t.Errorf("line = %q, want %q", got, want)
	}
	lines := len(f.g.Log)

	f.mustDo(t, "h", modifier("def", 1), at(31))
	if got, want := f.lastLog().Text, "set the DEF modifier on Rhino to +2"; got != want {
		t.Errorf("merged line = %q, want %q", got, want)
	}
	f.mustDo(t, "h", modifier("def", -3), at(32))
	if got, want := f.lastLog().Text, "set the DEF modifier on Rhino to −1"; got != want {
		t.Errorf("merged line = %q, want %q", got, want)
	}
	f.mustDo(t, "h", modifier("def", 1), at(33))
	if got, want := f.lastLog().Text, "cleared the DEF modifier on Rhino"; got != want {
		t.Errorf("merged line = %q, want %q", got, want)
	}
	if got := len(f.g.Log); got != lines {
		t.Errorf("the burst wrote %d more lines, want them merged: %q", got-lines, f.logTexts())
	}
	checkPartsSpellText(t, f.lastLog())
	checkPartRefs(t, f.cat, f.g.Log)
}

func TestModifierUndo(t *testing.T) {
	f := newDoFixture(t)
	rhino := f.villain()
	plusOne := Action{Kind: ActModifier, Card: rhino, Name: "atk", Delta: 1}

	f.mustDo(t, "h", plusOne, at(0))
	f.mustDo(t, "h", plusOne, at(30))
	f.mustDo(t, "h", Action{Kind: ActUndo}, at(31))

	if got := f.g.Table.Cards[rhino].Mods["atk"]; got != 1 {
		t.Errorf("atk after the first undo = %d, want 1", got)
	}
	f.mustDo(t, "h", Action{Kind: ActUndo}, at(32))
	if got := f.g.Table.Cards[rhino].Mods; got != nil {
		t.Errorf("mods after undoing every change = %v, want none", got)
	}
}

func TestRemovingAMissingModifierPastTheLimitIsNotTracked(t *testing.T) {
	f := newDoFixture(t)
	rhino := f.villain()
	f.mustDo(t, "h", Action{Kind: ActModifier, Card: rhino, Name: "sch", Delta: -99}, at(0))
	events := len(f.g.History.Events)

	f.mustDo(t, "h", Action{Kind: ActModifier, Card: rhino, Name: "sch", Delta: -1}, at(30))

	if got := len(f.g.History.Events); got != events {
		t.Errorf("a modifier already at −99 recorded %d more events", got-events)
	}
}

func TestViewExposesModifiers(t *testing.T) {
	f := newViewFixture(t)
	rhino := f.villain()
	f.mustDo(t, hostToken, Action{Kind: ActModifier, Card: rhino, Name: "atk", Delta: -1}, at(1))

	for _, c := range f.g.ViewFor(specToken).Table.Cards {
		if c.ID != rhino {
			continue
		}
		if want := map[string]int{"atk": -1}; !maps.Equal(c.Mods, want) {
			t.Errorf("Rhino mods = %v, want %v", c.Mods, want)
		}
		return
	}
	t.Error("Rhino is not in the view")
}
