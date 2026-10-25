package game

import (
	"maps"
	"testing"
)

func TestAccelerationTokensStack(t *testing.T) {
	table := newTestTable()
	acceleration := func(delta int) Action {
		return Action{Kind: ActToken, Card: "c7", Name: "acc", Delta: delta}
	}

	// Tokens stack as the encounter deck runs out again; back at 0 the entry goes.
	steps := []struct {
		delta int
		want  map[string]int
	}{
		{1, map[string]int{"acc": 1}},
		{1, map[string]int{"acc": 2}},
		{3, map[string]int{"acc": 5}},
		{-1, map[string]int{"acc": 4}},
		{-4, nil},
	}
	for i, step := range steps {
		mustApply(t, table, acceleration(step.delta))

		if got := table.Cards["c7"].Tokens; !maps.Equal(got, step.want) {
			t.Fatalf("step %d (delta %d): tokens = %v, want %v", i, step.delta, got, step.want)
		}
	}
}

func TestAccelerationNarration(t *testing.T) {
	f := newDoFixture(t)
	scheme := f.g.Table.stage(pileKeyScheme).Current
	name := f.nameOf(t, scheme)
	acceleration := func(delta int) Action {
		return Action{Kind: ActToken, Card: scheme, Name: "acc", Delta: delta}
	}

	f.mustDo(t, "h", acceleration(1), at(0))
	if got, want := f.lastLog().Text, "added 1 acceleration token to "+name; got != want {
		t.Errorf("first line = %q, want %q", got, want)
	}
	f.mustDo(t, "h", acceleration(2), at(30))
	if got, want := f.lastLog().Text, "added 2 acceleration tokens to "+name; got != want {
		t.Errorf("line = %q, want %q", got, want)
	}
	f.mustDo(t, "h", acceleration(-1), at(60))
	if got, want := f.lastLog().Text, "removed 1 acceleration token from "+name; got != want {
		t.Errorf("line = %q, want %q", got, want)
	}
	f.mustDo(t, "h", acceleration(1), at(90))
	f.mustDo(t, "h", acceleration(1), at(91))
	if got, want := f.lastLog().Text, "set acceleration tokens on "+name+" to 4"; got != want {
		t.Errorf("merged line = %q, want %q", got, want)
	}
	checkPartsSpellText(t, f.lastLog())
	checkPartRefs(t, f.cat, f.g.Log)
}
