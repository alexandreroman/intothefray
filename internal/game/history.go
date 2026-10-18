package game

import (
	"fmt"
	"maps"
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

// Modes of a PrivateView.
const (
	viewModeTop    = "top"
	viewModeSearch = "search"
)

const (
	// mergeWindow is how close two changes of one thing must be to share a
	// history line.
	mergeWindow = 15 * time.Second
	// maxUndoDepth is the number of undo entries kept per player. Each entry
	// holds a whole table, so this bounds the size of a stored game.
	maxUndoDepth = 10
)

// Do performs one action for the player holding token: it changes the table,
// writes the history line and keeps every player's undo stack up to date. An
// error leaves the game unchanged.
func (g *Game) Do(token string, a Action, cat *pack.Catalog, rng *rand.Rand, now time.Time) error {
	player := g.player(token)
	if player == nil {
		return forbidden("only players can act")
	}
	if g.Phase != PhasePlaying || g.Table == nil {
		return fmt.Errorf("%w: the game is not being played", ErrPhase)
	}
	seat := slices.Index(g.Players, player)

	var err error
	switch a.Kind {
	case ActUndo:
		err = g.undo(player, rng, now)
	case ActLook, ActSearch:
		err = g.openView(player, seat, a, now)
	case ActCloseView:
		err = g.closeView(player, seat, a, cat, rng, now)
	default:
		err = g.perform(player, seat, a, cat, rng, now)
	}
	return err
}

// perform resolves and applies a table action, replays it onto the undo
// snapshots and records it. Actions fall in three groups:
//   - undoable: a history line and an undo entry;
//   - shuffles: a history line only, since undoing one would bring back an
//     order a player may have seen;
//   - arranging the table (see arrangingKinds): no line at all, and no replay
//     either, since undo keeps the live arrangement (see keepLiveArrangement).
func (g *Game) perform(p *Player, seat int, a Action, cat *pack.Catalog, rng *rand.Rand, now time.Time) error {
	resolved, err := resolve(g, seat, a, rng)
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

	n := narrator{game: g, cat: cat, seat: seat, before: before, after: g.Table}
	e, logged := n.describe(resolved)
	if !logged {
		if resolved.Kind == ActReorderTop {
			g.noteReordered(resolved.Pile)
		}
		return nil
	}
	shuffled := shuffledPiles(before, resolved)
	undoable := len(shuffled) == 0

	// The actor's own snapshots also get what they cannot undo, so that undo
	// takes back only their last undoable action and nothing done since.
	skip := ""
	if undoable {
		skip = p.Token
	}
	g.replay(resolved, shuffled, skip)

	if undoable {
		g.record(p, resolved, e, before, now)
	} else {
		g.appendLog(p, e.text, e.cards, now)
	}
	return nil
}

// noteReordered notes on every undo entry that pile was reordered, so that
// undo keeps the new order if it can (see keepPileOrders).
func (g *Game) noteReordered(pile string) {
	for _, stack := range g.Undo {
		for i := range stack {
			entry := &stack[i]
			if !slices.Contains(entry.Reordered, pile) {
				entry.Reordered = append(entry.Reordered, pile)
			}
		}
	}
}

// inPlaceKinds change cards without moving any: undoing them keeps the live
// position of every card, their own included.
var inPlaceKinds = map[Kind]bool{
	ActExhaust: true,
	ActFlip:    true,
	ActToken:   true,
	ActStatus:  true,
}

// movedCards returns the cards a moves, with everything tucked under them
// before or after a, sorted: undoing a puts them back in place. before and
// after are the tables around a. Kinds that move no card give none.
func movedCards(before, after *Table, a Action) []string {
	if inPlaceKinds[a.Kind] {
		return nil
	}
	ids := slices.Concat([]string{a.Card, a.Target}, a.Cards)
	if a.Kind == ActChooseStage {
		if stage := before.stage(a.Stage); stage != nil {
			ids = append(ids, stage.Cards...)
		}
	}

	moved := map[string]bool{}
	for _, id := range ids {
		if _, ok := before.Cards[id]; !ok {
			continue // empty, or a pile id
		}
		moved[id] = true
		for _, table := range []*Table{before, after} {
			for _, child := range table.descendants(id) {
				moved[child.ID] = true
			}
		}
	}
	return slices.Sorted(maps.Keys(moved))
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

// shuffledPiles returns the ids of the piles a gives a new random order. t is
// the table a applies to.
func shuffledPiles(t *Table, a Action) []string {
	switch a.Kind {
	case ActShuffle:
		return []string{a.Pile}
	case ActShuffleBack:
		deck, _ := deckOfDiscard(a.Pile)
		return []string{deck}
	case ActShuffleIn:
		return []string{PileEncounter}
	case ActToDeck:
		if a.Where == whereShuffle {
			return []string{t.Cards[a.Card].Home}
		}
	}
	return nil
}

// replay applies a to the undo snapshots of every player but skip, so that
// undoing an older action keeps this one. A snapshot may no longer allow it
// (the card has moved since, for instance): such errors are ignored, and that
// snapshot simply misses the change. Shuffled piles are noted on every entry,
// whether the replay worked or not, so that undo re-shuffles them.
func (g *Game) replay(a Action, shuffled []string, skip string) {
	for token, stack := range g.Undo {
		if token == skip {
			continue
		}
		for i := range stack {
			entry := &stack[i]
			_ = apply(entry.Before, a)
			for _, id := range shuffled {
				if !slices.Contains(entry.Shuffled, id) {
					entry.Shuffled = append(entry.Shuffled, id)
				}
			}
		}
	}
}

// record writes the history line of an undoable action, or merges it into the
// actor's previous line.
func (g *Game) record(p *Player, a Action, e event, before *Table, now time.Time) {
	cards := movedCards(before, g.Table, a)
	if entry := g.mergeable(p.Token, e.merge, now); entry != nil {
		entry.Cards = mergeIDs(entry.Cards, cards)
		g.merge(p.Token, entry, a, e, now)
		return
	}
	g.pushUndo(p.Token, UndoEntry{LogIndex: len(g.Log), Before: before, Merge: e.merge, At: now, Cards: cards})
	g.appendLog(p, e.text, e.cards, now)
}

// mergeIDs returns the sorted union of two id lists.
func mergeIDs(a, b []string) []string {
	merged := slices.Concat(a, b)
	slices.Sort(merged)
	return slices.Compact(merged)
}

func (g *Game) appendLog(p *Player, text string, cards []string, now time.Time) {
	g.Log = append(g.Log, LogEntry{Who: p.Name, Color: p.Color, Text: text, At: now, Cards: cards})
}

// mergeable returns the actor's last undo entry when a change with the given
// merge key extends it: same key, the entry still owns the last history
// line, and the previous change is less than mergeWindow old.
func (g *Game) mergeable(token, key string, now time.Time) *UndoEntry {
	stack := g.Undo[token]
	if key == "" || len(stack) == 0 || len(g.Log) == 0 {
		return nil
	}
	entry := &stack[len(stack)-1]
	last := len(g.Log) - 1
	if entry.Merge != key || entry.LogIndex != last || g.Log[last].Undone {
		return nil
	}
	if now.Sub(entry.At) >= mergeWindow {
		return nil
	}
	return entry
}

// merge folds a change into the last history line. The undo entry keeps its
// snapshot, so undo goes back to before the whole burst.
func (g *Game) merge(token string, entry *UndoEntry, a Action, e event, now time.Time) {
	last := len(g.Log) - 1
	if a.Kind == ActFlip && sameSide(entry.Before, g.Table, a.Card) {
		// Flipping back to the starting side cancels the burst entirely.
		g.Log = g.Log[:last]
		stack := g.Undo[token]
		g.Undo[token] = stack[:len(stack)-1]
		return
	}
	g.Log[last].Text = e.mergedText()
	g.Log[last].Cards = e.cards
	g.Log[last].At = now
	entry.At = now
}

// sameSide reports whether card id shows the same side in both tables.
func sameSide(a, b *Table, id string) bool {
	ca, okA := a.Cards[id]
	cb, okB := b.Cards[id]
	return okA && okB && ca.Face == cb.Face && ca.FaceDown == cb.FaceDown
}

// pushUndo adds an entry on top of a player's stack, dropping the oldest
// entry beyond maxUndoDepth.
func (g *Game) pushUndo(token string, entry UndoEntry) {
	if g.Undo == nil {
		g.Undo = map[string][]UndoEntry{}
	}
	stack := g.Undo[token]
	stack = append(stack, entry)
	if len(stack) > maxUndoDepth {
		stack = slices.Delete(stack, 0, len(stack)-maxUndoDepth)
	}
	g.Undo[token] = stack
}

// undo restores the table as it was before the player's last undoable
// action. The snapshot already holds every later tracked change but that
// player's undoable ones (see replay); the live arrangement is carried over
// (see keepLiveArrangement). What the undo changes is then carried into the
// other players' snapshots, so that their own undo does not bring it back.
func (g *Game) undo(p *Player, rng *rand.Rand, now time.Time) error {
	stack := g.Undo[p.Token]
	if len(stack) == 0 {
		return invalid("nothing to undo")
	}
	entry := stack[len(stack)-1]
	g.Undo[p.Token] = stack[:len(stack)-1]

	live := g.Table
	restored := entry.Before
	keepLiveArrangement(restored, live, &entry)
	// Open Looks and Searches are each player's own business, not part of
	// what is undone: keep them as they are now.
	restored.Views = live.Views
	// A pile shuffled since the snapshot must not come back in an order a
	// player may have seen before the shuffle.
	for _, id := range entry.Shuffled {
		if pile, ok := restored.Piles[id]; ok {
			// New ids too: the old ones are known to whoever saw the pile.
			renames, order := reidentify(restored, pile.Cards, rng)
			renameCards(restored, renames)
			pile.Cards = order
		}
	}

	patch := diffTables(live, restored)
	for token, others := range g.Undo {
		if token == p.Token {
			continue
		}
		for i := range others {
			patch.applyTo(others[i].Before)
			repairPlaces(others[i].Before)
		}
	}
	g.Table = restored

	original := &g.Log[entry.LogIndex]
	original.Undone = true
	g.appendLog(p, "undid “"+original.Text+"”", nil, now)
	return nil
}

// openView opens a Look or a Search on a pile for the player. It is logged
// but cannot be undone.
func (g *Game) openView(p *Player, seat int, a Action, now time.Time) error {
	pile, err := g.Table.pile(a.Pile)
	if err != nil {
		return err
	}
	// Decks are private to their owner; every other pile is either the
	// shared encounter deck or face up, so anyone may look through it.
	if pile.Kind == KindDeck && pile.Owner != seat {
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
		text = fmt.Sprintf("is looking at %s of %s", topCount(n), g.pileName(seat, pile.ID))
	} else {
		view.Mode = viewModeSearch
		view.Cards = topCards(pile, len(pile.Cards))
		text = "is searching " + g.pileName(seat, pile.ID)
	}

	if g.Table.Views == nil {
		g.Table.Views = map[Area]*PrivateView{}
	}
	g.Table.Views[PlayerArea(seat)] = view
	g.appendLog(p, text, nil, now)
	return nil
}

// closeView closes the player's open view. Closing with a shuffle shuffles the
// viewed pile, as a regular shuffle action.
func (g *Game) closeView(p *Player, seat int, a Action, cat *pack.Catalog, rng *rand.Rand, now time.Time) error {
	area := PlayerArea(seat)
	view := g.Table.Views[area]
	if view == nil {
		return invalid("no view is open")
	}
	switch a.Where {
	case "":
	case whereShuffle:
		if err := g.perform(p, seat, Action{Kind: ActShuffle, Pile: view.Pile}, cat, rng, now); err != nil {
			return err
		}
	default:
		return invalid("unknown way to close a view %q", a.Where)
	}
	delete(g.Table.Views, area)
	return nil
}
