package game

import (
	"fmt"
	"maps"
	"math/rand/v2"
	"slices"
)

// Kind names a type of action a player can perform at the table.
type Kind string

// Action kinds. They carry the Act prefix because the Kind* names are taken
// by PileKind.
const (
	ActMove    Kind = "move"
	ActAttach  Kind = "attach"
	ActToHand  Kind = "toHand"
	ActToDeck  Kind = "toDeck"
	ActDiscard Kind = "discard"
	ActToPile  Kind = "toPile"
	ActPlay    Kind = "play"

	ActExhaust     Kind = "exhaust"
	ActReadyAll    Kind = "readyAll"
	ActFlip        Kind = "flip"
	ActToken       Kind = "token"
	ActStatus      Kind = "status"
	ActChooseStage Kind = "chooseStage"

	ActDraw        Kind = "draw"
	ActReveal      Kind = "reveal"
	ActDeal        Kind = "deal"
	ActDiscardTop  Kind = "discardTop"
	ActShuffle     Kind = "shuffle"
	ActShuffleBack Kind = "shuffleBack"
	ActShuffleIn   Kind = "shuffleIn"
	ActReorderTop  Kind = "reorderTop"
	ActHandOrder   Kind = "handOrder"
	ActFirstPlayer Kind = "firstPlayer"
	ActArrowAdd    Kind = "arrowAdd"
	ActArrowClear  Kind = "arrowClear"
)

// Action is one resolved player action. Which fields matter depends on Kind;
// the others stay zero.
type Action struct {
	Kind   Kind   `json:"kind"`
	Card   string `json:"card,omitempty"`
	Target string `json:"target,omitempty"` // card id (attach, arrow, play under it) or pile id
	Pile   string `json:"pile,omitempty"`   // also the deck whose top card a play takes
	Area   Area   `json:"area,omitempty"`   // whose hand (draw, handOrder), who is dealt to (deal)
	X      int    `json:"x,omitempty"`
	Y      int    `json:"y,omitempty"`
	// Placed tells that X and Y are where a card tucked under Target was
	// dropped (attach, play under a card): it lies there, behind its host,
	// rather than at the default tucked offset (see tuckedPlace).
	Placed bool     `json:"placed,omitempty"`
	N      int      `json:"n,omitempty"`
	Name   string   `json:"name,omitempty"` // token or status name
	Delta  int      `json:"delta,omitempty"`
	Face   int      `json:"face,omitempty"`  // chosen stage face; resulting face of a flip
	Where  string   `json:"where,omitempty"` // "top" | "bottom" | "shuffle"
	Stage  string   `json:"stage,omitempty"`
	Cards  []string `json:"cards,omitempty"` // resolved: ids taken from a pile top (top first), new orders
	// Renames is filled by shuffles: the old id → new id of every card of the
	// shuffled pile. Cards then holds the new order, in new ids.
	Renames map[string]string `json:"renames,omitempty"`
	Seat    int               `json:"seat,omitempty"` // acting seat, filled server-side (arrows)
	// Exhausted and FaceDown are the state an exhaust or a flip leads to,
	// filled by resolve: replaying them on a rebuilt table sets that state
	// instead of toggling whatever the card shows there.
	Exhausted *bool `json:"exhausted,omitempty"`
	FaceDown  *bool `json:"faceDown,omitempty"`
}

// Limits applied to client-provided numbers.
const (
	maxCoordinate = 20000 // table coordinates are 0..maxCoordinate
	maxCount      = 99    // cards per draw/discard, and counter delta magnitude
)

