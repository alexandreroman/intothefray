package game

import (
	"cmp"
	"maps"
	"math"
	"slices"
	"strings"
)

// Positions inside a card stack: an attached card sits this far to the right
// of and below its target, so that every card of the stack stays readable.
const (
	attachOffsetX = 10
	attachOffsetY = 20
)

// gridSize is the snapping step of table coordinates.
const gridSize = 10

// Where values of a toDeck action.
const (
	whereTop     = "top"
	whereBottom  = "bottom"
	whereShuffle = "shuffle"
)

// apply performs a on t. It is all-or-nothing: every check runs before the
// first mutation, so an error leaves t untouched. A deck action sees the cards
// revealed on its deck back on top of it, the cards covering hides under their
// new ids (see coveredFor).
func apply(t *Table, a Action) error {
	covered, hidden, err := t.coveredFor(a, a.Area)
	if err != nil {
		return err
	}
	hiddenRenames, rest, err := splitRenames(covered, a.Renames, hidden)
	if err != nil {
		return err
	}
	// covered is a copy of t whenever covering hides a card.
	if len(hiddenRenames) > 0 {
		renameInViews(covered, revealedRenames(t, hiddenRenames))
		renameCards(covered, hiddenRenames)
	}
	a.Renames = rest
	if err := applyAction(covered, a); err != nil {
		return err
	}
	if covered != t {
		*t = *covered
	}
	return nil
}

// splitRenames splits renames, those of an action that covers its deck, in
// two: first the new ids of hidden, the cards covering hides (see
// coveredFor), checked as fresh on t (see checkFreshIDs), then the others,
// nil when there are none.
func splitRenames(t *Table, renames map[string]string, hidden []string) (map[string]string, map[string]string, error) {
	if len(hidden) == 0 {
		return nil, renames, nil
	}
	hiddenRenames := make(map[string]string, len(hidden))
	rest := maps.Clone(renames)
	for _, id := range hidden {
		renamed, ok := rest[id]
		if !ok {
			return nil, nil, invalid("card %q is not renamed", id)
		}
		hiddenRenames[id] = renamed
		delete(rest, id)
	}
	if _, err := checkFreshIDs(t, hiddenRenames, hidden); err != nil {
		return nil, nil, err
	}
	if len(rest) == 0 {
		rest = nil
	}
	return hiddenRenames, rest, nil
}

// revealedRenames returns the renames among renames of the cards revealed on
// a deck of t. Covered by a card put on top, such a card stays in its deck: an
// open view that holds it keeps following it under its new id (see
// renameInViews). The cards it carries drop out of the views as they drop
// out of sight.
func revealedRenames(t *Table, renames map[string]string) map[string]string {
	revealed := map[string]string{}
	for old, id := range renames {
		if t.Cards[old].OnPile != "" {
			revealed[old] = id
		}
	}
	return revealed
}

// applyAction performs a on t, as apply does, on the table as a sees it. The
// cards it takes out of sight get their new ids last (see renamedOnTheWay).
// An action of a kind that renames no card carries no renames: a rebuild
// then gives the event the renames of the table it meets (see renamedAgain).
func applyAction(t *Table, a Action) error {
	if len(a.Renames) > 0 && !renamesCards(a) {
		return invalid("%q action renames no card", a.Kind)
	}
	renames, err := t.checkRenamedOnTheWay(a)
	if err != nil {
		return err
	}
	if err := applyKind(t, a); err != nil {
		return err
	}
	renameCards(t, renames)
	return nil
}

// applyKind performs a on t, the part that depends on its kind.
func applyKind(t *Table, a Action) error {
	switch a.Kind {
	case ActMove:
		return applyMove(t, a)
	case ActAttach:
		return applyAttach(t, a)
	case ActDetach:
		return applyDetach(t, a)
	case ActToHand:
		return applyToHand(t, a)
	case ActToDeck:
		return applyToDeck(t, a)
	case ActDiscard:
		return applyDiscard(t, a)
	case ActToPile:
		return applyToPile(t, a)
	case ActPlay:
		return applyPlay(t, a)
	case ActExhaust:
		return applyExhaust(t, a)
	case ActReadyAll:
		return applyReadyAll(t, a)
	case ActFlip:
		return applyFlip(t, a)
	case ActToken:
		return applyCounter(t.tableCard, a, tokenNames, 0, math.MaxInt, func(c *Card) *map[string]int { return &c.Tokens })
	case ActStatus:
		return applyCounter(t.inPlayCard, a, statusNames, 0, math.MaxInt, func(c *Card) *map[string]int { return &c.Status })
	case ActModifier:
		return applyCounter(t.inPlayCard, a, modifierNames, -maxCount, maxCount, func(c *Card) *map[string]int {
			return &c.Mods
		})
	case ActChooseStage:
		return applyChooseStage(t, a)
	case ActDraw:
		return applyDraw(t, a)
	case ActReveal:
		return applyReveal(t, a)
	case ActDeal:
		return applyDeal(t, a)
	case ActDiscardTop:
		return applyDiscardTop(t, a)
	case ActShuffle:
		return applyShuffle(t, a)
	case ActShuffleBack:
		return applyShuffleBack(t, a)
	case ActShuffleIn:
		return applyShuffleIn(t, a)
	case ActReorderTop:
		return applyReorderTop(t, a)
	case ActHandOrder:
		return applyHandOrder(t, a)
	case ActMarker:
		return applyMarker(t, a)
	case ActArrowAdd:
		return applyArrowAdd(t, a)
	case ActArrowClear:
		return applyArrowClear(t, a)
	case ActGroup:
		return applyGroup(t, a)
	default:
		return invalid("unknown action kind %q", a.Kind)
	}
}

// applyGroup performs the sub-actions of a group in order. They run on a
// copy of t, swapped in once all of them succeed, so that a failing one
// leaves t untouched.
func applyGroup(t *Table, a Action) error {
	next := t.Clone()
	for _, sub := range a.Actions {
		if err := apply(next, sub); err != nil {
			return err
		}
	}
	*t = *next
	return nil
}

// card returns the card with the given id, or an ErrInvalid error.
func (t *Table) card(id string) (*Card, error) {
	c, ok := t.Cards[id]
	if !ok {
		return nil, invalid("unknown card %q", id)
	}
	return c, nil
}

// tableCard returns the card with the given id, which must be on the table.
func (t *Table) tableCard(id string) (*Card, error) {
	c, err := t.card(id)
	if err != nil {
		return nil, err
	}
	if c.Zone != ZoneTable {
		return nil, invalid("card %q is not on the table", id)
	}
	return c, nil
}

// inPlayCard returns the table card with the given id when it is in play. A
// card revealed on a pile lies on its deck, out of play: it is neither
// exhausted nor given statuses or modifiers until it leaves it. It may carry
// tokens, which count on it where it lies (see applyCounter).
func (t *Table) inPlayCard(id string) (*Card, error) {
	c, err := t.tableCard(id)
	if err != nil {
		return nil, err
	}
	if c.OnPile != "" {
		return nil, invalid("card %q lies revealed on pile %q, out of play", c.ID, c.OnPile)
	}
	return c, nil
}

