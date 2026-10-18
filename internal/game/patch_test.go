package game

import (
	"maps"
	"reflect"
	"slices"
	"testing"
)

// patchedTables returns a stage table and a copy of it with one change of
// every kind a patch carries.
func patchedTables() (from, to *Table) {
	from = newStageTable()
	to = from.Clone()
	to.Cards["c1"].Exhausted = false               // changed
	delete(to.Cards, "c8")                         // removed
	to.Piles[PileEncounter].Cards = []string{"c9"} // pile changed
	to.Cards["c9"] = &Card{ID: "c9", Owner: NoOwner, Home: PileEncounter, Zone: ZonePile, Pile: PileEncounter}
	to.Hands["p0"] = nil
	to.Hands["p1"] = []string{"c5"}
	to.Stages[0].Current = "c22"
	to.Arrows = []Arrow{{From: "c1", To: "c7", Seat: 0}}
	to.FirstPlayer = Point{Area: "p0", X: 420, Y: 0}
	return from, to
}

func TestDiffTables(t *testing.T) {
	from, to := patchedTables()

	p := diffTables(from, to)

	if got := slices.Sorted(maps.Keys(p.cards)); !slices.Equal(got, []string{"c1", "c9"}) {
		t.Errorf("changed cards = %v, want [c1 c9]", got)
	}
	if !slices.Equal(p.removed, []string{"c8"}) {
		t.Errorf("removed = %v, want [c8]", p.removed)
	}
	if got := slices.Sorted(maps.Keys(p.piles)); !slices.Equal(got, []string{PileEncounter}) {
		t.Errorf("changed piles = %v, want [enc]", got)
	}
	if got := slices.Sorted(maps.Keys(p.hands)); !slices.Equal(got, []Area{"p0", "p1"}) {
		t.Errorf("changed hands = %v, want [p0 p1]", got)
	}
	if !p.stagesChanged || !p.arrowsChanged || !p.firstPlayerChanged {
		t.Errorf("stages, arrows, first player changed = %t %t %t, want all true",
			p.stagesChanged, p.arrowsChanged, p.firstPlayerChanged)
	}
}

func TestDiffOfEqualTablesIsEmpty(t *testing.T) {
	from := newStageTable()
	to := from.Clone()
	to.Views = map[Area]*PrivateView{"p0": {Pile: "deck:p0", Mode: viewModeTop, Cards: []string{"c6"}}}

	p := diffTables(from, to)

	empty := len(p.cards) == 0 && len(p.removed) == 0 && len(p.piles) == 0 && len(p.hands) == 0 &&
		!p.stagesChanged && !p.arrowsChanged && !p.firstPlayerChanged
	if !empty {
		t.Errorf("patch = %+v, want empty (views are not patched)", p)
	}
}

func TestPatchApplyTo(t *testing.T) {
	from, to := patchedTables()
	p := diffTables(from, to)
	other := from.Clone()
	other.Cards["c7"].X = 990                                 // a change of its own
	other.Piles["deck:p0"].Cards = []string{"c6", "c5", "c4"} // another one

	p.applyTo(other)

	for _, id := range []string{"c1", "c9"} {
		if !reflect.DeepEqual(other.Cards[id], to.Cards[id]) {
			t.Errorf("card %s = %+v, want %+v", id, other.Cards[id], to.Cards[id])
		}
	}
	if _, ok := other.Cards["c8"]; ok {
		t.Error("c8 was not removed")
	}
	if got := other.Piles[PileEncounter].Cards; !slices.Equal(got, []string{"c9"}) {
		t.Errorf("encounter deck = %v, want [c9]", got)
	}
	if got := other.Hands["p0"]; len(got) != 0 {
		t.Errorf("p0 hand = %v, want empty", got)
	}
	if got := other.Hands["p1"]; !slices.Equal(got, []string{"c5"}) {
		t.Errorf("p1 hand = %v, want [c5]", got)
	}
	if !reflect.DeepEqual(other.Stages, to.Stages) || !reflect.DeepEqual(other.Arrows, to.Arrows) {
		t.Errorf("stages %+v, arrows %v; want those of the patch", other.Stages[0], other.Arrows)
	}
	if other.FirstPlayer != to.FirstPlayer {
		t.Errorf("first player = %+v, want %+v", other.FirstPlayer, to.FirstPlayer)
	}
	if got := other.Cards["c7"].X; got != 990 {
		t.Errorf("c7 x = %d, want its own 990: the patch does not touch c7", got)
	}
	if got := other.Piles["deck:p0"].Cards; !slices.Equal(got, []string{"c6", "c5", "c4"}) {
		t.Errorf("deck = %v, want its own order: the patch does not touch the deck", got)
	}
}

func TestPatchSharesNothing(t *testing.T) {
	from, to := patchedTables()
	p := diffTables(from, to)
	first, second := from.Clone(), from.Clone()
	p.applyTo(first)
	p.applyTo(second)

	first.Cards["c1"].Tokens["dmg"] = 9
	first.Piles[PileEncounter].Cards[0] = "x"
	first.Stages[0].Cards[0] = "x"
	to.Cards["c9"].X = 500

	if got := second.Cards["c1"].Tokens["dmg"]; got != 2 {
		t.Errorf("second c1 dmg = %d, want 2", got)
	}
	if second.Piles[PileEncounter].Cards[0] != "c9" || second.Stages[0].Cards[0] != "c20" {
		t.Error("two patched tables share a pile or a stage")
	}
	if got := second.Cards["c9"].X; got != 0 {
		t.Errorf("second c9 x = %d, want 0: the patch shares a card with its source", got)
	}
}

func TestRepairPlaces(t *testing.T) {
	table := newTestTable()
	// c4 is listed twice, c5 is listed in a hand while its record says
	// deck:p0, c3 (in hand) is missing from its hand, c9 does not exist, and
	// c7 is on the table but listed in a pile.
	table.Piles["deck:p0"].Cards = []string{"c4", "c6", "c4", "c9"}
	table.Hands["p0"] = []string{"c5"}
	table.Piles[PileEncounterDiscard].Cards = []string{"c7"}
	table.Cards["c1"].Parent = "c8"
	table.Arrows = []Arrow{{From: "c1", To: "c7"}, {From: "c1", To: "c9"}}
	table.Views = map[Area]*PrivateView{"p0": {Pile: "deck:p0", Mode: viewModeSearch, Cards: []string{"c9", "c6"}}}

	repairPlaces(table)

	checkIntegrity(t, table)
	if got := table.Piles["deck:p0"].Cards; !slices.Equal(got, []string{"c4", "c6", "c5"}) {
		t.Errorf("deck = %v, want [c4 c6 c5]: duplicates and strays out, c5 on top", got)
	}
	if got := table.Hands["p0"]; !slices.Equal(got, []string{"c3"}) {
		t.Errorf("hand = %v, want [c3]", got)
	}
	if got := table.Piles[PileEncounterDiscard].Cards; len(got) != 0 {
		t.Errorf("encounter discard = %v, want empty", got)
	}
	if !reflect.DeepEqual(table.Arrows, []Arrow{{From: "c1", To: "c7"}}) {
		t.Errorf("arrows = %v, want only c1 → c7", table.Arrows)
	}
}

func TestRepairPlacesKeepsAWholeTable(t *testing.T) {
	table := newStageTable()
	before := table.Clone()

	repairPlaces(table)

	if !reflect.DeepEqual(before, table) {
		t.Error("repairing a whole table changed it")
	}
}
