package game

import (
	"math/rand/v2"
	"slices"
)

// Card ids are opaque on purpose: an id that followed setup order, or that
// survived a shuffle or a trip through a hand or a deck (see freshID), would
// let a player recognise a face-down card.
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
	fresh := make(map[string]bool, len(ids))
	order = make([]string, 0, len(ids))
	for _, old := range ids {
		id := newCardID(t, rng, fresh)
		fresh[id] = true
		renames[old] = id
		order = append(order, id)
	}
	rng.Shuffle(len(order), func(i, j int) { order[i], order[j] = order[j], order[i] })
	return renames, order
}

// freshID gives c, on its way into a hand or a deck, a new id when the other
// players cannot tell it apart where it lies: in a hand, or face down on the
// table. Keeping its id would let them tie the card that comes out later to
// the one they saw before it went in. It returns the renames to record, nil
// for a card everybody sees go.
func freshID(t *Table, c *Card, rng *rand.Rand) map[string]string {
	inHand := c.Zone == ZoneHand
	faceDownOnTable := c.Zone == ZoneTable && c.FaceDown
	if !inHand && !faceDownOnTable {
		return nil
	}
	renames, _ := reidentify(t, []string{c.ID}, rng)
	return renames
}

// checkFreshID checks the new id resolve gave the card a moves into a hand or
// a deck, if any (see freshID).
func checkFreshID(t *Table, a Action) error {
	if a.Renames == nil {
		return nil
	}
	_, err := checkFreshIDs(t, a.Renames, []string{a.Card})
	return err
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
// renames were checked beforehand (see checkRenames and checkFreshID). Open
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