func snap(v int) int {
	return int(math.Round(float64(v)/gridSize)) * gridSize
}

// validArea reports whether a names a seat.
func validArea(a Area) bool {
	_, ok := areaSeat(a)
	return ok
}

// discardPileID returns the id of the pile where c is discarded: for a card
// of a side deck or a scenario deck, the pile that deck records (see
// Pile.Discard), the deck itself when its cards go to its bottom, empty when
// they are never discarded; else the discard pile of its owner (the
// encounter discard pile for a card owned by nobody). A card keeps its home
// wherever it is discarded to.
func (t *Table) discardPileID(c *Card) string {
	if ruledDeckID(c.Home) {
		if home, ok := t.Piles[c.Home]; ok {
			return home.Discard
		}
		return ""
	}
	if c.Owner == NoOwner {
		return PileEncounterDiscard
	}
	return playerDiscardID(PlayerArea(c.Owner))
}

// tuckedDestination returns the pile a card carried by a card leaving the
// table goes to (see carried): the pile it is discarded to, on top, or at the
// bottom of its deck for a deck whose cards are discarded there (bottom is
// then true), as Daredevil's Sense cards are. A side deck or scenario deck
// card whose cards are never discarded goes to the bottom of its deck too, so
// that it never keeps its host on the table. ok is false when there is no
// such pile.
func (t *Table) tuckedDestination(c *Card) (pile *Pile, bottom, ok bool) {
	if pile, ok := t.Piles[t.discardPileID(c)]; ok {
		return pile, pile.discardsToBottom(), true
	}
	if ruledDeckID(c.Home) {
		if home, ok := t.Piles[c.Home]; ok {
			return home, true, true
		}
	}
	return nil, false, false
}

// shuffledIntoDeck returns the cards a shuffle of c into deck (see toDeckID)
// gathers: the cards of deck, the cards c carries (see carried) that leaving
// the table sends to deck (see tuckedDestination), then c.
func (t *Table) shuffledIntoDeck(c *Card, deck *Pile) []string {
	cards := without(deck.Cards, c.ID)
	if c.Zone == ZoneTable {
		for _, child := range t.carried(c) {
			if pile, _, ok := t.tuckedDestination(child); ok && pile == deck {
				cards = append(cards, child.ID)
			}
		}
	}
	return append(cards, c.ID)
}

// byZThenID orders cards from the lowest Z to the highest, by id when two
// share a Z, so that the order never depends on map iteration.
func byZThenID(a, b *Card) int {
	return cmp.Or(cmp.Compare(a.Z, b.Z), cmp.Compare(a.ID, b.ID))
}

// A stack is a chain of table cards: its main card, tucked under no card,
// the card tucked under the main card, the card tucked under that one, and so
// on to the last card of the stack. A card has at most one card tucked
// directly under it (see Card.Parent).

// tuckedUnder returns the card tucked directly under id, or nil.
func (t *Table) tuckedUnder(id string) *Card {
	for _, c := range t.Cards {
		if c.Parent == id {
			return c
		}
	}
	return nil
}

// chain returns the cards that follow c in its stack, the one tucked
// directly under c first: for a main card, every other card of its stack.
func (t *Table) chain(c *Card) []*Card {
	var cards []*Card
	for next := t.tuckedUnder(c.ID); next != nil; next = t.tuckedUnder(next.ID) {
		cards = append(cards, next)
	}
	return cards
}

// mainCard returns the main card of the stack c belongs to: c itself when it
// is tucked under no card.
func (t *Table) mainCard(c *Card) *Card {
	for c.Parent != "" {
		c = t.Cards[c.Parent]
	}
	return c
}

// carried returns the cards that come along when c moves or leaves the
// table: for a main card, every other card of its stack, the one tucked
// directly under it first; for a tucked card, none, as it leaves its stack
// alone (see detach).
func (t *Table) carried(c *Card) []*Card {
	if c.Parent != "" {
		return nil
	}
	return t.chain(c)
}

// detach takes c, a tucked card, out of its stack, which closes up: the card
// tucked under c, if any, gets tucked under the card c was tucked under, and
// the stack is laid out again (see layOutStack).
func (t *Table) detach(c *Card) {
	main := t.mainCard(c)
	if next := t.tuckedUnder(c.ID); next != nil {
		next.Parent = c.Parent
	}
	c.Parent = ""
	t.layOutStack(main)
}

// layOutStack lays out the stack of main, a main card, wherever its cards
// were: it places them (see placeStack), then gives them fresh Zs from
// nextZ, main on top, each card beneath the one it is tucked under. Fresh Zs
// keep every Z unique and positive, and bring the stack to the top of the
// table, as a move does. With placeStack, it is the single place that places
// and orders the cards of a stack.
func (t *Table) layOutStack(main *Card) {
	t.placeStack(main)
	tucked := t.chain(main)
	for _, c := range slices.Backward(tucked) {
		c.Z = t.nextZ()
	}
	main.Z = t.nextZ()
}

// placeStack places the tucked cards of the stack of main, a main card, and
// leaves every Z as it is. Each tucked card lies attachOffsetX to the right of
// and attachOffsetY below the card it is tucked under, so that every card
// stays readable, except the first one under a main card that shows a scheme:
// it lies centred on the scheme, as players lay a card they put on it, but
// never past the top or left edge of the table.
func (t *Table) placeStack(main *Card) {
	above := main
	for _, c := range t.chain(main) {
		if above == main && showsScheme(main) {
			mainWidth, mainHeight := tableBox(main)
			width, height := tableBox(c)
			c.X = max(0, main.X+(mainWidth-width)/2)
			c.Y = max(0, main.Y+(mainHeight-height)/2)
		} else {
			c.X = above.X + attachOffsetX
			c.Y = above.Y + attachOffsetY
		}
		above = c
	}
}

// tableBox returns the width and height of c as the client draws it on the
// table (cardBox, web/src/table/layout.ts): a face-down card shows its back,
// a portrait card; a landscape face revealed on a deck lies turned a quarter,
// as piles are portrait. A card without shapes lies as a portrait card.
func tableBox(c *Card) (int, int) {
	shape, ok := shownShape(c)
	if c.FaceDown || !ok {
		return portraitWidth, portraitHeight
	}
	width, height := cardWidth(shape.Size), cardHeight(shape.Size)
	if width > height && c.OnPile != "" {
		return height, width
	}
	return width, height
}

// showsScheme tells whether c lies face up on a scheme face.
func showsScheme(c *Card) bool {
	shape, ok := shownShape(c)
	return ok && !c.FaceDown && shape.Scheme
}

// shownShape returns the shape of the face c shows, if c has one.
func shownShape(c *Card) (FaceShape, bool) {
	if c.Face < 0 || c.Face >= len(c.Shapes) {
		return FaceShape{}, false
	}
	return c.Shapes[c.Face], true
}

