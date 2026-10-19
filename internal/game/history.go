package game

import (
	"fmt"
	"math/rand/v2"
	"reflect"
	"slices"
	"time"

	"github.com/alexandreroman/intothefray/internal/pack"
)

// Action kinds that only Do handles: they act on a player's private view or
// on the history, not on the shared table, so resolve and apply ignore them.
const (
	ActLook      Kind = "look"
	ActSearch    Kind = "search"
	ActCloseView Kind = "closeView"
	ActUndo      Kind = "undo"
)

// notReplayedKinds are recorded like every other action, so that a replay
// reproduces the game, but a rebuild skips them: looks, searches and closes
// only touch a player's private view, and an undo's effect is the undone
// flags it sets on other events.
var notReplayedKinds = map[Kind]bool{
	ActLook:      true,
	ActSearch:    true,
	ActCloseView: true,
	ActUndo:      true,
}

// Modes of a PrivateView.
const (
	viewModeTop    = "top"
	viewModeSearch = "search"
)

const (
	// mergeWindow is how close two changes of one thing must be to share a
	// history line.
	mergeWindow = 15 * time.Second
	// maxUndoDepth is the number of bursts a player can undo in a row.
	maxUndoDepth = 10
)

// Do performs one action for the player holding token, credited to seat, one
// of the player's own seats; a negative seat stands for their home seat. It
// changes the table, writes the history line and records the event under the
// credited seat. An error leaves the game unchanged.
func (g *Game) Do(token string, seat int, a Action, cat *pack.Catalog, now time.Time) error {
	player := g.player(token)
	if player == nil {
		return forbidden("only players can act")
	}
	if g.Phase != PhasePlaying || g.Table == nil || g.History == nil {
		return fmt.Errorf("%w: the game is not being played", ErrPhase)
	}
	index := slices.Index(g.Players, player)
	if seat < 0 {
		seat = g.homeSeat(index)
	}
	// A player without any seat, only found in games stored before deck
	// slots, has no seat to act from.
	if seat < 0 || g.seatPlayer(seat) != index {
		return forbidden("seat %d is not yours", seat)
	}
	return g.do(g.actorOf(seat), a, cat, now)
}

// do performs a for who. Its randomness is the stream of the first event it
// records, so that a replay draws the same.
func (g *Game) do(who actor, a Action, cat *pack.Catalog, now time.Time) error {
	rng := g.History.rngFor(g.History.LastSeq + 1)
	switch a.Kind {
	case ActUndo:
		return g.undo(who, rng, now)
	case ActLook, ActSearch:
		return g.openView(who, a, now)
	case ActCloseView:
		return g.closeView(who, a, cat, rng, now)
	default:
		return g.perform(who, a, cat, rng, now)
	}
}

// perform resolves, applies and records a table action. Actions fall in three
// groups:
//   - undoable: a tracked event with a history line;
//   - shuffles: a tracked event with a history line, never undoable, since
//     undoing one would bring back an order a player may have seen;
//   - arranging the table (see arrangingKinds): an untracked event, no line.
func (g *Game) perform(who actor, a Action, cat *pack.Catalog, rng *rand.Rand, now time.Time) error {
	resolved, err := resolve(g, who, a, rng)
	if err != nil {
		return err
	}
	before := g.Table.Clone()
	// apply is all-or-nothing, so an error leaves the table untouched.
	if err := apply(g.Table, resolved); err != nil {
		return err
	}
	if changedNothing(before, g.Table, resolved) {
		return nil
	}

	n := narrator{game: g, cat: cat, who: who, before: before, after: g.Table}
	line, logged := n.describe(resolved)
	if !logged {
		g.recordArranging(who.seat, resolved, rng, now)
		return nil
	}
	if burst := g.mergeTarget(who, resolved, now); burst != nil {
		g.merge(who.seat, burst, resolved, line, rng, now)
		return nil
	}
	g.appendLog(who.seat, line.text, line.cards, now)
	g.History.record(Event{Seat: who.seat, Action: resolved, Tracked: true, Log: len(g.Log) - 1, At: now}, g.Table)
	return nil
}

// changedNothing reports whether a left its card as it was: a counter already
// at 0, a flip of a single-faced card, or the stage face already shown. Such
// actions are not recorded.
func changedNothing(before, after *Table, a Action) bool {
	switch a.Kind {
	case ActToken, ActStatus, ActFlip, ActChooseStage:
		return reflect.DeepEqual(before.Cards[a.Card], after.Cards[a.Card])
	default:
		return false
	}
}

