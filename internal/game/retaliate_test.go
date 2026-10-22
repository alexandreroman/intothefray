package game

import (
	"maps"
	"testing"
)

func TestRetaliateCountsItsValue(t *testing.T) {
	table := newTestTable()
	retaliate := func(delta int) Action {
		return Action{Kind: ActStatus, Card: "c7", Name: "retaliate", Delta: delta}
	}

	// Several sources of Retaliate add up; the value never goes below 0.
	steps := []struct {
		delta int
		want  map[string]int
	}{
		{1, map[string]int{"retaliate": 1}},
		{2, map[string]int{"retaliate": 3}},
		{-1, map[string]int{"retaliate": 2}},
		{-5, nil},
	}
	for i, step := range steps {
		mustApply(t, table, retaliate(step.delta))

		if got := table.Cards["c7"].Status; !maps.Equal(got, step.want) {
			t.Fatalf("step %d (delta %d): status = %v, want %v", i, step.delta, got, step.want)
		}
	}
}

func TestRetaliateClearedWhenTheCardLeavesTheTable(t *testing.T) {
	table := newTestTable()
	mustApply(t, table, Action{Kind: ActStatus, Card: "c1", Name: "retaliate", Delta: 2})

	mustApply(t, table, Action{Kind: ActDiscard, Card: "c1"})

	if got := table.Cards["c1"].Status; got != nil {
		t.Errorf("status = %v, want none once discarded", got)
	}
}

func TestRetaliateNarration(t *testing.T) {
	f := newDoFixture(t)
	rhino := f.villain()
	retaliate := func(delta int) Action {
		return Action{Kind: ActStatus, Card: rhino, Name: "retaliate", Delta: delta}
	}

	f.mustDo(t, "h", retaliate(1), at(0))
	if got, want := f.lastLog().Text, "added 1 retaliate to Rhino"; got != want {
		t.Errorf("first line = %q, want %q", got, want)
	}
	f.mustDo(t, "h", retaliate(-1), at(30))
	if got, want := f.lastLog().Text, "removed 1 retaliate from Rhino"; got != want {
		t.Errorf("line = %q, want %q", got, want)
	}
	f.mustDo(t, "h", retaliate(1), at(60))
	f.mustDo(t, "h", retaliate(1), at(61))
	if got, want := f.lastLog().Text, "set retaliate on Rhino to 2"; got != want {
		t.Errorf("merged line = %q, want %q", got, want)
	}
	checkPartsSpellText(t, f.lastLog())
	checkPartRefs(t, f.cat, f.g.Log)
}
