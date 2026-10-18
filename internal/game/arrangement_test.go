package game

import (
	"reflect"
	"slices"
	"testing"
)

func TestMergeOrder(t *testing.T) {
	tests := []struct {
		name     string
		live     []string
		restored []string
		want     []string
	}{
		{"same cards", []string{"c3", "c1", "c2"}, []string{"c1", "c2", "c3"}, []string{"c3", "c1", "c2"}},
		{"restored only cards go last", []string{"c2", "c1"}, []string{"c1", "c4", "c2", "c5"}, []string{"c2", "c1", "c4", "c5"}},
		{"live only cards are dropped", []string{"c9", "c2", "c1"}, []string{"c1", "c2"}, []string{"c2", "c1"}},
		{"no live hand", nil, []string{"c1", "c2"}, []string{"c1", "c2"}},
		{"no restored hand", []string{"c1"}, nil, []string{}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := mergeOrder(tt.live, tt.restored); !slices.Equal(got, tt.want) {
				t.Errorf("mergeOrder(%v, %v) = %v, want %v", tt.live, tt.restored, got, tt.want)
			}
		})
	}
}

func TestKeepCardPositions(t *testing.T) {
	restored := newTestTable()
	live := restored.Clone()
	live.Cards["c7"].Area, live.Cards["c7"].X, live.Cards["c7"].Y, live.Cards["c7"].Z = "p0", 900, 40, 30
	live.Cards["c1"].X, live.Cards["c1"].Y = 700, 700

	keepCardPositions(restored, live, []string{"c1"})

	c7 := restored.Cards["c7"]
	if c7.Area != "p0" || c7.X != 900 || c7.Y != 40 || c7.Z != 30 {
		t.Errorf("c7 = %+v, want the live position p0 (900,40) Z 30", c7)
	}
	if c1 := restored.Cards["c1"]; c1.X != 100 || c1.Y != 200 {
		t.Errorf("c1 at (%d,%d), want its restored position (100,200): it is an undone card", c1.X, c1.Y)
	}
}

func TestKeepCardPositionsOnlyForCardsOnBothTables(t *testing.T) {
	restored := newTestTable()
	live := restored.Clone()
	// c7 left the table in the live game; c4 left its pile for the table.
	live.Cards["c7"].Zone, live.Cards["c7"].X = ZonePile, 0
	live.Cards["c4"].Zone, live.Cards["c4"].Area, live.Cards["c4"].X = ZoneTable, "p0", 500

	keepCardPositions(restored, live, nil)

	if c7 := restored.Cards["c7"]; c7.X != 600 || c7.Zone != ZoneTable {
		t.Errorf("c7 = %+v, want its restored table position", c7)
	}
	if c4 := restored.Cards["c4"]; c4.X != 0 || c4.Zone != ZonePile {
		t.Errorf("c4 = %+v, want it in its restored pile", c4)
	}
}

func TestKeepCardPositionsDetachesFromMissingParents(t *testing.T) {
	restored := newTestTable()
	live := restored.Clone()
	// In the live game c8 was revealed and c7 tucked under it.
	live.Cards["c8"].Zone, live.Cards["c8"].Pile = ZoneTable, ""
	live.Cards["c7"].Parent, live.Cards["c7"].X = "c8", 50

	keepCardPositions(restored, live, nil)

	if c7 := restored.Cards["c7"]; c7.Parent != "" || c7.X != 50 {
		t.Errorf("c7 = %+v, want the live position without the parent c8", c7)
	}
	if got := restored.Cards["c2"].Parent; got != "c1" {
		t.Errorf("c2 parent = %q, want c1 (still on the table)", got)
	}
}

func TestKeepCardPositionsBreaksCycles(t *testing.T) {
	restored := newTestTable() // c2 is tucked under c1
	live := restored.Clone()
	// In the live game c2 was detached and c1 tucked under it; c2 is undone,
	// so it gets back its restored parent c1.
	live.Cards["c2"].Parent = ""
	live.Cards["c1"].Parent = "c2"

	keepCardPositions(restored, live, []string{"c2"})

	if got := restored.Cards["c1"].Parent; got != "" {
		t.Errorf("c1 parent = %q, want none: c2 is tucked under c1", got)
	}
	if got := restored.Cards["c2"].Parent; got != "c1" {
		t.Errorf("c2 parent = %q, want c1", got)
	}
}

func TestKeepArrows(t *testing.T) {
	restored := newTestTable()
	restored.Arrows = []Arrow{{From: "c7", To: "c2", Seat: 1}}
	live := restored.Clone()
	live.Cards["c8"].Zone = ZoneTable
	live.Arrows = []Arrow{{From: "c1", To: "c7", Seat: 0}, {From: "c7", To: "c8", Seat: 0}}

	keepArrows(restored, live)

	want := []Arrow{{From: "c1", To: "c7", Seat: 0}}
	if !reflect.DeepEqual(restored.Arrows, want) {
		t.Errorf("arrows = %v, want %v", restored.Arrows, want)
	}
}

func TestKeepPileOrders(t *testing.T) {
	tests := []struct {
		name      string
		live      []string
		reordered []string
		want      []string
	}{
		{"reordered, same cards", []string{"c6", "c4", "c5"}, []string{"deck:p0"}, []string{"c6", "c4", "c5"}},
		{"reordered, other cards", []string{"c5", "c4"}, []string{"deck:p0"}, []string{"c4", "c5", "c6"}},
		{"not reordered", []string{"c6", "c4", "c5"}, nil, []string{"c4", "c5", "c6"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			restored := newTestTable()
			live := restored.Clone()
			live.Piles["deck:p0"].Cards = tt.live

			keepPileOrders(restored, live, tt.reordered)

			if got := restored.Piles["deck:p0"].Cards; !slices.Equal(got, tt.want) {
				t.Errorf("deck = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestKeepLiveArrangement(t *testing.T) {
	restored := newTestTable()
	restored.Hands["p0"] = []string{"c3", "c4"}
	live := restored.Clone()
	live.Hands["p0"] = []string{"c4", "c3"}
	live.FirstPlayer = Point{Area: "p0", X: 600, Y: 10}
	live.NextZ = 40
	live.Cards["c7"].X = 990

	keepLiveArrangement(restored, live, &UndoEntry{})

	if got := restored.Hands["p0"]; !slices.Equal(got, []string{"c4", "c3"}) {
		t.Errorf("hand = %v, want the live order [c4 c3]", got)
	}
	if restored.FirstPlayer != live.FirstPlayer {
		t.Errorf("first player = %+v, want %+v", restored.FirstPlayer, live.FirstPlayer)
	}
	if restored.NextZ != 40 {
		t.Errorf("NextZ = %d, want 40, above every kept Z", restored.NextZ)
	}
	if got := restored.Cards["c7"].X; got != 990 {
		t.Errorf("c7 x = %d, want the live 990", got)
	}
}