// resolve checks that the player seated at seat may perform a, and fills the
// fields the client cannot decide: the acting seat, the cards drawn and the
// outcome of every shuffle. The returned action is what gets applied and
// recorded, so replaying it needs no randomness. g is never modified.
func resolve(g *Game, seat int, a Action, rng *rand.Rand) (Action, error) {
	if g.Table == nil {
		return Action{}, fmt.Errorf("%w: the game has no table", ErrPhase)
	}
	if seat < 0 || seat >= len(g.Players) {
		return Action{}, forbidden("seat %d is not at this table", seat)
	}
	if err := checkLimits(a); err != nil {
		return Action{}, err
	}
	if a.Area != "" && !g.seatedArea(a.Area) {
		return Action{}, invalid("unknown area %q", a.Area)
	}

	// The client never chooses who acts.
	a.Seat = seat
	t := g.Table

	switch a.Kind {
	case ActMove, ActToken, ActStatus, ActChooseStage, ActDiscard:
		return a, checkCards(t, seat, a.Card)
	case ActExhaust:
		return resolveExhaust(t, seat, a)
	case ActReadyAll:
		return resolveReadyAll(t, a)
	case ActFlip:
		return resolveFlip(t, seat, a)
	case ActAttach, ActArrowAdd:
		return a, checkCards(t, seat, a.Card, a.Target)
	case ActPlay:
		return resolvePlay(t, seat, a)
	case ActToHand:
		return resolveToHand(t, seat, a)
	case ActToDeck:
		return resolveToDeck(t, seat, a, rng)
	case ActToPile:
		return resolveToPile(t, seat, a)
	case ActReveal:
		return resolveReveal(t, a)
	case ActDeal:
		return resolveDeal(t, a)
	case ActFirstPlayer, ActArrowClear:
		return a, nil
	case ActDraw:
		return resolveDraw(t, seat, a)
	case ActHandOrder:
		return resolveHandOrder(seat, a)
	case ActDiscardTop:
		return resolveDiscardTop(t, seat, a)
	case ActReorderTop:
		_, err := ownPile(t, seat, a.Pile)
		return a, err
	case ActShuffle:
		return resolveShuffle(t, seat, a, rng)
	case ActShuffleBack:
		return resolveShuffleBack(t, seat, a, rng)
	case ActShuffleIn:
		return resolveShuffleIn(t, seat, a, rng)
	default:
		return Action{}, invalid("unknown action kind %q", a.Kind)
	}
}

// seatedArea reports whether area names the seat of a seated player.
func (g *Game) seatedArea(area Area) bool {
	for seat := range g.Players {
		if area == PlayerArea(seat) {
			return true
		}
	}
	return false
}

func forbidden(format string, args ...any) error {
	return fmt.Errorf("%w: %s", ErrForbidden, fmt.Sprintf(format, args...))
}

// checkLimits rejects numbers outside the ranges a client may send.
func checkLimits(a Action) error {
	if a.X < 0 || a.X > maxCoordinate || a.Y < 0 || a.Y > maxCoordinate {
		return invalid("position (%d,%d) is outside the table", a.X, a.Y)
	}
	if (a.Kind == ActToken || a.Kind == ActStatus) && (a.Delta < -maxCount || a.Delta > maxCount) {
		return invalid("delta %d is out of range", a.Delta)
	}
	if a.Kind == ActDiscardTop {
		return checkCount(a.N)
	}
	return nil
}

// checkCount verifies a number of cards.
func checkCount(n int) error {
	if n < 1 || n > maxCount {
		return invalid("count %d must be between 1 and %d", n, maxCount)
	}
	return nil
}

// checkPile verifies that seat may use pile. Decks and set-aside piles are
// private to their owner; so are discard piles when privateDiscard is set
// (piles operations), while cards lying in a discard pile stay shared.
func checkPile(pile *Pile, seat int, privateDiscard bool) error {
	private := pile.Kind == KindDeck || pile.Kind == KindAside ||
		(pile.Kind == KindDiscard && privateDiscard)
	if private && pile.Owner != NoOwner && pile.Owner != seat {
		return forbidden("pile %q belongs to another player", pile.ID)
	}
	return nil
}

// ownPile returns the pile with the given id when seat may operate on it.
func ownPile(t *Table, seat int, id string) (*Pile, error) {
	pile, err := t.pile(id)
	if err != nil {
		return nil, err
	}
	return pile, checkPile(pile, seat, true)
}

// checkCards verifies that seat may touch each card: nobody else's hand,
// deck or set-aside pile. Empty ids are skipped.
func checkCards(t *Table, seat int, ids ...string) error {
	for _, id := range ids {
		if id == "" {
			continue
		}
		c, err := t.card(id)
		if err != nil {
			return err
		}
		if err := checkCard(t, seat, c); err != nil {
			return err
		}
	}
	return nil
}

// usableCard returns the card with the given id when seat may touch it.
func usableCard(t *Table, seat int, id string) (*Card, error) {
	c, err := t.card(id)
	if err != nil {
		return nil, err
	}
	return c, checkCard(t, seat, c)
}

func checkCard(t *Table, seat int, c *Card) error {
	switch c.Zone {
	case ZoneHand:
		if owner := handOf(t, c.ID); owner != "" && owner != PlayerArea(seat) {
			return forbidden("card %q is in another player's hand", c.ID)
		}
	case ZonePile:
		if pile, ok := t.Piles[c.Pile]; ok {
			return checkPile(pile, seat, false)
		}
	}
	return nil
}