// checkLeave verifies that c can be taken out of its current place and that
// every card it carries (see carried) has a discard pile to go to.
func (t *Table) checkLeave(c *Card) error {
	switch c.Zone {
	case ZoneTable:
		if err := t.checkStaysOnTable(c); err != nil {
			return err
		}
		for _, child := range t.carried(c) {
			if err := t.checkStaysOnTable(child); err != nil {
				return err
			}
			if _, _, ok := t.tuckedDestination(child); !ok {
				return invalid("no discard pile for card %q", child.ID)
			}
		}
	case ZoneHand:
		if handOf(t, c.ID) == "" {
			return invalid("card %q is in no hand", c.ID)
		}
	case ZonePile:
		pile, ok := t.Piles[c.Pile]
		if !ok || !slices.Contains(pile.Cards, c.ID) {
			return invalid("card %q is not in pile %q", c.ID, c.Pile)
		}
	default:
		return invalid("card %q cannot move from zone %q", c.ID, c.Zone)
	}
	return nil
}

// checkStaysOnTable refuses to take away a card that never leaves the table:
// a player's identity, or the card a stage shows. It may still move on the
// table, change state and have cards tucked under it.
func (t *Table) checkStaysOnTable(c *Card) error {
	if c.Identity {
		return invalid("the identity card stays on the table")
	}
	// The stage would be left with nothing on the table.
	if stage := t.stageShowing(c.ID); stage != nil {
		return invalid("the %s card stays on the table; choose another card to show", strings.ToLower(stage.Label))
	}
	return nil
}

// stageShowing returns the stage that shows card id, or nil.
func (t *Table) stageShowing(id string) *Stage {
	for _, stage := range t.Stages {
		if stage.Current == id {
			return stage
		}
	}
	return nil
}

// handOf returns the area of the hand holding id, or "" when none does.
func handOf(t *Table, id string) Area {
	for area, hand := range t.Hands {
		if slices.Contains(hand, id) {
			return area
		}
	}
	return ""
}

// leave takes c out of its current place and resets it. A main card leaving
// the table discards the cards it carries (see carried and
// tuckedDestination), from the last card of its stack up; a tucked card
// leaves its stack, which closes up (see detach). checkLeave must have
// succeeded first.
func (t *Table) leave(c *Card) {
	switch c.Zone {
	case ZoneTable:
		for _, child := range slices.Backward(t.carried(c)) {
			t.removeArrows(child.ID)
			resetCard(child)
			pile, bottom, _ := t.tuckedDestination(child)
			if bottom {
				t.pushUnderPile(pile, child)
			} else {
				t.pushOnPile(pile, child)
			}
		}
		if c.Parent != "" {
			t.detach(c)
		}
		t.removeArrows(c.ID)
	case ZoneHand:
		area := handOf(t, c.ID)
		t.Hands[area] = slices.DeleteFunc(t.Hands[area], func(id string) bool { return id == c.ID })
	case ZonePile:
		pile := t.Piles[c.Pile]
		pile.Cards = slices.DeleteFunc(pile.Cards, func(id string) bool { return id == c.ID })
	}
	resetCard(c)
}

// resetCard clears everything a card carries while it is in play, its place on
// the table included: a card in a hand or a pile keeping its last spot would
// let a viewer tie it to the card they saw there, under any new id. Every way
// onto the table places it again (placeOnTable, layOutStack, applyChooseStage).
func resetCard(c *Card) {
	c.X, c.Y, c.Z = 0, 0, 0
	c.Face = 0
	c.FaceDown = false
	c.Exhausted = false
	c.Tokens = nil
	c.Status = nil
	c.Mods = nil
	c.Parent = ""
	c.OnPile = ""
}

// pushOnPile puts c on top of pile.
func (t *Table) pushOnPile(pile *Pile, c *Card) {
	pile.Cards = append(pile.Cards, c.ID)
	c.Zone = ZonePile
	c.Pile = pile.ID
}

// pushUnderPile puts c at the bottom of pile.
func (t *Table) pushUnderPile(pile *Pile, c *Card) {
	pile.Cards = slices.Insert(pile.Cards, 0, c.ID)
	c.Zone = ZonePile
	c.Pile = pile.ID
}

// applyMove moves a table card to a point. A main card takes its stack along;
// a tucked card leaves its stack (see detach) and lies there alone, on top.
func applyMove(t *Table, a Action) error {
	c, err := t.tableCard(a.Card)
	if err != nil {
		return err
	}

	if c.Parent != "" {
		t.detach(c)
	}
	c.X, c.Y = snap(a.X), snap(a.Y)
	c.OnPile = ""
	t.layOutStack(c)
	return nil
}

// applyDetach takes a tucked card off its stack and lays it alone at a point,
// as a move of a tucked card does (see applyMove): the stack closes up, and the
// card keeps its face, exhaustion and counters. The client picks the point as
// it picks a played card's, in the row of the stack (detachSlot,
// web/src/table/layout.ts). A main card is refused: it has nothing to leave.
func applyDetach(t *Table, a Action) error {
	c, err := t.tableCard(a.Card)
	if err != nil {
		return err
	}
	if c.Parent == "" {
		return invalid("card %q is tucked under no card", c.ID)
	}
	return applyMove(t, a)
}

func (t *Table) nextZ() int {
	z := t.NextZ
	t.NextZ++
	return z
}

func applyAttach(t *Table, a Action) error {
	c, err := t.tableCard(a.Card)
	if err != nil {
		return err
	}
	target, err := t.tableCard(a.Target)
	if err != nil {
		return err
	}
	if err := t.checkTuckTarget(c, target); err != nil {
		return err
	}

	t.tuckUnder(c, target)
	return nil
}

// checkTuckTarget refuses to tuck c under target when target is c itself or,
// c being a main card, a card of its stack: c would carry target along and
// make a cycle of attachments.
func (t *Table) checkTuckTarget(c, target *Card) error {
	if c == target {
		return invalid("card %q cannot be attached to itself", c.ID)
	}
	if slices.Contains(t.carried(c), target) {
		return invalid("card %q is tucked under %q", target.ID, c.ID)
	}
	return nil
}

// tuckUnder puts c at the end of the stack target belongs to, whichever card
// of that stack target is: c gets tucked under its last card. A main card
// comes with the cards it carries, a tucked card alone, out of its own stack
// (see detach), even when that is the stack of target. The stack is then
// laid out again (see layOutStack). checkTuckTarget must have succeeded
// first.
func (t *Table) tuckUnder(c, target *Card) {
	if c.Parent != "" {
		t.detach(c)
	}
	main := t.mainCard(target)
	last := main
	if tucked := t.chain(main); len(tucked) > 0 {
		last = tucked[len(tucked)-1]
	}
	c.Parent = last.ID
	c.OnPile = ""
	t.layOutStack(main)
}

