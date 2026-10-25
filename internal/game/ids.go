package game

import (
	"math/rand/v2"
	"slices"
)

// Card ids are opaque on purpose: an id that followed setup order, or that
// survived a shuffle or a trip through a hand or a deck (see
// renamedOnTheWay), would let a player recognise a face-down card.
const (
	idAlphabet = "abcdefghjkmnpqrstuvwxyz23456789"
	idLength   = 8
)

// newCardID returns a card id drawn from rng that is neither used in t nor in
// batch, the ids already chosen for the same action.
func newCardID(t *Table, rng *rand.Rand, batch map[string]bool) string {
	for {
		id := randomCardID(rng)
		if _, taken := t.Cards[id]; !taken && !batch[id] {
			return id
		}
	}
}

func randomCardID(rng *rand.Rand) string {
	id := make([]byte, 0, idLength+1)
	id = append(id, 'c')
	for range idLength {
		id = append(id, idAlphabet[rng.IntN(len(idAlphabet))])
	}
	return string(id)
}

// reidentify prepares a shuffle of the cards ids: it picks a fresh id for
// each of them and returns the old → new ids with the new ids in a random
// order. It does not change t.
func reidentify(t *Table, ids []string, rng *rand.Rand) (renames map[string]string, order []string) {
	renames = make(map[string]string, len(ids))
	addFreshIDs(t, renames, ids, rng)
	order = make([]string, 0, len(ids))
	for _, old := range ids {
		order = append(order, renames[old])
	}
	rng.Shuffle(len(order), func(i, j int) { order[i], order[j] = order[j], order[i] })
	return renames, order
}

// addFreshIDs adds to renames a new id for each of ids, in order: one used
// neither in t nor by renames already, so that the new ids of one action are
// all distinct. It does not change t.
func addFreshIDs(t *Table, renames map[string]string, ids []string, rng *rand.Rand) {
	taken := make(map[string]bool, len(renames)+len(ids))
	for _, id := range renames {
		taken[id] = true
	}
	for _, old := range ids {
		id := newCardID(t, rng, taken)
		taken[id] = true
		renames[old] = id
	}
}

// renamedOnTheWay returns the cards a gives new ids as it takes a.Card out
// of its place, so that nobody can tie the card that comes out later to the
// one they saw go: every card a sends onto a deck, but one that lands on top
// of a side deck that shows it, and a card taken into a hand out of a hand or
// face down off the table. That covers the cards tucked under a card leaving
// the table that go to the bottom of a deck (see tuckedDestination). The
// cards a shuffle into a deck gathers are left out: the shuffle renames them
// (see reidentify).
func (t *Table) renamedOnTheWay(a Action) []string {
	c, ok := t.Cards[a.Card]
	if !ok {
		return nil
	}
	var ids []string
	switch a.Kind {
	case ActToDeck:
		// On a side deck that shows its top card, a card put on top, or under
		// no card, lies in everybody's sight.
		home, ok := t.Piles[c.Home]
		inSight := ok && home.TopFaceUp && (a.Where == whereTop || len(home.Cards) == 0)
		if a.Where != whereShuffle && !inSight {
			ids = append(ids, c.ID)
		}
	case ActToHand:
		if c.Zone == ZoneHand || c.Zone == ZoneTable && c.FaceDown {
			ids = append(ids, c.ID)
		}
	case ActFlip:
		// A revealed card turned face down goes back on top of its deck (see
		// applyFlip); any other flip leaves the card where it is.
		if a.FaceDown == nil || !*a.FaceDown || c.OnPile == "" {
			return nil
		}
		ids = append(ids, c.ID)
	case ActDiscard, ActToPile, ActPlay:
	default:
		return nil
	}
	return append(ids, t.sentUnderDecks(c, a)...)
}

// sentUnderDecks returns the cards tucked under c that go to the bottom of a
// deck when a takes c off the table (see tuckedDestination), but those a
// shuffle into c's deck gathers.
func (t *Table) sentUnderDecks(c *Card, a Action) []string {
	if c.Zone != ZoneTable {
		return nil
	}
	var shuffled []string
	if deck, ok := t.Piles[c.Home]; ok && a.Kind == ActToDeck && a.Where == whereShuffle {
		shuffled = t.shuffledIntoDeck(c, deck)
	}
	var ids []string
	for _, child := range t.descendants(c.ID) {
		_, bottom, ok := t.tuckedDestination(child)
		if ok && bottom && !slices.Contains(shuffled, child.ID) {
			ids = append(ids, child.ID)
		}
	}
	return ids
}

// checkRenamedOnTheWay checks that a gives a new id to exactly the cards it
// takes out of sight (see renamedOnTheWay), and returns the renames for apply
// to give once a is performed. It returns none for an action that renames no
// card on its way, nor for a shuffle into a deck, which checks its renames
// itself (see applyToDeck).
func (t *Table) checkRenamedOnTheWay(a Action) (map[string]string, error) {
	if !takesAway[a.Kind] || producesShuffle(a) {
		return nil, nil
	}
	if _, err := checkFreshIDs(t, a.Renames, t.renamedOnTheWay(a)); err != nil {
		return nil, err
	}
	return a.Renames, nil
}