// resolveExhaust records whether the card ends exhausted (see
// Action.Exhausted). A locked card is exhausted, but never readied.
func resolveExhaust(t *Table, seat int, a Action) (Action, error) {
	c, err := usableTableCard(t, seat, a.Card)
	if err != nil {
		return a, err
	}
	if c.Exhausted && locked(c) {
		return a, invalid("card %q is locked: it does not ready", c.ID)
	}
	a.Exhausted = new(!c.Exhausted)
	return a, nil
}

// resolveReadyAll records the cards to ready: every exhausted table card,
// whoever owns it, but the locked ones, in id order. A rebuild readies those
// cards, whatever lies on the table then.
func resolveReadyAll(t *Table, a Action) (Action, error) {
	a.Cards = nil
	for _, id := range slices.Sorted(maps.Keys(t.Cards)) {
		c := t.Cards[id]
		if c.Zone == ZoneTable && c.Exhausted && !locked(c) {
			a.Cards = append(a.Cards, id)
		}
	}
	if len(a.Cards) == 0 {
		return a, invalid("no card on the table to ready")
	}
	return a, nil
}

// locked reports whether c carries the locked status, which keeps it from
// readying.
func locked(c *Card) bool {
	return c.Status[statusLocked] > 0
}

// resolveFlip records the side the card ends on: a face-down card turns face
// up, any other goes to its next face.
func resolveFlip(t *Table, seat int, a Action) (Action, error) {
	c, err := usableTableCard(t, seat, a.Card)
	if err != nil {
		return a, err
	}
	a.Face = c.Face
	if !c.FaceDown {
		a.Face = (c.Face + 1) % faceCount(c)
	}
	a.FaceDown = new(false)
	return a, nil
}

// usableTableCard returns the table card with the given id when seat may
// touch it.
func usableTableCard(t *Table, seat int, id string) (*Card, error) {
	c, err := usableCard(t, seat, id)
	if err != nil {
		return nil, err
	}
	if c.Zone != ZoneTable {
		return nil, invalid("card %q is not on the table", id)
	}
	return c, nil
}

func resolveToHand(t *Table, seat int, a Action) (Action, error) {
	c, err := usableCard(t, seat, a.Card)
	if err != nil {
		return a, err
	}
	if c.Owner == NoOwner {
		return a, forbidden("encounter card %q cannot go to a hand", c.ID)
	}
	if c.Owner != seat {
		return a, forbidden("card %q belongs to another player", c.ID)
	}
	return a, nil
}

func resolveToPile(t *Table, seat int, a Action) (Action, error) {
	if _, err := usableCard(t, seat, a.Card); err != nil {
		return a, err
	}
	target, err := t.pile(a.Target)
	if err != nil {
		return a, err
	}
	return a, checkPile(target, seat, false)
}

func resolveToDeck(t *Table, seat int, a Action, rng *rand.Rand) (Action, error) {
	c, err := usableCard(t, seat, a.Card)
	if err != nil {
		return a, err
	}
	deck, err := t.pile(c.Home)
	if err != nil {
		return a, err
	}
	if err := checkPile(deck, seat, false); err != nil {
		return a, err
	}
	switch a.Where {
	case whereTop, whereBottom:
	case whereShuffle:
		a.Renames, a.Cards = reidentify(t, append(without(deck.Cards, c.ID), c.ID), rng)
	default:
		return a, invalid("unknown position %q", a.Where)
	}
	return a, nil
}

func resolveDraw(t *Table, seat int, a Action) (Action, error) {
	if err := checkCount(a.N); err != nil {
		return a, err
	}
	a.Area = PlayerArea(seat)
	deck, err := t.pile("deck:" + string(a.Area))
	if err != nil {
		return a, err
	}
	if a.N > len(deck.Cards) {
		return a, invalid("cannot draw %d cards from pile %q", a.N, deck.ID)
	}
	a.Cards = topCards(deck, a.N)
	return a, nil
}

// resolveReveal records the card to reveal: a rebuild after an undo reveals
// that card, wherever it is in the deck, never the card then on top.
func resolveReveal(t *Table, a Action) (Action, error) {
	enc, err := t.pile(PileEncounter)
	if err != nil {
		return a, err
	}
	if len(enc.Cards) == 0 {
		return a, invalid("encounter deck is empty")
	}
	a.Cards = topCards(enc, 1)
	return a, nil
}