func applyToHand(t *Table, a Action) error {
	c, err := t.card(a.Card)
	if err != nil {
		return err
	}
	if c.Owner == NoOwner {
		return invalid("encounter card %q cannot go to a hand", c.ID)
	}
	if err := t.checkLeave(c); err != nil {
		return err
	}

	t.leave(c)
	t.addToHand(PlayerArea(c.Owner), c)
	return nil
}

// addToHand puts c, which has just left its place, last in the hand of area.
func (t *Table) addToHand(area Area, c *Card) {
	if t.Hands == nil {
		t.Hands = map[Area][]string{}
	}
	t.Hands[area] = append(t.Hands[area], c.ID)
	c.Zone = ZoneHand
	c.Pile = ""
}

// toDeckID returns the id of the deck a toDeck action puts c into: the deck
// a.Pile names, or else c's home.
func toDeckID(c *Card, a Action) string {
	return cmp.Or(a.Pile, c.Home)
}

// checkTakes verifies that deck takes c: a deck takes the cards of its owner
// only, and a side deck only the cards of its own set (see Card.SideDeck). A
// player's deck takes that player's cards, those of their side decks too;
// the encounter decks and the scenario decks, owned by nobody, take the
// cards owned by nobody. No other pile is a deck.
func checkTakes(deck *Pile, c *Card) error {
	switch deck.Kind {
	case KindDeck, KindSideDeck, KindEncounter, KindScenarioDeck:
	default:
		return invalid("pile %q is not a deck", deck.ID)
	}
	if deck.Owner != c.Owner {
		return invalid("deck %q does not take card %q, which has another owner", deck.ID, c.ID)
	}
	if deck.Kind == KindSideDeck && c.SideDeck != deck.ID {
		return invalid("side deck %q does not take card %q, which is not one of its cards", deck.ID, c.ID)
	}
	return nil
}

// applyToDeck puts the card into the deck a names (see toDeckID), which
// becomes its home: discarded later, it goes where that deck's cards go (see
// discardPileID).
func applyToDeck(t *Table, a Action) error {
	c, err := t.card(a.Card)
	if err != nil {
		return err
	}
	deck, err := t.pile(toDeckID(c, a))
	if err != nil {
		return err
	}
	if err := checkTakes(deck, c); err != nil {
		return err
	}
	if err := t.checkLeave(c); err != nil {
		return err
	}

	switch a.Where {
	case whereTop:
		t.leave(c)
		deck.Cards = append(deck.Cards, c.ID)
	case whereBottom:
		t.leave(c)
		t.pushUnderPile(deck, c)
	case whereShuffle:
		// The caller resolved the shuffle: Cards is the whole new pile, and
		// Renames also covers the cards c carries that go to the bottom of
		// another deck (see renamedOnTheWay).
		shuffled := t.shuffledIntoDeck(c, deck)
		newIDs, err := checkFreshIDs(t, a.Renames, slices.Concat(shuffled, t.renamedOnTheWay(a)))
		if err != nil {
			return err
		}
		if !samePermutation(newIDs[:len(shuffled)], a.Cards) {
			return invalid("shuffle order is not a permutation of the renamed cards")
		}
		t.leave(c)
		renameCards(t, a.Renames)
		deck.Cards = cardList(a.Cards)
	default:
		return invalid("unknown position %q", a.Where)
	}
	c.Zone = ZonePile
	c.Pile = deck.ID
	c.Home = deck.ID
	return nil
}

// cardList returns a copy of the card list of an action, to become a pile or
// a hand. It is never nil, as no pile or hand is: an empty list is left out
// of a stored action, and replaying it must still give an empty list.
func cardList(ids []string) []string {
	return append([]string{}, ids...)
}

// without returns ids minus id, in a new slice.
func without(ids []string, id string) []string {
	return slices.DeleteFunc(slices.Clone(ids), func(other string) bool { return other == id })
}

func samePermutation(a, b []string) bool {
	return slices.Equal(slices.Sorted(slices.Values(a)), slices.Sorted(slices.Values(b)))
}

// applyDiscard puts the card on the pile it is discarded to (see
// discardPileID and discardTo).
func applyDiscard(t *Table, a Action) error {
	c, err := t.card(a.Card)
	if err != nil {
		return err
	}
	pile, ok := t.Piles[t.discardPileID(c)]
	if !ok {
		return invalid("no discard pile for card %q", c.ID)
	}
	if err := t.checkLeave(c); err != nil {
		return err
	}

	t.discardTo(pile, c)
	return nil
}

// discardTo moves c, wherever it is, to pile, the pile it is discarded to: at
// the bottom of a deck whose cards are discarded there (see
// discardsToBottom), as a toDeck at the bottom puts it, on top of any other
// pile. checkLeave must have succeeded first.
func (t *Table) discardTo(pile *Pile, c *Card) {
	t.leave(c)
	if pile.discardsToBottom() {
		t.pushUnderPile(pile, c)
		return
	}
	t.pushOnPile(pile, c)
}

func applyToPile(t *Table, a Action) error {
	c, err := t.card(a.Card)
	if err != nil {
		return err
	}
	if !isPlainTargetPile(a.Target) {
		return invalid("pile %q cannot receive cards", a.Target)
	}
	pile, ok := t.Piles[a.Target]
	if !ok {
		return invalid("unknown pile %q", a.Target)
	}
	if err := t.checkLeave(c); err != nil {
		return err
	}

	t.putOnPile(pile, c)
	return nil
}

// isPlainTargetPile reports whether id is a pile cards can be sent to by hand:
// the victory display, a scenario area or a set-aside pile. No deck or discard
// pile is one, so a side deck card never lands in a regular deck or discard
// pile this way.
func isPlainTargetPile(id string) bool {
	return id == PileVictory || id == PileScenarioAside ||
		strings.HasPrefix(id, scenarioAreaPrefix) || strings.HasPrefix(id, asidePrefix)
}

// landsFaceDown reports whether a card dropped out of pile lands face down: a
// player's deck, or a side deck that does not show its top card, hides its
// cards from everyone, its owner included, until the card is flipped. An
// explicit Play (Action.FaceUp) lands it face up all the same. A card out of
// a scenario deck lands face up, for everyone to see.
func landsFaceDown(pile *Pile) bool {
	return pile.Kind == KindDeck || pile.Kind == KindSideDeck && !pile.TopFaceUp
}

