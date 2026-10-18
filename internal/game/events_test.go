package game

import (
	"reflect"
	"slices"
	"testing"
)

func TestRecordNumbersEventsAndKeepsTheLastSnapshots(t *testing.T) {
	live := newTestTable()
	live.Views = map[Area]*PrivateView{"p0": {Pile: "deck:p0", Mode: viewModeTop, Cards: []string{"c6"}}}
	h := newHistory(testSeed, live, testNow)

	for range 6 * snapshotEvery {
		h.record(Event{Action: Action{Kind: ActExhaust, Card: "c1"}, Log: -1}, live)
	}

	for i, e := range h.Events {
		if e.Seq != i+1 {
			t.Fatalf("event %d has number %d, want %d", i, e.Seq, i+1)
		}
	}
	var covered []int
	for _, s := range h.Snapshots {
		covered = append(covered, s.Event)
		if s.Table.Views != nil {
			t.Errorf("snapshot %d holds open views", s.Event)
		}
	}
	if want := []int{20, 30, 40, 50, 60}; !slices.Equal(covered, want) {
		t.Errorf("snapshots cover %v events, want %v", covered, want)
	}
	if h.Initial.Views != nil {
		t.Error("the initial table holds open views")
	}
}

// historyWithSnapshots returns a history of n damage tokens added to c1, with
// a snapshot every snapshotEvery events; its live table is returned too.
func historyWithSnapshots(n int) (*History, *Table) {
	live := newTestTable() // c1 has 2 damage
	h := newHistory(testSeed, live, testNow)
	for range n {
		a := Action{Kind: ActToken, Card: "c1", Name: "dmg", Delta: 1}
		_ = apply(live, a)
		h.record(Event{Action: a, Tracked: true, Log: -1}, live)
	}
	return h, live
}

func TestRestorePoint(t *testing.T) {
	h, _ := historyWithSnapshots(25) // snapshots after 10 and 20 events
	tests := []struct {
		from, want int
	}{
		{from: 0, want: 0},
		{from: 9, want: 0},
		{from: 10, want: 10},
		{from: 19, want: 10},
		{from: 24, want: 20},
	}
	for _, tt := range tests {
		got, table := h.restorePoint(tt.from)
		if got != tt.want {
			t.Errorf("restorePoint(%d) = %d, want %d", tt.from, got, tt.want)
		}
		table.Cards["c1"].X = 999
	}
	if h.Initial.Cards["c1"].X == 999 || h.Snapshots[0].Table.Cards["c1"].X == 999 {
		t.Error("restorePoint returned a stored table instead of a copy")
	}
}

func TestRefreshSnapshot(t *testing.T) {
	snapshots := []Snapshot{{Event: 10, Table: newTestTable()}, {Event: 20, Table: newTestTable()}}
	table := newTestTable()
	table.Cards["c1"].X = 500
	table.Views = map[Area]*PrivateView{"p0": {Pile: "deck:p0"}}

	refreshSnapshot(snapshots, 20, table)
	refreshSnapshot(snapshots, 15, table)

	if got := snapshots[1].Table.Cards["c1"].X; got != 500 {
		t.Errorf("snapshot 20 has c1 at x %d, want the refreshed 500", got)
	}
	if snapshots[1].Table.Views != nil || snapshots[1].Table == table {
		t.Error("the refreshed snapshot holds views or shares the table")
	}
	if got := snapshots[0].Table.Cards["c1"].X; got != 100 {
		t.Errorf("snapshot 10 has c1 at x %d, want it untouched", got)
	}
}

func TestReplayEvent(t *testing.T) {
	t.Run("applies a live event", func(t *testing.T) {
		table := newTestTable()
		e := Event{Action: Action{Kind: ActExhaust, Card: "c1", Exhausted: new(false)}}
		replayEvent(table, &e, newTestRNG())
		if table.Cards["c1"].Exhausted || e.Dropped {
			t.Errorf("c1 exhausted = %t, dropped = %t; want the exhaust applied", table.Cards["c1"].Exhausted, e.Dropped)
		}
	})
	t.Run("skips undone and view-only events", func(t *testing.T) {
		table := newTestTable()
		before := table.Clone()
		for _, e := range []Event{
			{Action: Action{Kind: ActExhaust, Card: "c1"}, Undone: true},
			{Action: Action{Kind: ActExhaust, Card: "c1"}, Dropped: true},
			{Action: Action{Kind: ActUndo}},
			{Action: Action{Kind: ActSearch, Pile: "deck:p0"}},
		} {
			replayEvent(table, &e, newTestRNG())
		}
		if !reflect.DeepEqual(table, before) {
			t.Error("the table changed")
		}
	})
	t.Run("drops what fails", func(t *testing.T) {
		table := newTestTable()
		e := Event{Action: Action{Kind: ActExhaust, Card: "c4", Exhausted: new(true)}} // c4 lies in the deck
		replayEvent(table, &e, newTestRNG())
		if !e.Dropped {
			t.Error("the event is not dropped")
		}
	})
	t.Run("resolves a shuffle again when it no longer fits", func(t *testing.T) {
		table := newTestTable()
		// The renames miss c6, which the deck holds.
		renames := map[string]string{"c4": "x4", "c5": "x5"}
		stale := Action{Kind: ActShuffle, Pile: "deck:p0", Cards: []string{"x5", "x4"}, Renames: renames}
		e := Event{Seat: 0, Action: stale}

		replayEvent(table, &e, newTestRNG())

		if e.Dropped || len(e.Action.Renames) != 3 {
			t.Fatalf("event = %+v, want a fresh shuffle of the three deck cards", e)
		}
		if got := table.Piles["deck:p0"].Cards; !slices.Equal(got, e.Action.Cards) {
			t.Errorf("deck = %v, want the fresh order %v", got, e.Action.Cards)
		}
		checkIntegrity(t, table)
	})
}

