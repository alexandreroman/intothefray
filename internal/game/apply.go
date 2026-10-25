package game

import (
	"cmp"
	"fmt"
	"math"
	"slices"
	"strings"
)

// Positions inside a card stack: an attached card sits this far below its
// target.
const attachOffsetY = 20

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
// revealed on its deck back on top of it (see coveredFor).
func apply(t *Table, a Action) error {
	covered, err := t.coveredFor(a, a.Area)
	if err != nil {
		return err
	}
	if err := applyAction(covered, a); err != nil {
		return err
	}
	if covered != t {
		*t = *covered
	}
	return nil
}

// applyAction performs a on t, as apply does, on the table as a sees it.
func applyAction(t *Table, a Action) error {
	switch a.Kind {
	case ActMove:
		return applyMove(t, a)
	case ActAttach:
		return applyAttach(t, a)
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
		return applyCounter(t, a, tokenNames, 0, math.MaxInt, func(c *Card) *map[string]int { return &c.Tokens })
	case ActStatus:
		return applyCounter(t, a, statusNames, 0, math.MaxInt, func(c *Card) *map[string]int { return &c.Status })
	case ActModifier:
		return applyCounter(t, a, modifierNames, -maxCount, maxCount, func(c *Card) *map[string]int { return &c.Mods })
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
		return fmt.Errorf("%w: unknown action kind %q", ErrInvalid, a.Kind)
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

func invalid(format string, args ...any) error {
	return fmt.Errorf("%w: %s", ErrInvalid, fmt.Sprintf(format, args...))
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
// exhausted nor given tokens, statuses or modifiers until it leaves it.
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
	for seat := range maxSeats {
		if a == PlayerArea(seat) {
			return true
		}
	}
	return false
}

// isScenarioDeckID reports whether id names a scenario deck, encounter or not.
func isScenarioDeckID(id string) bool {
	return strings.HasPrefix(id, scenarioEncounterPrefix) || strings.HasPrefix(id, scenarioDeckPrefix)
}

// discardPileID returns the id of the pile where c is discarded: the discard
// pile of its side deck or scenario deck for a card of one, which may not
// exist, or else the discard pile of its owner (the encounter discard pile for
// a card owned by nobody).
func discardPileID(c *Card) string {
	if isSideDeckID(c.Home) || isScenarioDeckID(c.Home) {
		discardID, _ := discardPileOf(c.Home)
		return discardID
	}
	if c.Owner == NoOwner {
		return PileEncounterDiscard
	}
	return "disc:" + string(PlayerArea(c.Owner))
}

// tuckedDestination returns the pile a card tucked under a card leaving the
// table goes to: its discard pile, on top. A side deck or scenario deck card
// whose deck has no discard pile goes to the bottom of its deck instead (bottom is
// then true), as Daredevil's Sense cards do, so that it never keeps its host
// on the table. ok is false when there is no such pile.
func (t *Table) tuckedDestination(c *Card) (pile *Pile, bottom, ok bool) {
	if pile, ok := t.Piles[discardPileID(c)]; ok {
		return pile, false, true
	}
	if isSideDeckID(c.Home) || isScenarioDeckID(c.Home) {
		if home, ok := t.Piles[c.Home]; ok {
			return home, true, true
		}
	}
	return nil, false, false
}

// shuffledIntoDeck returns the cards a shuffle of c into deck, its home,
// gathers: the cards of deck, the cards tucked under c that leaving the table
// sends to deck (see tuckedDestination), then c.
func (t *Table) shuffledIntoDeck(c *Card, deck *Pile) []string {
	cards := without(deck.Cards, c.ID)
	if c.Zone == ZoneTable {
		for _, child := range t.descendants(c.ID) {
			if pile, _, ok := t.tuckedDestination(child); ok && pile == deck {
				cards = append(cards, child.ID)
			}
		}
	}
	return append(cards, c.ID)
}

// descendants returns every card tucked under id, directly or not, from the
// lowest Z to the highest.
func (t *Table) descendants(id string) []*Card {
	var found []*Card
	seen := map[string]bool{id: true}
	queue := []string{id}
	for len(queue) > 0 {
		parent := queue[0]
		queue = queue[1:]
		for _, c := range t.Cards {
			if c.Parent == parent && !seen[c.ID] {
				seen[c.ID] = true
				found = append(found, c)
				queue = append(queue, c.ID)
			}
		}
	}
	slices.SortFunc(found, func(a, b *Card) int {
		return cmp.Or(cmp.Compare(a.Z, b.Z), cmp.Compare(a.ID, b.ID))
	})
	return found
}

// checkLeave verifies that c can be taken out of its current place and that
// everything tucked under it has a discard pile to go to.
func (t *Table) checkLeave(c *Card) error {
	switch c.Zone {
	case ZoneTable:
		if err := t.checkStaysOnTable(c); err != nil {
			return err
		}
		for _, child := range t.descendants(c.ID) {
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
	return t.checkNotStageCurrent(c)
}

// checkNotStageCurrent refuses to take away the card a stage shows: the stage
// would be left with nothing on the table.
func (t *Table) checkNotStageCurrent(c *Card) error {
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

// leave takes c out of its current place and resets it. Cards tucked under
// it are discarded (see tuckedDestination). checkLeave must have succeeded
// first.
func (t *Table) leave(c *Card) {
	switch c.Zone {
	case ZoneTable:
		for _, child := range t.descendants(c.ID) {
			t.removeArrows(child.ID)
			resetCard(child)
			pile, bottom, _ := t.tuckedDestination(child)
			if bottom {
				pile.Cards = slices.Insert(pile.Cards, 0, child.ID)
				child.Zone = ZonePile
				child.Pile = pile.ID
			} else {
				t.pushOnPile(pile, child)
			}
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

// resetCard clears everything a card carries while it is in play.
func resetCard(c *Card) {
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

func applyMove(t *Table, a Action) error {
	c, err := t.tableCard(a.Card)
	if err != nil {
		return err
	}

	x, y := snap(a.X), snap(a.Y)
	dx, dy := x-c.X, y-c.Y
	children := t.descendants(c.ID)

	// Children go just below the moved card, which takes the top Z.
	for _, child := range children {
		child.X += dx
		child.Y += dy
		child.Z = t.nextZ()
	}
	c.X, c.Y = x, y
	c.Z = t.nextZ()
	c.Parent = ""
	c.OnPile = ""
	return nil
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

	children := t.descendants(c.ID)
	x, y, z := tuckedPlace(target, a)
	dx, dy, dz := x-c.X, y-c.Y, z-c.Z
	for _, child := range children {
		child.X += dx
		child.Y += dy
		child.Z += dz
	}
	c.Parent = target.ID
	c.OnPile = ""
	c.X, c.Y, c.Z = x, y, z
	return nil
}

// checkTuckTarget refuses to tuck c under target when target is c itself or a
// card tucked beneath c: either would make a cycle of attachments.
func (t *Table) checkTuckTarget(c, target *Card) error {
	if c == target {
		return invalid("card %q cannot be attached to itself", c.ID)
	}
	if slices.Contains(t.descendants(c.ID), target) {
		return invalid("card %q is tucked under %q", target.ID, c.ID)
	}
	return nil
}

// tuckedPlace returns where a card tucked under target by a lies, one Z
// lower than target: where it was dropped (Action.Placed), snapped to the
// grid, or else just below target, so that its bottom edge shows.
func tuckedPlace(target *Card, a Action) (x, y, z int) {
	if a.Placed {
		return snap(a.X), snap(a.Y), target.Z - 1
	}
	return target.X, target.Y + attachOffsetY, target.Z - 1
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
	area := PlayerArea(c.Owner)
	if t.Hands == nil {
		t.Hands = map[Area][]string{}
	}
	t.Hands[area] = append(t.Hands[area], c.ID)
	c.Zone = ZoneHand
	c.Pile = ""
	return nil
}

func applyToDeck(t *Table, a Action) error {
	c, err := t.card(a.Card)
	if err != nil {
		return err
	}
	deck, ok := t.Piles[c.Home]
	if !ok {
		return invalid("card %q has no home pile %q", c.ID, c.Home)
	}
	if err := t.checkLeave(c); err != nil {
		return err
	}

	var newOrder []string
	switch a.Where {
	case whereTop, whereBottom:
	case whereShuffle:
		// The caller resolved the shuffle: Cards is the whole new pile.
		if err := checkRenames(t, a, t.shuffledIntoDeck(c, deck)); err != nil {
			return err
		}
		newOrder = cardList(a.Cards)
	default:
		return invalid("unknown position %q", a.Where)
	}

	t.leave(c)
	switch a.Where {
	case whereTop:
		deck.Cards = append(deck.Cards, c.ID)
	case whereBottom:
		deck.Cards = slices.Insert(deck.Cards, 0, c.ID)
	case whereShuffle:
		deck.Cards = append(deck.Cards, c.ID)
	}
	c.Zone = ZonePile
	c.Pile = deck.ID
	if a.Where == whereShuffle {
		renameCards(t, a.Renames)
		deck.Cards = newOrder
	}
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

func applyDiscard(t *Table, a Action) error {
	c, err := t.card(a.Card)
	if err != nil {
		return err
	}
	pile, ok := t.Piles[discardPileID(c)]
	if !ok {
		return invalid("no discard pile for card %q", c.ID)
	}
	if err := t.checkLeave(c); err != nil {
		return err
	}

	t.leave(c)
	t.pushOnPile(pile, c)
	return nil
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

	t.leave(c)
	t.pushOnPile(pile, c)
	return nil
}

// isPlainTargetPile reports whether id is a pile cards can be sent to by hand:
// the victory display or a set-aside pile. No deck or discard pile is one, so
// a side deck card never lands in a regular deck or discard pile this way.
func isPlainTargetPile(id string) bool {
	return id == PileVictory || id == PileScenarioAside || strings.HasPrefix(id, "aside:")
}

// landsFaceDown reports whether a card dropped out of pile lands face down: a
// player's deck, or a side deck that does not show its top card, hides its
// cards from everyone, its owner included, until the card is flipped. An
// explicit Play (Action.FaceUp) lands it face up all the same.
func landsFaceDown(pile *Pile) bool {
	return pile.Kind == KindDeck || pile.Kind == KindSideDeck && !pile.TopFaceUp
}

// applyPlay puts a card from a hand or a pile on the table: at a point, or,
// with a target, tucked under that table card as attach does. It lands face
// up, but when dropped out of a pile that hides its cards (see landsFaceDown):
// an explicit Play (a.FaceUp) lands it face up there too. A card revealed on a
// deck is played as that deck's top card, face up, as everybody saw it. A
// version of its owner's identity takes the identity over, and stays face up.
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
		// A revealed card is on the table already, its attachments too: it
		// cannot be tucked under itself or one of them.
		if target, err = t.tableCard(a.Target); err != nil {
			return err
		}
		if err := t.checkTuckTarget(c, target); err != nil {
			return err
		}
	}
	if err := t.checkLeave(c); err != nil {
		return err
	}

	faceDown := !a.FaceUp && c.Zone == ZonePile && landsFaceDown(t.Piles[c.Pile])
	t.leave(c)
	if c.IdentityVersion {
		t.takeOverIdentity(c)
	}
	c.Zone = ZoneTable
	c.Pile = ""
	c.FaceDown = faceDown && !c.Identity
	if target != nil {
		c.Parent = target.ID
		c.X, c.Y, c.Z = tuckedPlace(target, a)
		return nil
	}
	c.X, c.Y = snap(a.X), snap(a.Y)
	c.Z = t.nextZ()
	return nil
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

// statusLocked keeps a card from readying: it is exhausted as usual, but
// neither an exhaust nor a Ready all readies it.
const statusLocked = "locked"

// Counter names a card can carry.
var (
	// tokenNames are the tokens a card can carry: damage, threat, generic
	// counters and acceleration, which players put on the main scheme when the
	// encounter deck runs out (bookkeeping only, like the others).
	tokenNames = []string{"dmg", "thr", "gen", "acc"}
	// statusNames are the statuses a card can carry, each with a count. The
	// count of "retaliate" is the card's Retaliate value: sources add up.
	statusNames = []string{"stunned", "confused", "tough", "retaliate", statusLocked}
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
	return nil
}

// applyCounter adds a.Delta to the counter a.Name of a card. The field
// function selects the map (tokens, statuses or modifiers) and allowed lists
// its valid names. The counter is clamped to [lowest, highest] and deleted at
// 0: tokens and statuses never go below 0, modifiers are signed.
func applyCounter(t *Table, a Action, allowed []string, lowest, highest int, field func(*Card) *map[string]int) error {
	c, err := t.inPlayCard(a.Card)
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
		return nil
	}
	previous, err := t.tableCard(stage.Current)
	if err != nil {
		return err
	}
	if chosen.Zone != ZoneStage {
		return invalid("card %q is not waiting in the stage zone", chosen.ID)
	}

	// The chosen card takes the place of the previous one, children included.
	for _, c := range t.Cards {
		if c.Parent == previous.ID {
			c.Parent = chosen.ID
		}
	}
	chosen.Zone = ZoneTable
	chosen.X, chosen.Y, chosen.Z = previous.X, previous.Y, previous.Z
	chosen.Parent = previous.Parent
	chosen.OnPile = previous.OnPile
	chosen.Face = a.Face
	chosen.FaceDown = false
	chosen.Exhausted = false

	// Tokens, statuses and modifiers stay on the previous card, so going back restores them.
	t.removeArrows(previous.ID)
	previous.Zone = ZoneStage
	previous.X, previous.Y, previous.Z = 0, 0, 0
	previous.Parent = ""
	previous.OnPile = ""
	previous.Exhausted = false
	stage.Current = chosen.ID
	return nil
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
// the one a.Pile names, or the deck of the hand's seat when it names none, as
// in the draws recorded before a draw could name its deck.
func applyDraw(t *Table, a Action) error {
	if !validArea(a.Area) {
		return invalid("area %q has no hand", a.Area)
	}
	deckID := "deck:" + string(a.Area)
	if a.Pile != "" {
		deckID = a.Pile
	}
	deck, err := t.pile(deckID)
	if err != nil {
		return err
	}
	if deck.Owner == NoOwner || PlayerArea(deck.Owner) != a.Area {
		return invalid("cards of pile %q do not go to hand %q", deck.ID, a.Area)
	}
	if err := checkInPile(deck, a.Cards); err != nil {
		return err
	}

	if t.Hands == nil {
		t.Hands = map[Area][]string{}
	}
	for _, id := range a.Cards {
		c := t.Cards[id]
		t.leave(c)
		t.Hands[a.Area] = append(t.Hands[a.Area], id)
		c.Zone = ZoneHand
		c.Pile = ""
	}
	return nil
}

// applyReveal reveals the recorded card wherever it is in its deck (see
// applyDraw): the deck a.Pile names, or the encounter deck when it names none,
// as in the reveals recorded before a player's deck could be revealed.
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
	slices.SortFunc(found, func(a, b *Card) int {
		return cmp.Or(cmp.Compare(a.Z, b.Z), cmp.Compare(a.ID, b.ID))
	})
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
// hand is the hand of the deck a draw naming no pile takes from.
func (t *Table) coveredFor(a Action, hand Area) (*Table, error) {
	deckID := t.actedDeck(a, hand)
	covering := t.revealedOn(deckID)
	if len(covering) == 0 {
		return t, nil
	}
	if _, err := t.pile(deckID); err != nil {
		return nil, err
	}
	for _, c := range covering {
		if err := t.checkLeave(c); err != nil {
			return nil, err
		}
	}

	covered := t.Clone()
	deck := covered.Piles[deckID]
	for _, c := range covering {
		covered.putOnPile(deck, covered.Cards[c.ID])
	}
	return covered, nil
}

// actedDeck returns the id of the deck whose top a takes, reorders or
// shuffles, or "" when a does none of that. hand is the hand of the deck a
// draw naming no pile takes from. A play takes a revealed card as it lies,
// face up (see applyPlay): it covers nothing.
func (t *Table) actedDeck(a Action, hand Area) string {
	switch a.Kind {
	case ActDraw:
		if a.Pile != "" {
			return a.Pile
		}
		return "deck:" + string(hand)
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
		// A card put on top of its deck, or shuffled into it, goes over or
		// among the card revealed there; the revealed card itself goes as it is.
		c, ok := t.Cards[a.Card]
		if ok && (a.Where == whereTop || a.Where == whereShuffle) && c.OnPile != c.Home {
			return c.Home
		}
	}
	return ""
}

// applyDeal deals the recorded encounter card face down, wherever it is in the
// encounter deck a.Pile names, or the classic one (see applyDraw). A card revealed on the deck is back in it
// (see coveredFor), so a revealed card can be dealt too. The card goes to the
// action's position; its area only names the recipient, for the history.
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

	c := t.Cards[a.Cards[0]]
	t.leave(c)
	t.placeOnTable(c, snap(a.X), snap(a.Y))
	c.FaceDown = true
	return nil
}

// deckOfDiscard returns the id of the deck a discard pile shuffles back into.
func deckOfDiscard(discardID string) (string, bool) {
	if discardID == PileEncounterDiscard {
		return PileEncounter, true
	}
	if key, ok := strings.CutPrefix(discardID, scenarioEncounterDiscardPrefix); ok {
		return scenarioEncounterPrefix + key, true
	}
	if key, ok := strings.CutPrefix(discardID, scenarioDiscardPrefix); ok {
		return scenarioDeckPrefix + key, true
	}
	if owner, ok := strings.CutPrefix(discardID, "disc:"); ok {
		return "deck:" + owner, true
	}
	if side, ok := strings.CutPrefix(discardID, sideDiscardPrefix); ok {
		return sideDeckPrefix + side, true
	}
	return "", false
}

// discardPileOf returns the id of the discard pile of a deck pile. A side
// deck or scenario deck may have no discard pile: the id it returns then names no pile.
func discardPileOf(deckID string) (string, bool) {
	if deckID == PileEncounter {
		return PileEncounterDiscard, true
	}
	if key, ok := strings.CutPrefix(deckID, scenarioEncounterPrefix); ok {
		return scenarioEncounterDiscardPrefix + key, true
	}
	if key, ok := strings.CutPrefix(deckID, scenarioDeckPrefix); ok {
		return scenarioDiscardPrefix + key, true
	}
	if owner, ok := strings.CutPrefix(deckID, "deck:"); ok {
		return "disc:" + owner, true
	}
	if side, ok := strings.CutPrefix(deckID, sideDeckPrefix); ok {
		return sideDiscardPrefix + side, true
	}
	return "", false
}

// applyDiscardTop discards the recorded cards, wherever they are in the deck
// (see applyDraw), in the recorded order.
func applyDiscardTop(t *Table, a Action) error {
	discardID, ok := discardPileOf(a.Pile)
	if !ok {
		return invalid("pile %q is not a deck", a.Pile)
	}
	deck, err := t.pile(a.Pile)
	if err != nil {
		return err
	}
	discard, err := t.pile(discardID)
	if err != nil {
		return err
	}
	if err := checkInPile(deck, a.Cards); err != nil {
		return err
	}

	for _, id := range a.Cards {
		t.putOnPile(discard, t.Cards[id])
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
	if !isPlainTargetPile(a.Pile) || a.Pile == PileVictory {
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
// player who reordered the top of their deck keeps looking at those cards.
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
// there is no such marker (an unknown name, or the active counter of a
// scenario without one).
func (t *Table) marker(name string) *Point {
	switch name {
	case MarkerFirstPlayer:
		return &t.FirstPlayer
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