// applyPlay puts a card from a hand or a pile on the table: at a point, or,
// with a target, at the end of that table card's stack as attach does. It
// lands face up, but when dropped out of a pile that hides its cards (see
// landsFaceDown): an explicit Play (a.FaceUp) lands it face up there too. A
// card revealed on a deck is played as that deck's top card, as it lies: it is
// on the table already, and keeps its face, tokens and stack, as a moved or
// attached card does. A version of its owner's identity takes the identity
// over, and stays face up.
func applyPlay(t *Table, a Action) error {
	c, err := t.card(a.Card)
	if err != nil {
		return err
	}
	revealed := c.Zone == ZoneTable && c.OnPile != ""
	if c.Zone != ZoneHand && c.Zone != ZonePile && !revealed {
		return invalid("card %q is neither in a hand, in a pile nor revealed on one", c.ID)
	}
	var target *Card
	if a.Target != "" {
		// A revealed card is on the table already, its stack too: it cannot
		// be tucked under itself or a card it carries.
		if target, err = t.tableCard(a.Target); err != nil {
			return err
		}
		if err := t.checkTuckTarget(c, target); err != nil {
			return err
		}
	}
	if revealed {
		// It never leaves the table, so it carries everything it carried there:
		// it is attached as tuckUnder does, or moved as applyMove does.
		if c.IdentityVersion {
			t.takeOverIdentity(c)
		}
		if target != nil {
			t.tuckUnder(c, target)
			return nil
		}
		return applyMove(t, a)
	}
	if err := t.checkLeave(c); err != nil {
		return err
	}

	faceDown := !a.FaceUp && c.Zone == ZonePile && landsFaceDown(t.Piles[c.Pile])
	t.leave(c)
	if c.IdentityVersion {
		t.takeOverIdentity(c)
	}
	c.FaceDown = faceDown && !c.Identity
	t.enterTable(c, target, snap(a.X), snap(a.Y))
	return nil
}

// enterTable puts c, which has just left its hand or its pile, on the table:
// at x, y, or at the end of the stack of target when there is one (see
// tuckUnder), whose checks must have succeeded first.
func (t *Table) enterTable(c, target *Card, x, y int) {
	if target == nil {
		t.placeOnTable(c, x, y)
		return
	}
	c.Zone = ZoneTable
	c.Pile = ""
	t.tuckUnder(c, target)
}

// takeOverIdentity makes c, a version of its owner's identity entering play,
// that seat's identity. The identity it replaces becomes a version in turn:
// free to leave the table, it takes the identity back if it is played again.
// Other seats keep theirs.
func (t *Table) takeOverIdentity(c *Card) {
	for _, other := range t.Cards {
		if other.Identity && other.Owner == c.Owner {
			other.Identity = false
			other.IdentityVersion = true
		}
	}
	c.Identity = true
}

// Names of the tokens and statuses a card can carry. A stage change treats
// two tokens apart: a villain loses its damage, a main scheme keeps only its
// acceleration (see carryStageCounters).
const (
	tokenDamage       = "dmg"
	tokenThreat       = "thr"
	tokenCounter      = "gen"
	tokenAcceleration = "acc"

	statusStunned   = "stunned"
	statusConfused  = "confused"
	statusTough     = "tough"
	statusRetaliate = "retaliate"
	// statusLocked keeps a card from readying: it is exhausted as usual, but
	// neither an exhaust nor a Ready all readies it.
	statusLocked = "locked"
)

// Counter names a card can carry.
var (
	// tokenNames are the tokens a card can carry: damage, threat, generic
	// counters and acceleration, which players put on the main scheme when the
	// encounter deck runs out (bookkeeping only, like the others).
	tokenNames = []string{tokenDamage, tokenThreat, tokenCounter, tokenAcceleration}
	// statusNames are the statuses a card can carry, each with a count. The
	// count of statusRetaliate is the card's Retaliate value: sources add up.
	statusNames = []string{statusStunned, statusConfused, statusTough, statusRetaliate, statusLocked}
	// modifierNames are the stats a modifier changes, in the order cards
	// print them: the stat column, then the hit points.
	modifierNames = []string{"atk", "thw", "def", "sch", "rec", "hp"}
)

// applyExhaust sets the exhausted state resolve recorded (see
// resolveExhaust).
func applyExhaust(t *Table, a Action) error {
	c, err := t.inPlayCard(a.Card)
	if err != nil {
		return err
	}
	if a.Exhausted == nil {
		return invalid("exhaust of card %q has no resulting state", c.ID)
	}
	c.Exhausted = *a.Exhausted
	return nil
}

// applyReadyAll readies the cards resolve recorded (see resolveReadyAll).
func applyReadyAll(t *Table, a Action) error {
	if len(a.Cards) == 0 {
		return invalid("ready all has no card to ready")
	}
	cards := make([]*Card, 0, len(a.Cards))
	for _, id := range a.Cards {
		c, err := t.inPlayCard(id)
		if err != nil {
			return err
		}
		cards = append(cards, c)
	}
	for _, c := range cards {
		c.Exhausted = false
	}
	return nil
}

// faceCount returns the number of faces of c; cards built without a face
// count have a single face.
func faceCount(c *Card) int {
	return max(c.Faces, 1)
}

// applyFlip sets the side resolve recorded (see resolveFlip).
func applyFlip(t *Table, a Action) error {
	c, err := t.tableCard(a.Card)
	if err != nil {
		return err
	}
	if a.FaceDown == nil {
		return invalid("flip of card %q has no resulting side", c.ID)
	}
	if a.Face < 0 || a.Face >= faceCount(c) {
		return invalid("card %q has no face %d", c.ID, a.Face)
	}
	// A card revealed on a deck that turns face down is that deck's top card
	// again: it goes back on top of it, and the deck shows its back.
	if *a.FaceDown && c.OnPile != "" {
		deck, err := t.pile(c.OnPile)
		if err != nil {
			return err
		}
		if err := t.checkLeave(c); err != nil {
			return err
		}
		t.putOnPile(deck, c)
		return nil
	}
	c.Face = a.Face
	c.FaceDown = *a.FaceDown
	// The side a card shows may change its box, or whether it is a scheme.
	t.placeStack(t.mainCard(c))
	return nil
}

// applyCounter adds a.Delta to the counter a.Name of a card. The card function
// looks the card up: any table card for tokens, a card revealed on a deck
// included, a card in play only for statuses and modifiers (see inPlayCard).
// The field function selects the map (tokens, statuses or modifiers) and
// allowed lists its valid names. The counter is clamped to [lowest, highest]
// and deleted at 0: tokens and statuses never go below 0, modifiers are
// signed.
func applyCounter(
	card func(id string) (*Card, error),
	a Action,
	allowed []string,
	lowest, highest int,
	field func(*Card) *map[string]int,
) error {
	c, err := card(a.Card)
	if err != nil {
		return err
	}
	if !slices.Contains(allowed, a.Name) {
		return invalid("unknown counter %q", a.Name)
	}

	counters := field(c)
	value := min(max((*counters)[a.Name]+a.Delta, lowest), highest)
	if value == 0 {
		delete(*counters, a.Name)
		return nil
	}
	if *counters == nil {
		*counters = map[string]int{}
	}
	(*counters)[a.Name] = value
	return nil
}

