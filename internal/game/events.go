package game

import (
	"math/rand/v2"
	"slices"
	"time"
)

// The history is event-sourced: the live table always equals the initial
// table plus every event that is neither undone nor dropped, applied in
// order. Undo marks a burst undone and rebuilds the live table from there, so
// the other players' later changes are kept without patching anything.

const (
	// snapshotEvery is how many recorded events separate two snapshots.
	snapshotEvery = 10
	// maxSnapshots is the number of snapshots kept; older ones are dropped,
	// since a rebuild can always start from the initial table.
	maxSnapshots = 5
)

// Event is one recorded action.
type Event struct {
	// Seq numbers the events from 1 in recording order; a number is never
	// given twice. The randomness of an event comes from its own stream (see
	// History.rngFor).
	Seq    int    `json:"seq"`
	Seat   int    `json:"seat"`
	Action Action `json:"action"` // fully resolved
	// Tracked events have a history line of their own and, unless they
	// shuffle, can be undone.
	Tracked bool `json:"tracked,omitempty"`
	// Burst is shared by the events merged into one history line (token,
	// status and flip bursts); 0 for an event that was never merged.
	Burst   int       `json:"burst,omitempty"`
	Log     int       `json:"log"` // index in Game.Log, -1 when none
	Undone  bool      `json:"undone,omitempty"`
	Dropped bool      `json:"dropped,omitempty"` // could not be re-applied after an undo
	At      time.Time `json:"at"`
}

// live reports whether e is part of the live table.
func (e Event) live() bool {
	return !e.Undone && !e.Dropped
}

// cancelled reports whether e belongs to a burst cancelled by flipping back:
// it is undone and has lost its history line (see Game.cancelFlipBurst).
func (e Event) cancelled() bool {
	return e.Tracked && e.Undone && e.Log < 0
}

// Snapshot is the table after the first Event events, without open views.
type Snapshot struct {
	Event int    `json:"event"`
	Table *Table `json:"table"`
}

// History is everything needed to rebuild the live table and to replay the
// game from its setup (see Replay).
type History struct {
	Seed      uint64     `json:"seed"`
	StartedAt time.Time  `json:"startedAt"`
	Initial   *Table     `json:"initial"` // the table right after setup
	Events    []Event    `json:"events"`
	Snapshots []Snapshot `json:"snapshots,omitempty"` // oldest first
	LastSeq   int        `json:"lastSeq"`
	NextBurst int        `json:"nextBurst"`
}

func newHistory(seed uint64, initial *Table, now time.Time) *History {
	return &History{Seed: seed, StartedAt: now, Initial: withoutViews(initial), Events: []Event{}, NextBurst: 1}
}

// setupRNG returns the random stream of the setup.
func setupRNG(seed uint64) *rand.Rand {
	return rand.New(rand.NewPCG(seed, 0)) //nolint:gosec // game randomness, not security
}

// rngFor returns the random stream of the event numbered seq. Every source of
// randomness derives from the seed, so a game can be replayed exactly.
func (h *History) rngFor(seq int) *rand.Rand {
	return rand.New(rand.NewPCG(h.Seed, uint64(seq))) //nolint:gosec // game randomness, not security
}

// newBurst returns an unused burst id.
func (h *History) newBurst() int {
	id := h.NextBurst
	h.NextBurst++
	return id
}

// record appends e with the next sequence number, and snapshots live, the
// table with e applied, every snapshotEvery events.
func (h *History) record(e Event, live *Table) {
	h.LastSeq++
	e.Seq = h.LastSeq
	h.Events = append(h.Events, e)
	if len(h.Events)%snapshotEvery != 0 {
		return
	}
	h.Snapshots = append(h.Snapshots, Snapshot{Event: len(h.Events), Table: withoutViews(live)})
	if extra := len(h.Snapshots) - maxSnapshots; extra > 0 {
		h.Snapshots = slices.Delete(h.Snapshots, 0, extra)
	}
}

// withoutViews returns a copy of t without its open views, which belong to
// each player and are not part of the history.
func withoutViews(t *Table) *Table {
	clone := t.Clone()
	clone.Views = nil
	return clone
}