// resolvePlay checks a play, which may tuck the card under a target card. A
// play from the top of the player's own deck names the deck rather than a
// card, as the client does not know its cards: resolve records the top card,
// whatever card the client names, so that a rebuild plays that card.
func resolvePlay(t *Table, seat int, a Action) (Action, error) {
	if a.Pile != "" {
		deck, err := ownPile(t, seat, a.Pile)
		if err != nil {
			return a, err
		}
		if deck.Kind != KindDeck {
			return a, invalid("only a deck's top card is played from its pile, not %q's", deck.ID)
		}
		if len(deck.Cards) == 0 {
			return a, invalid("pile %q is empty", deck.ID)
		}
		a.Card = topCards(deck, 1)[0]
	}
	return a, checkCards(t, seat, a.Card, a.Target)
}

// resolveDeal records the card to deal, so that a rebuild deals that card
// (see resolveReveal).
func resolveDeal(t *Table, a Action) (Action, error) {
	if a.Area == "" {
		return a, invalid("a deal needs a recipient")
	}
	id := t.dealtCard()
	if id == "" {
		return a, invalid("encounter deck is empty")
	}
	a.Cards = []string{id}
	return a, nil
}

// resolveDiscardTop records the cards to discard, top first.
func resolveDiscardTop(t *Table, seat int, a Action) (Action, error) {
	pile, err := ownPile(t, seat, a.Pile)
	if err != nil {
		return a, err
	}
	if a.N > len(pile.Cards) {
		return a, invalid("cannot discard %d cards from pile %q", a.N, pile.ID)
	}
	a.Cards = topCards(pile, a.N)
	return a, nil
}

func resolveHandOrder(seat int, a Action) (Action, error) {
	if !validArea(a.Area) {
		return a, invalid("area %q has no hand", a.Area)
	}
	if a.Area != PlayerArea(seat) {
		return a, forbidden("hand %q belongs to another player", a.Area)
	}
	return a, nil
}

// resolveShuffleKind resolves a shuffle-producing action (see producesShuffle)
// on t. A rebuild uses it when the recorded outcome no longer fits.
func resolveShuffleKind(t *Table, seat int, a Action, rng *rand.Rand) (Action, error) {
	switch a.Kind {
	case ActShuffle:
		return resolveShuffle(t, seat, a, rng)
	case ActShuffleBack:
		return resolveShuffleBack(t, seat, a, rng)
	case ActShuffleIn:
		return resolveShuffleIn(t, seat, a, rng)
	case ActToDeck:
		return resolveToDeck(t, seat, a, rng)
	default:
		return a, invalid("%q does not shuffle", a.Kind)
	}
}

func resolveShuffle(t *Table, seat int, a Action, rng *rand.Rand) (Action, error) {
	pile, err := ownPile(t, seat, a.Pile)
	if err != nil {
		return a, err
	}
	if pile.Kind != KindDeck && pile.Kind != KindEncounter {
		return a, invalid("pile %q cannot be shuffled", pile.ID)
	}
	a.Renames, a.Cards = reidentify(t, pile.Cards, rng)
	return a, nil
}

func resolveShuffleBack(t *Table, seat int, a Action, rng *rand.Rand) (Action, error) {
	source, err := ownPile(t, seat, a.Pile)
	if err != nil {
		return a, err
	}
	deckID, ok := deckOfDiscard(source.ID)
	if !ok {
		return a, invalid("pile %q is not a discard pile", source.ID)
	}
	deck, err := t.pile(deckID)
	if err != nil {
		return a, err
	}
	a.Renames, a.Cards = reidentify(t, slices.Concat(deck.Cards, source.Cards), rng)
	return a, nil
}

func resolveShuffleIn(t *Table, seat int, a Action, rng *rand.Rand) (Action, error) {
	source, err := ownPile(t, seat, a.Pile)
	if err != nil {
		return a, err
	}
	if source.Kind != KindAside {
		return a, invalid("pile %q is not a set-aside pile", source.ID)
	}
	enc, err := t.pile(PileEncounter)
	if err != nil {
		return a, err
	}
	merged := slices.Clone(enc.Cards)
	for _, id := range source.Cards {
		if t.Cards[id].Home == PileEncounter {
			merged = append(merged, id)
		}
	}
	a.Renames, a.Cards = reidentify(t, merged, rng)
	return a, nil
}