func applyChooseStage(t *Table, a Action) error {
	stage := t.stage(a.Stage)
	if stage == nil {
		return invalid("unknown stage %q", a.Stage)
	}
	if !slices.Contains(stage.Cards, a.Card) {
		return invalid("card %q is not in stage %q", a.Card, stage.Key)
	}
	chosen, err := t.card(a.Card)
	if err != nil {
		return err
	}
	if a.Face < 0 || a.Face >= faceCount(chosen) {
		return invalid("card %q has no face %d", chosen.ID, a.Face)
	}
	if chosen.ID == stage.Current {
		chosen.Face = a.Face
		t.placeStack(t.mainCard(chosen))
		return nil
	}
	previous, err := t.tableCard(stage.Current)
	if err != nil {
		return err
	}
	if chosen.Zone != ZoneStage {
		return invalid("card %q is not waiting in the stage zone", chosen.ID)
	}

	// The chosen card takes the place of the previous one in its stack.
	if next := t.tuckedUnder(previous.ID); next != nil {
		next.Parent = chosen.ID
	}
	chosen.Zone = ZoneTable
	chosen.X, chosen.Y, chosen.Z = previous.X, previous.Y, previous.Z
	chosen.Parent = previous.Parent
	chosen.Face = a.Face
	carryStageCounters(stage, previous, chosen)

	t.removeArrows(previous.ID)
	previous.Zone = ZoneStage
	previous.X, previous.Y, previous.Z = 0, 0, 0
	previous.Parent = ""
	previous.Exhausted = false
	stage.Current = chosen.ID
	// The chosen card may not have the box of the previous one, or not be a
	// scheme when it was, or the other way round.
	t.placeStack(t.mainCard(chosen))
	return nil
}

// carryStageCounters moves to chosen the counters of previous that survive a
// stage change, replacing its own, and clears previous, which leaves the game.
// As the rules have it, a villain keeps everything but its excess damage, and
// a main scheme keeps only its acceleration tokens (its threat does not carry
// over). Undo restores previous through the action history.
func carryStageCounters(stage *Stage, previous, chosen *Card) {
	if stage.Villain {
		tokens := maps.Clone(previous.Tokens)
		delete(tokens, tokenDamage)
		chosen.Tokens = nilIfEmpty(tokens)
		chosen.Status = nilIfEmpty(maps.Clone(previous.Status))
		chosen.Mods = nilIfEmpty(maps.Clone(previous.Mods))
	} else {
		chosen.Tokens = nil
		if n := previous.Tokens[tokenAcceleration]; n > 0 {
			chosen.Tokens = map[string]int{tokenAcceleration: n}
		}
		chosen.Status = nil
		chosen.Mods = nil
	}
	previous.Tokens = nil
	previous.Status = nil
	previous.Mods = nil
}

// nilIfEmpty returns m, or nil when it has no entry: cards carry no empty
// counter maps.
func nilIfEmpty(m map[string]int) map[string]int {
	if len(m) == 0 {
		return nil
	}
	return m
}

// stage returns the stage with the given key, or nil.
func (t *Table) stage(key string) *Stage {
	for _, s := range t.Stages {
		if s.Key == key {
			return s
		}
	}
	return nil
}

// removeArrows deletes every arrow that starts or ends at card id. It runs
// whenever a card leaves the table, so no arrow points at a missing card.
func (t *Table) removeArrows(id string) {
	t.Arrows = slices.DeleteFunc(t.Arrows, func(ar Arrow) bool {
		return ar.From == id || ar.To == id
	})
}

// topCards returns the n top cards of pile, top first.
func topCards(pile *Pile, n int) []string {
	return topOf(pile.Cards, n)
}

// topOf returns the n top cards of cards, a pile listed bottom to top, top
// first.
func topOf(cards []string, n int) []string {
	top := slices.Clone(cards[len(cards)-n:])
	slices.Reverse(top)
	return top
}

// checkInPile verifies that ids names at least one card, each card once, and
// that every one of them lies in pile.
func checkInPile(pile *Pile, ids []string) error {
	if len(ids) == 0 {
		return invalid("no card of pile %q is given", pile.ID)
	}
	seen := make(map[string]bool, len(ids))
	for _, id := range ids {
		if seen[id] {
			return invalid("card %q is given twice", id)
		}
		seen[id] = true
		if !slices.Contains(pile.Cards, id) {
			return invalid("card %q is not in pile %q", id, pile.ID)
		}
	}
	return nil
}

// pile returns the pile with the given id, or an ErrInvalid error.
func (t *Table) pile(id string) (*Pile, error) {
	pile, ok := t.Piles[id]
	if !ok {
		return nil, invalid("unknown pile %q", id)
	}
	return pile, nil
}

// putOnPile moves c, wherever it is, on top of pile. checkLeave must have
// succeeded first.
func (t *Table) putOnPile(pile *Pile, c *Card) {
	t.leave(c)
	t.pushOnPile(pile, c)
}

// placeOnTable puts c, which has just left a pile, on the table.
func (t *Table) placeOnTable(c *Card, x, y int) {
	c.Zone = ZoneTable
	c.Pile = ""
	c.X, c.Y = x, y
	c.Z = t.nextZ()
}

// applyDraw moves the recorded cards from the deck to the hand, in the recorded
// order. Resolve records the top cards, but an undo may have put other cards
// above them since: they are taken wherever they are in the deck. The deck is
// the one a.Pile names, or the deck of the hand's seat when it names none.
func applyDraw(t *Table, a Action) error {
	if !validArea(a.Area) {
		return invalid("area %q has no hand", a.Area)
	}
	deck, err := t.pile(drawDeckID(a, a.Area))
	if err != nil {
		return err
	}
	if deck.Owner == NoOwner || PlayerArea(deck.Owner) != a.Area {
		return invalid("cards of pile %q do not go to hand %q", deck.ID, a.Area)
	}
	if err := checkInPile(deck, a.Cards); err != nil {
		return err
	}

	for _, id := range a.Cards {
		c := t.Cards[id]
		t.leave(c)
		t.addToHand(a.Area, c)
	}
	return nil
}

// applyReveal reveals the recorded card wherever it is in its deck (see
// applyDraw): the deck a.Pile names, or the encounter deck when it names none.
func applyReveal(t *Table, a Action) error {
	deck, err := t.pile(cmp.Or(a.Pile, PileEncounter))
	if err != nil {
		return err
	}
	if !revealable(deck) {
		return invalid("the top card of pile %q cannot be revealed", deck.ID)
	}
	if len(t.revealedOn(deck.ID)) > 0 {
		return invalid("a card is already revealed on pile %q", deck.ID)
	}
	if len(a.Cards) != 1 {
		return invalid("reveal takes exactly one card, not %d", len(a.Cards))
	}
	if err := checkInPile(deck, a.Cards); err != nil {
		return err
	}

	c := t.Cards[a.Cards[0]]
	t.leave(c)
	t.placeOnTable(c, deck.X, deck.Y)
	c.OnPile = deck.ID
	return nil
}

