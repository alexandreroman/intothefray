package game

import (
	"maps"
	"slices"
)

// Arranging the table (see arrangingKinds) is never replayed onto the undo
// snapshots, which keeps them cheap. Instead, undo carries the live
// arrangement over to the table it restores, for everything the undone action
// did not touch.

// keepLiveArrangement copies onto restored, the table an undo is about to
// install, the arrangement of the live table: card positions, hand orders,
// the first player token, arrows and the order of reordered piles. The cards
// of entry, those the undone action touched, keep their restored state.
func keepLiveArrangement(restored, live *Table, entry *UndoEntry) {
	keepCardPositions(restored, live, entry.Cards)
	for area, hand := range restored.Hands {
		restored.Hands[area] = mergeOrder(live.Hands[area], hand)
	}
	restored.FirstPlayer = live.FirstPlayer
	keepArrows(restored, live)
	keepPileOrders(restored, live, entry.Reordered)
	// Kept cards bring their live Z: new cards must still go above them.
	restored.NextZ = max(restored.NextZ, live.NextZ)
}

// keepCardPositions gives every card lying on both tables, but the undone
// ones, its live place: area, position, Z, parent and the pile it covers. A
// live parent is kept only if it lies on the restored table and does not tuck
// a card under itself.
func keepCardPositions(restored, live *Table, undone []string) {
	var kept []*Card
	for _, id := range slices.Sorted(maps.Keys(restored.Cards)) {
		c := restored.Cards[id]
		liveCard, ok := live.Cards[id]
		if !ok || c.Zone != ZoneTable || liveCard.Zone != ZoneTable || slices.Contains(undone, id) {
			continue
		}
		c.Area, c.X, c.Y, c.Z = liveCard.Area, liveCard.X, liveCard.Y, liveCard.Z
		c.Parent = liveCard.Parent
		c.OnPile = liveCard.OnPile
		kept = append(kept, c)
	}

	for _, c := range kept {
		if c.Parent == "" {
			continue
		}
		parent, ok := restored.Cards[c.Parent]
		if !ok || parent.Zone != ZoneTable || restored.tuckedUnder(c.Parent, c.ID) {
			c.Parent = ""
		}
	}
}

// tuckedUnder reports whether card id sits under ancestor, directly or not.
func (t *Table) tuckedUnder(id, ancestor string) bool {
	seen := map[string]bool{}
	for current := id; current != "" && !seen[current]; {
		seen[current] = true
		c, ok := t.Cards[current]
		if !ok {
			return false
		}
		if c.Parent == ancestor {
			return true
		}
		current = c.Parent
	}
	return false
}

// mergeOrder orders the cards of restored as in live; the cards live does not
// hold go last, in their restored order.
func mergeOrder(live, restored []string) []string {
	merged := make([]string, 0, len(restored))
	for _, id := range live {
		if slices.Contains(restored, id) {
			merged = append(merged, id)
		}
	}
	for _, id := range restored {
		if !slices.Contains(live, id) {
			merged = append(merged, id)
		}
	}
	return merged
}

// keepArrows keeps the live arrows whose both ends lie on the restored table.
func keepArrows(restored, live *Table) {
	onTable := func(id string) bool {
		c, ok := restored.Cards[id]
		return ok && c.Zone == ZoneTable
	}
	var arrows []Arrow
	for _, arrow := range live.Arrows {
		if onTable(arrow.From) && onTable(arrow.To) {
			arrows = append(arrows, arrow)
		}
	}
	restored.Arrows = arrows
}

// keepPileOrders gives each reordered pile its live order, as long as it
// holds the same cards on both tables.
func keepPileOrders(restored, live *Table, reordered []string) {
	for _, id := range reordered {
		restoredPile, okRestored := restored.Piles[id]
		livePile, okLive := live.Piles[id]
		if okRestored && okLive && samePermutation(restoredPile.Cards, livePile.Cards) {
			restoredPile.Cards = slices.Clone(livePile.Cards)
		}
	}
}