// recordArranging records an arranging action, which a has already applied
// to the live table. Dragging a card around makes many moves: a move that
// follows the same player's move of the same card replaces it, which keeps
// the history short.
func (g *Game) recordArranging(seat int, a Action, rng *rand.Rand, now time.Time) {
	h := g.History
	e := Event{Seat: seat, Action: a, Log: -1, At: now}
	last := len(h.Events) - 1
	if last < 0 || !replacesMove(h.Events[last], e) {
		h.record(e, g.Table)
		return
	}

	h.LastSeq++
	e.Seq = h.LastSeq
	events := slices.Clone(h.Events)
	events[last] = e
	// The live table holds both moves; rebuilding it with the last one only
	// keeps it equal to its events, Z order included.
	g.install(h.rebuild(events, last, g.actorOf, rng))
}

// replacesMove reports whether next replaces prev: both are moves of the same
// card by the same player, and prev is still live.
func replacesMove(prev, next Event) bool {
	return prev.Action.Kind == ActMove && next.Action.Kind == ActMove &&
		prev.Seat == next.Seat && prev.Action.Card == next.Action.Card &&
		!prev.Tracked && prev.live()
}

// mergeTarget returns the event indices of the burst that a extends, or nil.
// The burst must be the player's last undoable one, among all their seats,
// with the same merge key, still own the last history line, and have changed
// less than mergeWindow ago.
func (g *Game) mergeTarget(who actor, a Action, now time.Time) []int {
	key := mergeKey(a)
	burst := g.History.lastUndoable(who.seats...)
	if key == "" || burst == nil {
		return nil
	}
	latest := g.History.Events[burst[len(burst)-1]]
	lastLine := len(g.Log) - 1
	if mergeKey(latest.Action) != key || latest.Log != lastLine || g.Log[lastLine].Undone {
		return nil
	}
	if now.Sub(latest.At) >= mergeWindow {
		return nil
	}
	return burst
}

// merge records a, already applied, as part of burst and folds its line into
// the last history line. Flipping a card back to the side it showed before
// the burst cancels the whole burst instead.
func (g *Game) merge(seat int, burst []int, a Action, line logLine, rng *rand.Rand, now time.Time) {
	h := g.History
	id := h.Events[burst[0]].Burst
	if id == 0 {
		id = h.newBurst()
		h.Events[burst[0]].Burst = id
	}
	lastLine := len(g.Log) - 1
	h.record(Event{Seat: seat, Action: a, Tracked: true, Burst: id, Log: lastLine, At: now}, g.Table)

	if a.Kind == ActFlip && g.cancelFlipBurst(append(burst, len(h.Events)-1), a.Card, rng) {
		g.Log = g.Log[:lastLine]
		return
	}
	g.Log[lastLine].Text = line.mergedText()
	g.Log[lastLine].Cards = line.cards
	g.Log[lastLine].At = now
}

// cancelFlipBurst undoes a burst of flips of card, the last one included,
// when the card now shows the side it showed before the burst. It reports
// whether it did. The burst then has no history line any more.
func (g *Game) cancelFlipBurst(burst []int, card string, rng *rand.Rand) bool {
	events := slices.Clone(g.History.Events)
	for _, i := range burst {
		events[i].Undone = true
		events[i].Log = -1
	}
	table, events, snapshots := g.History.rebuild(events, burst[0], g.actorOf, rng)
	if !sameSide(table, g.Table, card) {
		return false
	}
	g.install(table, events, snapshots)
	return true
}

// sameSide reports whether card id shows the same side in both tables.
func sameSide(a, b *Table, id string) bool {
	ca, okA := a.Cards[id]
	cb, okB := b.Cards[id]
	return okA && okB && ca.Face == cb.Face && ca.FaceDown == cb.FaceDown
}

// install makes a rebuilt table live, with the events and snapshots of the
// same rebuild. Open views are each player's own business, not part of the
// history: they are carried over, minus the cards that no longer exist.
func (g *Game) install(table *Table, events []Event, snapshots []Snapshot) {
	table.Views = keptViews(g.Table.Views, table)
	g.Table = table
	g.History.Events = events
	g.History.Snapshots = snapshots
	g.strikeDeadLines()
}