// revealable reports whether the top card of pile can be revealed onto it:
// an encounter deck's, a scenario deck's, a player's deck's, or a side deck's
// that hides its top card. A side deck showing its top card has nothing to
// reveal.
func revealable(pile *Pile) bool {
	switch pile.Kind {
	case KindEncounter, KindScenarioDeck, KindDeck:
		return true
	case KindSideDeck:
		return !pile.TopFaceUp
	default:
		return false
	}
}

// revealedOn returns the table cards lying revealed on top of the pile with
// the given id, from the lowest Z to the highest; none for an empty id.
func (t *Table) revealedOn(id string) []*Card {
	if id == "" {
		return nil
	}
	var found []*Card
	for _, c := range t.Cards {
		if c.Zone == ZoneTable && c.OnPile == id {
			found = append(found, c)
		}
	}
	slices.SortFunc(found, byZThenID)
	return found
}

// deckCards returns the cards of pile, bottom to top, as its deck actions
// see them: the cards revealed on it lie above its top (see coveredFor).
func (t *Table) deckCards(pile *Pile) []string {
	cards := slices.Clone(pile.Cards)
	for _, c := range t.revealedOn(pile.ID) {
		cards = append(cards, c.ID)
	}
	return cards
}

// coveredFor returns the table as a sees it. A card revealed on a deck still
// counts as that deck's top card: when a takes, reorders or shuffles the top
// of a deck with cards revealed on it (see actedDeck), they lie back on top
// of that deck, face down, in a copy of t. Otherwise it returns t itself.
// hand is the hand of the deck a draw naming no pile takes from. It also
// returns the cards covering hides (see hiddenByCovering), which get new ids
// before a is performed: resolveOnTable picks them, apply gives them.
func (t *Table) coveredFor(a Action, hand Area) (*Table, []string, error) {
	deckID := t.actedDeck(a, hand)
	covering := t.revealedOn(deckID)
	if len(covering) == 0 {
		return t, nil, nil
	}
	if _, err := t.pile(deckID); err != nil {
		return nil, nil, err
	}
	for _, c := range covering {
		if err := t.checkLeave(c); err != nil {
			return nil, nil, err
		}
	}

	covered := t.Clone()
	deck := covered.Piles[deckID]
	for _, c := range covering {
		covered.putOnPile(deck, covered.Cards[c.ID])
	}
	return covered, t.hiddenByCovering(a, deckID, covering), nil
}

// hiddenByCovering returns the cards that covering deckID for a takes out of
// sight under ids everybody saw (see renamedOnTheWay): the cards tucked under
// the covering cards that drop to the bottom of a deck (see tuckedUnderDecks),
// and the covering cards themselves when a puts a card over them. It leaves
// out a's own card, which a moves on, and the cards a shuffle of deckID
// renames anyway.
func (t *Table) hiddenByCovering(a Action, deckID string, covering []*Card) []string {
	var ids []string
	for _, c := range covering {
		if a.Kind == ActToDeck && a.Where == whereTop {
			ids = append(ids, c.ID)
		}
		for _, id := range t.tuckedUnderDecks(c) {
			// A card drops to the bottom of its home deck.
			shuffled := producesShuffle(a) && t.Cards[id].Home == deckID
			if id != a.Card && !shuffled {
				ids = append(ids, id)
			}
		}
	}
	return ids
}

// actedDeck returns the id of the deck whose top a takes, reorders or
// shuffles, or "" when a does none of that. hand is the hand of the deck a
// draw naming no pile takes from. A play takes a revealed card as it lies,
// face up (see applyPlay): it covers nothing.
func (t *Table) actedDeck(a Action, hand Area) string {
	switch a.Kind {
	case ActDraw:
		return drawDeckID(a, hand)
	case ActDiscardTop, ActReorderTop, ActShuffle:
		return a.Pile
	case ActDeal:
		return cmp.Or(a.Pile, PileEncounter)
	case ActShuffleIn:
		return cmp.Or(a.Target, PileEncounter)
	case ActShuffleBack:
		deckID, _ := deckOfDiscard(a.Pile)
		return deckID
	case ActToDeck:
		// A card put on top of a deck, or shuffled into it, goes over or among
		// the card revealed there; the revealed card itself goes as it is.
		c, ok := t.Cards[a.Card]
		if !ok {
			return ""
		}
		deckID := toDeckID(c, a)
		if (a.Where == whereTop || a.Where == whereShuffle) && c.OnPile != deckID {
			return deckID
		}
	}
	return ""
}

// applyDeal deals the recorded encounter card face down, wherever it is in the
// encounter deck a.Pile names, or the classic one (see applyDraw). A card
// revealed on the deck is back in it (see coveredFor), so a revealed card can
// be dealt too, though not under itself: back in the deck, it is no table
// card. The card goes to the action's position or, with a target, to the end
// of that table card's stack as a play does (see applyPlay). Its area only
// names the recipient, for the history.
func applyDeal(t *Table, a Action) error {
	if !validArea(a.Area) {
		return invalid("unknown recipient %q", a.Area)
	}
	enc, err := t.pile(cmp.Or(a.Pile, PileEncounter))
	if err != nil {
		return err
	}
	if enc.Kind != KindEncounter {
		return invalid("cards are dealt from an encounter deck, not from %q", enc.ID)
	}
	if len(a.Cards) != 1 {
		return invalid("deal takes exactly one card, not %d", len(a.Cards))
	}
	if err := checkInPile(enc, a.Cards); err != nil {
		return err
	}
	var target *Card
	if a.Target != "" {
		if target, err = t.tableCard(a.Target); err != nil {
			return err
		}
	}

	c := t.Cards[a.Cards[0]]
	t.leave(c)
	c.FaceDown = true
	t.enterTable(c, target, snap(a.X), snap(a.Y))
	return nil
}

// deckDiscardPrefixes pairs the id prefix of each kind of deck pile, but the
// classic encounter deck, with the id prefix of its discard pile.
var deckDiscardPrefixes = []struct{ deck, discard string }{
	{scenarioEncounterPrefix, scenarioEncounterDiscardPrefix},
	{scenarioDeckPrefix, scenarioDiscardPrefix},
	{deckPrefix, discardPrefix},
	{sideDeckPrefix, sideDiscardPrefix},
}

// deckOfDiscard returns the id of the deck a discard pile shuffles back into.
func deckOfDiscard(discardID string) (string, bool) {
	if discardID == PileEncounterDiscard {
		return PileEncounter, true
	}
	for _, prefixes := range deckDiscardPrefixes {
		if rest, ok := strings.CutPrefix(discardID, prefixes.discard); ok {
			return prefixes.deck + rest, true
		}
	}
	return "", false
}

// discardOf returns the id of the pile the top cards of deck are discarded
// to: the pile a side deck or a scenario deck records (see Pile.Discard), the
// deck itself when they go to its bottom, empty when its cards are never
// discarded, the encounter discard pile for the encounter deck, the seat's
// discard pile for a player's deck, and empty for a pile that is no deck.
func discardOf(deck *Pile) string {
	switch {
	case ruledDeckID(deck.ID):
		return deck.Discard
	case deck.ID == PileEncounter:
		return PileEncounterDiscard
	case deck.Kind == KindDeck:
		return playerDiscardID(PlayerArea(deck.Owner))
	default:
		return ""
	}
}

