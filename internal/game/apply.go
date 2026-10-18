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
// first mutation, so an error leaves t untouched.
func apply(t *Table, a Action) error {
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
	case ActFlip:
		return applyFlip(t, a)
	case ActToken:
		return applyCounter(t, a, tokenNames, func(c *Card) *map[string]int { return &c.Tokens })
	case ActStatus:
		return applyCounter(t, a, statusNames, func(c *Card) *map[string]int { return &c.Status })
	case ActChooseStage:
		return applyChooseStage(t, a)
	default:
		return fmt.Errorf("%w: unknown action kind %q", ErrInvalid, a.Kind)
	}
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

func snap(v int) int {
	return int(math.Round(float64(v)/gridSize)) * gridSize
}

// validArea reports whether a is the villain side or a seat's side.
func validArea(a Area) bool {
	if a == AreaVillain {
		return true
	}
	for seat := range maxSeats {
		if a == PlayerArea(seat) {
			return true
		}
	}
	return false
}

// maxSeats is the number of seats at a table.
const maxSeats = 4

// discardPileID returns the id of the pile where c is discarded.
func discardPileID(c *Card) string {
	if c.Owner == NoOwner {
		return PileEncounterDiscard
	}
	return "disc:" + string(PlayerArea(c.Owner))
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
		for _, child := range t.descendants(c.ID) {
			if _, ok := t.Piles[discardPileID(child)]; !ok {
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
// it are discarded. checkLeave must have succeeded first.
func (t *Table) leave(c *Card) {
	switch c.Zone {
	case ZoneTable:
		for _, child := range t.descendants(c.ID) {
			resetCard(child)
			t.pushOnPile(t.Piles[discardPileID(child)], child)
		}
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
	if !validArea(a.Area) {
		return invalid("unknown area %q", a.Area)
	}

	x, y := snap(a.X), snap(a.Y)
	dx, dy := x-c.X, y-c.Y
	children := t.descendants(c.ID)

	// Children go just below the moved card, which takes the top Z.
	for _, child := range children {
		child.Area = a.Area
		child.X += dx
		child.Y += dy
		child.Z = t.nextZ()
	}
	c.Area, c.X, c.Y = a.Area, x, y
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
	if c == target {
		return invalid("card %q cannot be attached to itself", c.ID)
	}
	children := t.descendants(c.ID)
	if slices.Contains(children, target) {
		return invalid("card %q is tucked under %q", target.ID, c.ID)
	}

	x, y, z := target.X, target.Y+attachOffsetY, target.Z-1
	dx, dy, dz := x-c.X, y-c.Y, z-c.Z
	for _, child := range children {
		child.Area = target.Area
		child.X += dx
		child.Y += dy
		child.Z += dz
	}
	c.Parent = target.ID
	c.OnPile = ""
	c.Area, c.X, c.Y, c.Z = target.Area, x, y, z
	return nil
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
	c.Area = area
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
		expected := append(without(deck.Cards, c.ID), c.ID)
		if !samePermutation(expected, a.Cards) {
			return invalid("shuffle order of pile %q is not a permutation of its cards", deck.ID)
		}
		newOrder = slices.Clone(a.Cards)
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
		deck.Cards = newOrder
	}
	c.Zone = ZonePile
	c.Pile = deck.ID
	return nil
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
// the victory display or a set-aside pile.
func isPlainTargetPile(id string) bool {
	return id == PileVictory || id == PileScenarioAside || strings.HasPrefix(id, "aside:")
}

func applyPlay(t *Table, a Action) error {
	c, err := t.card(a.Card)
	if err != nil {
		return err
	}
	if c.Zone != ZoneHand {
		return invalid("card %q is not in a hand", c.ID)
	}
	if !validArea(a.Area) {
		return invalid("unknown area %q", a.Area)
	}
	if err := t.checkLeave(c); err != nil {
		return err
	}

	t.leave(c)
	c.Zone = ZoneTable
	c.Pile = ""
	c.Area, c.X, c.Y = a.Area, snap(a.X), snap(a.Y)
	c.Z = t.nextZ()
	return nil
}

// Counter names a card can carry.
var (
	tokenNames  = []string{"dmg", "thr", "gen"}
	statusNames = []string{"stunned", "confused", "tough"}
)

func applyExhaust(t *Table, a Action) error {
	c, err := t.tableCard(a.Card)
	if err != nil {
		return err
	}
	c.Exhausted = !c.Exhausted
	return nil
}

// faceCount returns the number of faces of c; cards built without a face
// count have a single face.
func faceCount(c *Card) int {
	return max(c.Faces, 1)
}

func applyFlip(t *Table, a Action) error {
	c, err := t.tableCard(a.Card)
	if err != nil {
		return err
	}
	if c.FaceDown {
		c.FaceDown = false
		return nil
	}
	c.Face = (c.Face + 1) % faceCount(c)
	return nil
}

// applyCounter adds a.Delta to the counter a.Name of a card. The field
// function selects the map (tokens or statuses) and allowed lists its valid
// names. A counter never goes below 0 and is deleted at 0.
func applyCounter(t *Table, a Action, allowed []string, field func(*Card) *map[string]int) error {
	c, err := t.tableCard(a.Card)
	if err != nil {
		return err
	}
	if !slices.Contains(allowed, a.Name) {
		return invalid("unknown counter %q", a.Name)
	}

	counters := field(c)
	value := max((*counters)[a.Name]+a.Delta, 0)
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
	for _, child := range t.descendants(previous.ID) {
		if child.Parent == previous.ID {
			child.Parent = chosen.ID
		}
	}
	chosen.Zone = ZoneTable
	chosen.Area, chosen.X, chosen.Y, chosen.Z = previous.Area, previous.X, previous.Y, previous.Z
	chosen.Parent = previous.Parent
	chosen.OnPile = previous.OnPile
	chosen.Face = a.Face
	chosen.FaceDown = false
	chosen.Exhausted = false

	// Tokens and statuses stay on the previous card, so going back restores them.
	previous.Zone = ZoneStage
	previous.Area, previous.X, previous.Y, previous.Z = "", 0, 0, 0
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
