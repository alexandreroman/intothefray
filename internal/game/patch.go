package game

import (
	"maps"
	"reflect"
	"slices"
)

// tablePatch is the difference between two tables, part by part: each card,
// each pile's card list, each hand, the stages, the arrows and the first
// player token. Open views are not part of it. Undo uses it to carry what it
// changed into the other players' snapshots.
type tablePatch struct {
	cards              map[string]*Card    // cards added or changed, as they are now
	removed            []string            // cards that no longer exist
	piles              map[string][]string // card list of each changed pile
	hands              map[Area][]string   // card list of each changed hand
	stagesChanged      bool
	stages             []*Stage
	arrowsChanged      bool
	arrows             []Arrow
	firstPlayerChanged bool
	firstPlayer        Point
}

// diffTables returns the patch that turns from into to. It shares nothing
// with to.
func diffTables(from, to *Table) tablePatch {
	p := tablePatch{
		cards: map[string]*Card{},
		piles: map[string][]string{},
		hands: map[Area][]string{},
	}
	for id, c := range to.Cards {
		if old, ok := from.Cards[id]; !ok || !reflect.DeepEqual(old, c) {
			p.cards[id] = c.clone()
		}
	}
	for _, id := range slices.Sorted(maps.Keys(from.Cards)) {
		if _, ok := to.Cards[id]; !ok {
			p.removed = append(p.removed, id)
		}
	}
	for id, pile := range to.Piles {
		if old, ok := from.Piles[id]; !ok || !slices.Equal(old.Cards, pile.Cards) {
			p.piles[id] = slices.Clone(pile.Cards)
		}
	}
	for area := range handAreas(from, to) {
		if !slices.Equal(from.Hands[area], to.Hands[area]) {
			p.hands[area] = slices.Clone(to.Hands[area])
		}
	}
	if !reflect.DeepEqual(from.Stages, to.Stages) {
		p.stagesChanged = true
		p.stages = cloneStages(to.Stages)
	}
	if !slices.Equal(from.Arrows, to.Arrows) {
		p.arrowsChanged = true
		p.arrows = slices.Clone(to.Arrows)
	}
	if from.FirstPlayer != to.FirstPlayer {
		p.firstPlayerChanged = true
		p.firstPlayer = to.FirstPlayer
	}
	return p
}

// applyTo sets the parts of t that the patch holds to their patched value,
// and leaves every other part alone. t shares nothing with the patch
// afterwards, so one patch can be applied to several tables.
func (p tablePatch) applyTo(t *Table) {
	for _, id := range p.removed {
		delete(t.Cards, id)
	}
	for id, c := range p.cards {
		t.Cards[id] = c.clone()
	}
	for id, cards := range p.piles {
		if pile, ok := t.Piles[id]; ok {
			pile.Cards = slices.Clone(cards)
		}
	}
	for area, hand := range p.hands {
		if t.Hands == nil {
			t.Hands = map[Area][]string{}
		}
		t.Hands[area] = slices.Clone(hand)
	}
	if p.stagesChanged {
		t.Stages = cloneStages(p.stages)
	}
	if p.arrowsChanged {
		t.Arrows = slices.Clone(p.arrows)
	}
	if p.firstPlayerChanged {
		t.FirstPlayer = p.firstPlayer
	}
}

// handAreas returns the areas that have a hand in a or in b.
func handAreas(a, b *Table) map[Area]bool {
	areas := make(map[Area]bool, len(a.Hands)+len(b.Hands))
	for area := range a.Hands {
		areas[area] = true
	}
	for area := range b.Hands {
		areas[area] = true
	}
	return areas
}

// repairPlaces makes every card of t sit in exactly one place, the one its
// own Zone, Pile and Area name, after a patch set some lists of t to values
// taken from another table. List entries that contradict their card are
// dropped; a card missing from the list it belongs to goes on top of that
// pile, or at the end of that hand. Parents, arrows and views that point at
// cards no longer there are dropped as well.
func repairPlaces(t *Table) {
	for id, pile := range t.Piles {
		pile.Cards = keepListed(pile.Cards, func(c *Card) bool {
			return c.Zone == ZonePile && c.Pile == id
		}, t)
	}
	for area, hand := range t.Hands {
		t.Hands[area] = keepListed(hand, func(c *Card) bool {
			return c.Zone == ZoneHand && c.Area == area
		}, t)
	}

	for _, id := range slices.Sorted(maps.Keys(t.Cards)) {
		c := t.Cards[id]
		switch c.Zone {
		case ZonePile:
			if pile, ok := t.Piles[c.Pile]; ok && !slices.Contains(pile.Cards, id) {
				pile.Cards = append(pile.Cards, id)
			}
		case ZoneHand:
			if !slices.Contains(t.Hands[c.Area], id) {
				if t.Hands == nil {
					t.Hands = map[Area][]string{}
				}
				t.Hands[c.Area] = append(t.Hands[c.Area], id)
			}
		}
	}

	onTable := func(id string) bool {
		c, ok := t.Cards[id]
		return ok && c.Zone == ZoneTable
	}
	for _, c := range t.Cards {
		if c.Parent != "" && (c.Zone != ZoneTable || !onTable(c.Parent)) {
			c.Parent = ""
		}
	}
	t.Arrows = slices.DeleteFunc(t.Arrows, func(ar Arrow) bool {
		return !onTable(ar.From) || !onTable(ar.To)
	})
	for _, view := range t.Views {
		view.Cards = slices.DeleteFunc(view.Cards, func(id string) bool {
			_, ok := t.Cards[id]
			return !ok
		})
	}
}

// keepListed returns the ids of list whose card exists and belongs there
// according to belongs, each once, in list order. A list with nothing to drop
// is returned as it is.
func keepListed(list []string, belongs func(*Card) bool, t *Table) []string {
	var kept []string
	for _, id := range list {
		c, ok := t.Cards[id]
		if ok && belongs(c) && !slices.Contains(kept, id) {
			kept = append(kept, id)
		}
	}
	if len(kept) == len(list) {
		return list
	}
	return kept
}