// applyDiscardTop discards the recorded cards, wherever they are in the deck
// (see applyDraw), in the recorded order (see discardTo). A deck whose cards
// are discarded to its bottom takes its top cards under it, one after the
// other, as so many discards of its top card would. They keep their ids, as
// the cards of a reorder do (see resolveReorderTop): they stay in their deck.
func applyDiscardTop(t *Table, a Action) error {
	deck, err := t.pile(a.Pile)
	if err != nil {
		return err
	}
	discard, ok := t.Piles[discardOf(deck)]
	if !ok {
		return invalid("pile %q has no discard pile", deck.ID)
	}
	if err := checkInPile(deck, a.Cards); err != nil {
		return err
	}

	for _, id := range a.Cards {
		t.discardTo(discard, t.Cards[id])
	}
	return nil
}

func applyShuffle(t *Table, a Action) error {
	pile, err := t.pile(a.Pile)
	if err != nil {
		return err
	}
	if err := checkRenames(t, a, pile.Cards); err != nil {
		return err
	}
	renameCards(t, a.Renames)
	pile.Cards = cardList(a.Cards)
	return nil
}

func applyShuffleBack(t *Table, a Action) error {
	deckID, ok := deckOfDiscard(a.Pile)
	if !ok {
		return invalid("pile %q is not a discard pile", a.Pile)
	}
	return mergeAndOrder(t, a, deckID, func(*Card) bool { return true })
}

func applyShuffleIn(t *Table, a Action) error {
	source, err := t.pile(a.Pile)
	if err != nil {
		return err
	}
	if source.Kind != KindAside {
		return invalid("pile %q is not a set-aside pile", a.Pile)
	}
	deckID := cmp.Or(a.Target, PileEncounter)
	deck, err := t.pile(deckID)
	if err != nil {
		return err
	}
	if deck.Kind != KindEncounter && deck.Kind != KindScenarioDeck {
		return invalid("pile %q is not an encounter or scenario deck", deckID)
	}
	return mergeAndOrder(t, a, deckID, func(c *Card) bool { return c.Home == deckID })
}

// mergeAndOrder moves the cards of the source pile accepted by wanted into
// the destination pile, then gives every card of the destination a new id and
// sets the destination order to a.Cards (see checkRenames).
func mergeAndOrder(t *Table, a Action, destID string, wanted func(*Card) bool) error {
	source, err := t.pile(a.Pile)
	if err != nil {
		return err
	}
	dest, err := t.pile(destID)
	if err != nil {
		return err
	}
	var moving []string
	for _, id := range source.Cards {
		if wanted(t.Cards[id]) {
			moving = append(moving, id)
		}
	}
	if err := checkRenames(t, a, append(slices.Clone(dest.Cards), moving...)); err != nil {
		return err
	}

	for _, id := range moving {
		t.putOnPile(dest, t.Cards[id])
	}
	renameCards(t, a.Renames)
	dest.Cards = cardList(a.Cards)
	return nil
}

func applyReorderTop(t *Table, a Action) error {
	pile, err := t.pile(a.Pile)
	if err != nil {
		return err
	}
	if len(a.Cards) == 0 || len(a.Cards) > len(pile.Cards) {
		return invalid("cannot reorder %d cards of pile %q", len(a.Cards), pile.ID)
	}
	if !samePermutation(topCards(pile, len(a.Cards)), a.Cards) {
		return invalid("reordered cards are not the top of pile %q", pile.ID)
	}
	// A reorder that took a revealed card back renames the cards it reorders
	// (see resolveReorderTop).
	if a.Renames != nil {
		if _, err := checkFreshIDs(t, a.Renames, a.Cards); err != nil {
			return err
		}
	}

	// Cards is top first, the pile is stored bottom to top.
	reordered := slices.Clone(a.Cards)
	slices.Reverse(reordered)
	copy(pile.Cards[len(pile.Cards)-len(reordered):], reordered)
	if a.Renames != nil {
		renameInViews(t, a.Renames)
		renameCards(t, a.Renames)
	}
	return nil
}

// renameInViews gives the renamed cards of the open views their new ids: the
// player who reordered the top of their deck, or who looks at a revealed card
// covered by a card put on top, keeps looking at those cards. A view that did
// not hold a card learns none of its ids.
func renameInViews(t *Table, renames map[string]string) {
	for _, view := range t.Views {
		for i, id := range view.Cards {
			if renamed, ok := renames[id]; ok {
				view.Cards[i] = renamed
			}
		}
	}
}

func applyHandOrder(t *Table, a Action) error {
	if !validArea(a.Area) {
		return invalid("area %q has no hand", a.Area)
	}
	if !samePermutation(t.Hands[a.Area], a.Cards) {
		return invalid("hand order of %q is not a permutation of the hand", a.Area)
	}
	if t.Hands == nil {
		t.Hands = map[Area][]string{}
	}
	t.Hands[a.Area] = cardList(a.Cards)
	return nil
}

// marker returns the position of the table marker called name, or nil when
// there is no such marker (an unknown name, the first player token of a
// single-seat game, or the active counter of a scenario without one).
func (t *Table) marker(name string) *Point {
	switch name {
	case MarkerFirstPlayer:
		return t.FirstPlayer
	case MarkerActive:
		return t.Active
	}
	return nil
}

func applyMarker(t *Table, a Action) error {
	p := t.marker(a.Name)
	if p == nil {
		return invalid("no marker %q on the table", a.Name)
	}
	*p = Point{X: snap(a.X), Y: snap(a.Y)}
	return nil
}

func validSeat(seat int) bool {
	return seat >= 0 && seat < maxSeats
}

func applyArrowAdd(t *Table, a Action) error {
	if !validSeat(a.Seat) {
		return invalid("unknown seat %d", a.Seat)
	}
	from, err := t.tableCard(a.Card)
	if err != nil {
		return err
	}
	to, err := t.tableCard(a.Target)
	if err != nil {
		return err
	}
	if from == to {
		return invalid("arrow cannot start and end at card %q", from.ID)
	}
	t.Arrows = append(t.Arrows, Arrow{From: from.ID, To: to.ID, Seat: a.Seat})
	return nil
}

// applyArrowClear clears the arrows of every seat a.Seats lists, or of
// a.Seat alone when a.Seats is empty.
func applyArrowClear(t *Table, a Action) error {
	seats := a.Seats
	if len(seats) == 0 {
		seats = []int{a.Seat}
	}
	for _, seat := range seats {
		if !validSeat(seat) {
			return invalid("unknown seat %d", seat)
		}
	}
	t.Arrows = slices.DeleteFunc(t.Arrows, func(ar Arrow) bool { return slices.Contains(seats, ar.Seat) })
	return nil
}