// renamedAgain returns a, recorded on another table, with the new ids of the
// cards it takes out of sight on t (see renamedOnTheWay): a card still among
// them keeps the new id it was given, so that later events still name it,
// and a card now among them gets one from rng. The sub-actions of a group
// are each renamed on the table the previous ones leave, as applyGroup
// performs them. A rebuild uses it for an event whose cards tucked under the
// card it moves changed (see replayEvent).
func renamedAgain(t *Table, a Action, rng *rand.Rand) (Action, error) {
	if a.Kind == ActGroup {
		staged := t.Clone()
		subs := make([]Action, 0, len(a.Actions))
		for _, sub := range a.Actions {
			renamed, err := renamedAgain(staged, sub, rng)
			if err != nil {
				return a, err
			}
			if err := apply(staged, renamed); err != nil {
				return a, err
			}
			subs = append(subs, renamed)
		}
		a.Actions = subs
		return a, nil
	}
	if !takesAway[a.Kind] || producesShuffle(a) {
		return a, nil
	}
	covered, err := t.coveredFor(a, a.Area)
	if err != nil {
		return a, err
	}
	renames := map[string]string{}
	var added []string
	for _, id := range covered.renamedOnTheWay(a) {
		if renamed, ok := a.Renames[id]; ok {
			renames[id] = renamed
		} else {
			added = append(added, id)
		}
	}
	addFreshIDs(covered, renames, added, rng)
	a.Renames = nil
	if len(renames) > 0 {
		a.Renames = renames
	}
	return a, nil
}

// takesAway are the kinds that may take a card out of its place, and with it
// the cards tucked under it (see renamedOnTheWay).
var takesAway = map[Kind]bool{
	ActToDeck:  true,
	ActToHand:  true,
	ActFlip:    true,
	ActDiscard: true,
	ActToPile:  true,
	ActPlay:    true,
}

// checkRenames checks the renames of a shuffle: they must cover exactly the
// cards of expected, give each an unused and distinct id (see
// checkFreshIDs), and a.Cards must be an ordering of those new ids.
func checkRenames(t *Table, a Action, expected []string) error {
	newIDs, err := checkFreshIDs(t, a.Renames, expected)
	if err != nil {
		return err
	}
	if !samePermutation(newIDs, a.Cards) {
		return invalid("shuffle order is not a permutation of the renamed cards")
	}
	return nil
}

// checkFreshIDs checks that renames cover exactly the cards of expected and
// give each an unused and distinct id. It returns the new ids, in the order
// of expected.
func checkFreshIDs(t *Table, renames map[string]string, expected []string) ([]string, error) {
	if len(renames) != len(expected) {
		return nil, invalid("renames cover %d cards, want %d", len(renames), len(expected))
	}
	newIDs := make([]string, 0, len(expected))
	seen := make(map[string]bool, len(expected))
	for _, old := range expected {
		id, ok := renames[old]
		if !ok {
			return nil, invalid("card %q is not renamed", old)
		}
		if _, taken := t.Cards[id]; taken {
			return nil, invalid("new id %q is already used", id)
		}
		if seen[id] {
			return nil, invalid("new id %q is given twice", id)
		}
		seen[id] = true
		newIDs = append(newIDs, id)
	}
	return newIDs, nil
}

// renameCards gives cards new ids and rewrites every reference to them. The
// renames were checked beforehand (see checkRenames and checkFreshIDs). Open
// views drop the renamed cards: their ids are gone.
func renameCards(t *Table, renames map[string]string) {
	for old, id := range renames {
		c := t.Cards[old]
		delete(t.Cards, old)
		c.ID = id
		t.Cards[id] = c
	}
	rename := func(id string) string {
		if renamed, ok := renames[id]; ok {
			return renamed
		}
		return id
	}
	for _, c := range t.Cards {
		c.Parent = rename(c.Parent)
	}
	for _, pile := range t.Piles {
		for i, id := range pile.Cards {
			pile.Cards[i] = rename(id)
		}
	}
	for _, hand := range t.Hands {
		for i, id := range hand {
			hand[i] = rename(id)
		}
	}
	// Stage cards are never renamed; rewriting them anyway keeps the stages
	// right should that ever change.
	for _, stage := range t.Stages {
		stage.Current = rename(stage.Current)
		for i, id := range stage.Cards {
			stage.Cards[i] = rename(id)
		}
	}
	for i := range t.Arrows {
		t.Arrows[i].From = rename(t.Arrows[i].From)
		t.Arrows[i].To = rename(t.Arrows[i].To)
	}
	for _, view := range t.Views {
		view.Cards = slices.DeleteFunc(view.Cards, func(id string) bool {
			_, renamed := renames[id]
			return renamed
		})
	}
}