// undoableBursts returns the bursts a player holding seats can undo, newest
// first; each is the ascending list of its event indices. They are taken
// among the last maxUndoDepth tracked bursts credited to any of the seats, undone ones included so that undoing never
// reaches further back. Shuffles never count (P2-R17): undoing one would bring
// back an order a player may have seen. Nor do bursts cancelled by flipping
// back, which changed nothing.
func (h *History) undoableBursts(seats ...int) [][]int {
	var bursts [][]int
	for i := len(h.Events) - 1; i >= 0; i-- {
		e := h.Events[i]
		if !slices.Contains(seats, e.Seat) || !e.Tracked || producesShuffle(e.Action) || e.cancelled() {
			continue
		}
		if n := len(bursts); n > 0 && e.Burst > 0 && h.Events[bursts[n-1][0]].Burst == e.Burst {
			bursts[n-1] = slices.Insert(bursts[n-1], 0, i)
			continue
		}
		if len(bursts) == maxUndoDepth {
			break
		}
		bursts = append(bursts, []int{i})
	}
	return slices.DeleteFunc(bursts, func(burst []int) bool {
		return !slices.ContainsFunc(burst, func(i int) bool { return h.Events[i].live() })
	})
}

// lastUndoable returns the event indices of the burst a player holding seats
// would undo, or nil.
func (h *History) lastUndoable(seats ...int) []int {
	if bursts := h.undoableBursts(seats...); len(bursts) > 0 {
		return bursts[0]
	}
	return nil
}

// rebuild replays events from event index from onwards, starting from the
// latest snapshot that covers none of them, and returns the rebuilt table,
// events and snapshots. Snapshots after the starting point are recomputed. h
// and events are left untouched: the caller installs the result, so that a
// rebuild is atomic. rng re-resolves the shuffles that no longer fit, each one
// on behalf of the actor actorOf returns for the event's seat.
func (h *History) rebuild(
	events []Event, from int, actorOf func(seat int) actor, rng *rand.Rand,
) (*Table, []Event, []Snapshot) {
	events = slices.Clone(events)
	snapshots := slices.Clone(h.Snapshots)
	start, table := h.restorePoint(from)
	for i := start; i < len(events); i++ {
		replayEvent(table, &events[i], actorOf, rng)
		refreshSnapshot(snapshots, i+1, table)
	}
	return table, events, snapshots
}

// restorePoint returns the latest snapshot that covers no event from index
// from onwards, as the number of events it covers and a copy of its table;
// the initial table when there is none.
func (h *History) restorePoint(from int) (int, *Table) {
	for _, s := range slices.Backward(h.Snapshots) {
		if s.Event <= from {
			return s.Event, s.Table.Clone()
		}
	}
	return 0, h.Initial.Clone()
}

// refreshSnapshot sets the snapshot covering n events, if any, to a copy of
// table.
func refreshSnapshot(snapshots []Snapshot, n int, table *Table) {
	for i := range snapshots {
		if snapshots[i].Event == n {
			snapshots[i].Table = withoutViews(table)
		}
	}
}

// replayEvent re-applies e to t during a rebuild. A shuffle whose recorded
// outcome no longer fits t (its pile changed) is resolved again with rng, on
// behalf of the actor actorOf returns for e's seat, and e keeps the new outcome
// so that later rebuilds stay stable. Any other event that fails is marked
// Dropped.
func replayEvent(t *Table, e *Event, actorOf func(seat int) actor, rng *rand.Rand) {
	if !e.live() || notReplayedKinds[e.Action.Kind] {
		return
	}
	if apply(t, e.Action) == nil {
		return
	}
	if producesShuffle(e.Action) {
		fresh, err := resolveOnTable(t, actorOf(e.Seat), e.Action, rng)
		if err == nil && apply(t, fresh) == nil {
			e.Action = fresh
			return
		}
	}
	e.Dropped = true
}

// producesShuffle reports whether a gives a pile a new random order.
func producesShuffle(a Action) bool {
	switch a.Kind {
	case ActShuffle, ActShuffleBack, ActShuffleIn:
		return true
	case ActToDeck:
		return a.Where == whereShuffle
	default:
		return false
	}
}

// keptViews returns a copy of views without the cards t no longer holds.
func keptViews(views map[Area]*PrivateView, t *Table) map[Area]*PrivateView {
	kept := cloneMapOfPtrs(views, (*PrivateView).clone)
	for _, view := range kept {
		view.Cards = slices.DeleteFunc(view.Cards, func(id string) bool {
			_, ok := t.Cards[id]
			return !ok
		})
	}
	return kept
}