func TestUndoableBursts(t *testing.T) {
	h := newHistory(testSeed, newTestTable(), testNow)
	add := func(e Event) {
		e.Log = -1
		h.Events = append(h.Events, e)
	}
	exhaust := Action{Kind: ActExhaust, Card: "c1"}
	add(Event{Seat: 0, Action: exhaust, Tracked: true})                                      // 0
	add(Event{Seat: 0, Action: Action{Kind: ActToken, Card: "c1"}, Tracked: true, Burst: 1}) // 1
	add(Event{Seat: 1, Action: exhaust, Tracked: true})                                      // 2: another seat
	add(Event{Seat: 0, Action: Action{Kind: ActMove, Card: "c1"}})                           // 3: untracked
	add(Event{Seat: 0, Action: Action{Kind: ActToken, Card: "c1"}, Tracked: true, Burst: 1}) // 4
	add(Event{Seat: 0, Action: Action{Kind: ActShuffle, Pile: "deck:p0"}, Tracked: true})    // 5: shuffle
	add(Event{Seat: 0, Action: exhaust, Tracked: true, Undone: true})                        // 6: undone

	got := h.undoableBursts(0)
	if want := [][]int{{1, 4}, {0}}; !reflect.DeepEqual(got, want) {
		t.Errorf("undoableBursts(0) = %v, want %v", got, want)
	}
	if got := h.lastUndoable(1); !slices.Equal(got, []int{2}) {
		t.Errorf("lastUndoable(1) = %v, want [2]", got)
	}
	if got := h.lastUndoable(2); got != nil {
		t.Errorf("lastUndoable(2) = %v, want nil", got)
	}
}

// TestUndoableBurstsCountUndoneOnes makes sure that undoing never reaches
// further back than maxUndoDepth bursts.
func TestUndoableBurstsCountUndoneOnes(t *testing.T) {
	h := newHistory(testSeed, newTestTable(), testNow)
	for i := range maxUndoDepth + 2 {
		undone := i >= 2 // the newest bursts are undone
		h.Events = append(h.Events, Event{Action: Action{Kind: ActExhaust, Card: "c1"}, Tracked: true, Undone: undone})
	}
	if got := h.undoableBursts(0); len(got) != 0 {
		t.Errorf("undoableBursts = %v, want none: the two live bursts are too old", got)
	}
}

func TestRebuildLeavesTheHistoryAlone(t *testing.T) {
	h, _ := historyWithSnapshots(25)
	before := mustJSON(t, h)
	events := slices.Clone(h.Events)
	events[12].Undone = true

	table, rebuilt, snapshots := h.rebuild(events, 12, newTestRNG())

	if mustJSON(t, h) != before {
		t.Error("rebuild changed the history")
	}
	if !rebuilt[12].Undone || len(snapshots) != len(h.Snapshots) {
		t.Errorf("rebuild returned events %d undone = %t and %d snapshots", 12, rebuilt[12].Undone, len(snapshots))
	}
	// c1 starts with 2 damage, and one of the 25 tokens is undone.
	if live, at20 := table.Cards["c1"].Tokens["dmg"], snapshots[1].Table.Cards["c1"].Tokens["dmg"]; live != 26 || at20 != 21 {
		t.Errorf("c1 has %d damage live and %d after 20 events, want 26 and 21", live, at20)
	}
}

func TestKeptViews(t *testing.T) {
	table := newTestTable()
	views := map[Area]*PrivateView{"p0": {Pile: "deck:p0", Mode: viewModeSearch, Cards: []string{"c6", "gone", "c4"}}}

	kept := keptViews(views, table)

	if got := kept["p0"].Cards; !slices.Equal(got, []string{"c6", "c4"}) {
		t.Errorf("kept view = %v, want [c6 c4]", got)
	}
	if len(views["p0"].Cards) != 3 {
		t.Error("keptViews changed the views it was given")
	}
}

// TestUndoableBurstsSkipCancelledFlips checks that a burst cancelled by
// flipping back, which changed nothing, takes no room in the undo window.
func TestUndoableBurstsSkipCancelledFlips(t *testing.T) {
	h := newHistory(testSeed, newTestTable(), testNow)
	h.Events = append(h.Events, Event{Action: Action{Kind: ActExhaust, Card: "c1"}, Tracked: true, Log: 1})
	for i := range maxUndoDepth {
		flip := Action{Kind: ActFlip, Card: "c1"}
		h.Events = append(h.Events,
			Event{Action: flip, Tracked: true, Burst: i + 1, Undone: true, Log: -1},
			Event{Action: flip, Tracked: true, Burst: i + 1, Undone: true, Log: -1})
	}

	if got := h.lastUndoable(0); !slices.Equal(got, []int{0}) {
		t.Errorf("lastUndoable = %v, want the exhaust [0] behind the cancelled flips", got)
	}
}