// strikeDeadLines marks undone every history line whose events are all undone
// or dropped: what they tell no longer shows on the table.
func (g *Game) strikeDeadLines() {
	alive := map[int]bool{}
	for _, e := range g.History.Events {
		if e.Log >= 0 {
			alive[e.Log] = alive[e.Log] || e.live()
		}
	}
	for line, isAlive := range alive {
		if !isAlive {
			g.Log[line].Undone = true
		}
	}
}

// appendLog writes a history line by the player who holds seat.
func (g *Game) appendLog(seat int, text string, cards []string, now time.Time) {
	p := g.Players[g.seatPlayer(seat)]
	g.Log = append(g.Log, LogEntry{Who: p.Name, Color: p.Color, Text: text, At: now, Cards: cards})
}

// undo takes back the player's last undoable burst, whichever of their seats
// it is credited to: the burst is marked undone and the live table is rebuilt
// without it, every later event of every player re-applied. rng re-resolves
// the shuffles the rebuild changes.
func (g *Game) undo(who actor, rng *rand.Rand, now time.Time) error {
	h := g.History
	burst := h.lastUndoable(who.seats...)
	if burst == nil {
		return invalid("nothing to undo")
	}
	events := slices.Clone(h.Events)
	for _, i := range burst {
		events[i].Undone = true
	}
	// Installing strikes the burst's line, and those of the events dropped.
	g.install(h.rebuild(events, burst[0], g.actorOf, rng))

	original := g.Log[h.Events[burst[0]].Log]
	g.appendLog(who.seat, "undid “"+original.Text+"”", nil, now)
	h.record(Event{Seat: who.seat, Action: Action{Kind: ActUndo}, Log: len(g.Log) - 1, At: now}, g.Table)
	return nil
}

// openView opens a Look or a Search on a pile for the player. A player has
// one private view, kept in the area of their home seat. It is logged but
// cannot be undone.
func (g *Game) openView(who actor, a Action, now time.Time) error {
	pile, err := g.Table.pile(a.Pile)
	if err != nil {
		return err
	}
	// Decks are private to their owner; every other pile is either the
	// shared encounter deck or face up, so anyone may look through it.
	if pile.Kind == KindDeck && !who.owns(pile.Owner) {
		return forbidden("pile %q belongs to another player", pile.ID)
	}
	if len(pile.Cards) == 0 {
		return invalid("pile %q is empty", pile.ID)
	}

	view := &PrivateView{Pile: pile.ID}
	var text string
	if a.Kind == ActLook {
		if err := checkCount(a.N); err != nil {
			return err
		}
		n := min(a.N, len(pile.Cards))
		view.Mode = viewModeTop
		view.Cards = topCards(pile, n)
		text = fmt.Sprintf("is looking at %s of %s", topCount(n), g.pileName(who, pile.ID))
	} else {
		view.Mode = viewModeSearch
		view.Cards = topCards(pile, len(pile.Cards))
		text = "is searching " + g.pileName(who, pile.ID)
	}

	if g.Table.Views == nil {
		g.Table.Views = map[Area]*PrivateView{}
	}
	g.Table.Views[who.homeArea()] = view
	g.appendLog(who.seat, text, nil, now)
	recorded := Action{Kind: a.Kind, Pile: a.Pile, N: a.N}
	g.History.record(Event{Seat: who.seat, Action: recorded, Log: len(g.Log) - 1, At: now}, g.Table)
	return nil
}

// closeView closes the player's open view. Closing with a shuffle shuffles the
// viewed pile, as a regular shuffle action: it is recorded as that shuffle,
// then a plain close.
func (g *Game) closeView(who actor, a Action, cat *pack.Catalog, rng *rand.Rand, now time.Time) error {
	area := who.homeArea()
	view := g.Table.Views[area]
	if view == nil {
		return invalid("no view is open")
	}
	switch a.Where {
	case "":
	case whereShuffle:
		if err := g.perform(who, Action{Kind: ActShuffle, Pile: view.Pile}, cat, rng, now); err != nil {
			return err
		}
	default:
		return invalid("unknown way to close a view %q", a.Where)
	}
	delete(g.Table.Views, area)
	g.History.record(Event{Seat: who.seat, Action: Action{Kind: ActCloseView}, Log: -1, At: now}, g.Table)
	return nil
}
