package game

import (
	"cmp"
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
	ActModifier    Kind = "modifier"
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

	ActGroup Kind = "group"
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
	Placed bool `json:"placed,omitempty"`
	// FaceUp marks an explicit Play: the card lands face up, even out of a
	// pile that hides its cards (see landsFaceDown). A drag and drop sends
	// none.
	FaceUp bool     `json:"faceUp,omitempty"`
	N      int      `json:"n,omitempty"`
	Name   string   `json:"name,omitempty"` // token, status or modifier name
	Delta  int      `json:"delta,omitempty"`
	Face   int      `json:"face,omitempty"`  // chosen stage face; resulting face of a flip
	Where  string   `json:"where,omitempty"` // "top" | "bottom" | "shuffle"
	Stage  string   `json:"stage,omitempty"`
	Cards  []string `json:"cards,omitempty"` // resolved: ids taken from a pile top (top first), new orders
	// Renames is filled by shuffles: the old id → new id of every card of the
	// shuffled pile. Cards then holds the new order, in new ids. A reorder of
	// the top that takes a revealed card back renames the reordered cards
	// too, its Cards staying in their old ids (see resolveReorderTop).
	Renames map[string]string `json:"renames,omitempty"`
	Seat    int               `json:"seat,omitempty"` // acting seat, filled server-side (arrows)
	// Seats is filled by an arrow clear of a player holding several decks:
	// every seat of that player, whose arrows it clears. Without it, an arrow
	// clear clears the arrows of Seat.
	Seats []int `json:"seats,omitempty"`
	// Exhausted and FaceDown are the state an exhaust or a flip leads to,
	// filled by resolve: replaying them on a rebuilt table sets that state
	// instead of toggling whatever the card shows there.
	Exhausted *bool `json:"exhausted,omitempty"`
	FaceDown  *bool `json:"faceDown,omitempty"`
	// Actions are the sub-actions of a group, all of one kind, performed in
	// order as a single action: several cards moved at once.
	Actions []Action `json:"actions,omitempty"`
}

// Limits applied to client-provided numbers.
const (
	maxCoordinate = 20000 // table coordinates are 0..maxCoordinate
	maxCount      = 99    // cards per draw/discard, counter delta magnitude, and a stored modifier (±99)
)

// actor is who performs an action: the credited seat, which the event records,
// and every seat of its player. A player may use the hands, decks, set-aside
// and discard piles of all their seats, whichever one is credited.
type actor struct {
	seat  int
	seats []int // in order; the first one is the home seat
}

// actorOf returns the actor credited to seat, with every seat of its player.
func (g *Game) actorOf(seat int) actor {
	return actor{seat: seat, seats: g.seatsOf(g.seatPlayer(seat))}
}

// owns reports whether owner, the Owner of a card or pile, is one of the
// actor's seats.
func (w actor) owns(owner int) bool {
	return slices.Contains(w.seats, owner)
}

// ownsArea reports whether area is the area of one of the actor's seats.
func (w actor) ownsArea(area Area) bool {
	for _, seat := range w.seats {
		if PlayerArea(seat) == area {
			return true
		}
	}
	return false
}

// homeArea returns the area of the actor's home seat, where their private
// view lives: one per player, whatever pile it opens.
func (w actor) homeArea() Area {
	return PlayerArea(w.seats[0])
}

// resolve checks that who may perform a, and fills the fields the client
// cannot decide: the acting seat, the cards drawn and the outcome of every
// shuffle. The returned action is what gets applied and recorded, so
// replaying it needs no randomness. g is never modified.
func resolve(g *Game, who actor, a Action, rng *rand.Rand) (Action, error) {
	if g.Table == nil {
		return Action{}, fmt.Errorf("%w: the game has no table", ErrPhase)
	}
	if who.seat < 0 || who.seat >= g.seatCount() {
		return Action{}, forbidden("seat %d is not at this table", who.seat)
	}
	if err := checkLimits(a); err != nil {
		return Action{}, err
	}
	if a.Area != "" && !g.seatedArea(a.Area) {
		return Action{}, invalid("unknown area %q", a.Area)
	}

	// The client never chooses who acts.
	a.Seat = who.seat
	if a.Kind == ActGroup {
		return resolveGroup(g, who, a, rng)
	}
	return resolveOnTable(g.Table, who, a, rng)
}

// resolveOnTable resolves a, any kind but a group, on the table as apply
// will see it: with the cards revealed on the deck a acts on back in it (see
// coveredFor), so that the recorded cards are those apply takes. A rebuild
// resolves its shuffles again here too (see resolveShuffleKind).
func resolveOnTable(original *Table, who actor, a Action, rng *rand.Rand) (Action, error) {
	t, err := original.coveredFor(a, PlayerArea(who.seat))
	if err != nil {
		return Action{}, err
	}

	switch a.Kind {
	case ActMove, ActToken, ActStatus, ActModifier, ActChooseStage, ActDiscard:
		return a, checkCards(t, who, a.Card)
	case ActExhaust:
		return resolveExhaust(t, who, a)
	case ActReadyAll:
		return resolveReadyAll(t, a)
	case ActFlip:
		return resolveFlip(t, who, a)
	case ActAttach, ActArrowAdd:
		return a, checkCards(t, who, a.Card, a.Target)
	case ActPlay:
		return resolvePlay(t, who, a)
	case ActToHand:
		return resolveToHand(t, who, a)
	case ActToDeck:
		return resolveToDeck(t, who, a, rng)
	case ActToPile:
		return resolveToPile(t, who, a)
	case ActReveal:
		return resolveReveal(t, who, a)
	case ActDeal:
		return resolveDeal(t, a)
	case ActFirstPlayer:
		return a, nil
	case ActArrowClear:
		// A player's arrows are credited to any of their seats. Seat alone
		// tells the seat of a one-deck player, whose events then stay as
		// they were recorded before Seats existed.
		if len(who.seats) > 1 {
			a.Seats = slices.Clone(who.seats)
		}
		return a, nil
	case ActDraw:
		return resolveDraw(t, who, a)
	case ActHandOrder:
		return resolveHandOrder(who, a)
	case ActDiscardTop:
		return resolveDiscardTop(t, who, a)
	case ActReorderTop:
		// Whether it takes a revealed card shows on the table before covering.
		return resolveReorderTop(original, who, a, rng)
	case ActShuffle:
		return resolveShuffle(t, who, a, rng)
	case ActShuffleBack:
		return resolveShuffleBack(t, who, a, rng)
	case ActShuffleIn:
		return resolveShuffleIn(t, who, a, rng)
	default:
		return Action{}, invalid("unknown action kind %q", a.Kind)
	}
}

// groupableKinds are the kinds a group may hold: the ways a card leaves its
// place by a drag, none of which shuffles.
var groupableKinds = map[Kind]bool{
	ActMove:    true,
	ActToHand:  true,
	ActToDeck:  true,
	ActDiscard: true,
	ActToPile:  true,
}

// resolveGroup checks a group: 2 to maxCount sub-actions of one groupable
// kind and one place, each on its own card, none tucked under another's. Every sub-action
// is resolved for who against the table as it stands, and the first error
// rejects the whole group.
func resolveGroup(g *Game, who actor, a Action, rng *rand.Rand) (Action, error) {
	if len(a.Actions) < 2 || len(a.Actions) > maxCount {
		return a, invalid("a group holds 2 to %d actions, not %d", maxCount, len(a.Actions))
	}
	kind := a.Actions[0].Kind
	if !groupableKinds[kind] {
		return a, invalid("%q actions cannot be grouped", kind)
	}

	t := g.Table
	cards := map[string]bool{}
	for _, sub := range a.Actions {
		if sub.Kind != kind {
			return a, invalid("a group mixes %q and %q actions", kind, sub.Kind)
		}
		if sub.Kind == ActToDeck && sub.Where == whereShuffle {
			return a, invalid("a group cannot shuffle cards into their decks")
		}
		// The group's line names one place for all its cards.
		if sub.Where != a.Actions[0].Where {
			return a, invalid("a group mixes %q and %q places", a.Actions[0].Where, sub.Where)
		}
		if sub.Card == "" || cards[sub.Card] {
			return a, invalid("each action of a group needs a card of its own")
		}
		cards[sub.Card] = true
	}
	for _, sub := range a.Actions {
		for _, child := range t.descendants(sub.Card) {
			if cards[child.ID] {
				return a, invalid("card %q is tucked under %q, which comes along", child.ID, sub.Card)
			}
		}
	}

	resolved := make([]Action, 0, len(a.Actions))
	for _, sub := range a.Actions {
		r, err := resolve(g, who, sub, rng)
		if err != nil {
			return a, err
		}
		resolved = append(resolved, r)
	}
	a.Actions = resolved
	return a, nil
}

// seatedArea reports whether area names a seat at this table.
func (g *Game) seatedArea(area Area) bool {
	for seat := range g.seatCount() {
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
	isCounter := a.Kind == ActToken || a.Kind == ActStatus || a.Kind == ActModifier
	if isCounter && (a.Delta < -maxCount || a.Delta > maxCount) {
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

// checkPile verifies that who may use pile. Decks, side decks and set-aside
// piles are private to their owner's player; so are discard piles when
// privateDiscard is set (piles operations), while cards lying in a discard
// pile stay shared.
func checkPile(pile *Pile, who actor, privateDiscard bool) error {
	isDiscard := pile.Kind == KindDiscard || pile.Kind == KindSideDiscard
	private := pile.Kind == KindDeck || pile.Kind == KindSideDeck || pile.Kind == KindAside ||
		(isDiscard && privateDiscard)
	if private && pile.Owner != NoOwner && !who.owns(pile.Owner) {
		return forbidden("pile %q belongs to another player", pile.ID)
	}
	return nil
}

// ownPile returns the pile with the given id when who may operate on it.
func ownPile(t *Table, who actor, id string) (*Pile, error) {
	pile, err := t.pile(id)
	if err != nil {
		return nil, err
	}
	return pile, checkPile(pile, who, true)
}

// checkCards verifies that who may touch each card: nobody else's hand,
// deck or set-aside pile. Empty ids are skipped.
func checkCards(t *Table, who actor, ids ...string) error {
	for _, id := range ids {
		if id == "" {
			continue
		}
		c, err := t.card(id)
		if err != nil {
			return err
		}
		if err := checkCard(t, who, c); err != nil {
			return err
		}
	}
	return nil
}

// usableCard returns the card with the given id when who may touch it.
func usableCard(t *Table, who actor, id string) (*Card, error) {
	c, err := t.card(id)
	if err != nil {
		return nil, err
	}
	return c, checkCard(t, who, c)
}

func checkCard(t *Table, who actor, c *Card) error {
	switch c.Zone {
	case ZoneHand:
		if owner := handOf(t, c.ID); owner != "" && !who.ownsArea(owner) {
			return forbidden("card %q is in another player's hand", c.ID)
		}
	case ZonePile:
		if pile, ok := t.Piles[c.Pile]; ok {
			return checkPile(pile, who, false)
		}
	}
	return nil
}

// resolveExhaust records whether the card ends exhausted (see
// Action.Exhausted). A locked card is exhausted, but never readied.
func resolveExhaust(t *Table, who actor, a Action) (Action, error) {
	c, err := usableTableCard(t, who, a.Card)
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
// up, a single-faced card turns face down (see turnsFaceDown), any other goes
// to its next face.
func resolveFlip(t *Table, who actor, a Action) (Action, error) {
	c, err := usableTableCard(t, who, a.Card)
	if err != nil {
		return a, err
	}
	a.Face = c.Face
	switch {
	case c.FaceDown:
		a.FaceDown = new(false)
	case turnsFaceDown(t, c):
		a.FaceDown = new(true)
	default:
		a.Face = (c.Face + 1) % faceCount(c)
		a.FaceDown = new(false)
	}
	return a, nil
}

// turnsFaceDown reports whether flipping c, face up, turns it face down: a
// card with a single face has no other face to show. An identity card and the
// card a stage shows stay face up, so that everyone can read them.
func turnsFaceDown(t *Table, c *Card) bool {
	return faceCount(c) == 1 && !c.Identity && t.stageShowing(c.ID) == nil
}

// usableTableCard returns the table card with the given id when who may
// touch it.
func usableTableCard(t *Table, who actor, id string) (*Card, error) {
	c, err := usableCard(t, who, id)
	if err != nil {
		return nil, err
	}
	if c.Zone != ZoneTable {
		return nil, invalid("card %q is not on the table", id)
	}
	return c, nil
}

func resolveToHand(t *Table, who actor, a Action) (Action, error) {
	c, err := usableCard(t, who, a.Card)
	if err != nil {
		return a, err
	}
	if c.Owner == NoOwner {
		return a, forbidden("encounter card %q cannot go to a hand", c.ID)
	}
	if !who.owns(c.Owner) {
		return a, forbidden("card %q belongs to another player", c.ID)
	}
	return a, nil
}

func resolveToPile(t *Table, who actor, a Action) (Action, error) {
	if _, err := usableCard(t, who, a.Card); err != nil {
		return a, err
	}
	target, err := t.pile(a.Target)
	if err != nil {
		return a, err
	}
	return a, checkPile(target, who, false)
}

func resolveToDeck(t *Table, who actor, a Action, rng *rand.Rand) (Action, error) {
	c, err := usableCard(t, who, a.Card)
	if err != nil {
		return a, err
	}
	deck, err := t.pile(c.Home)
	if err != nil {
		return a, err
	}
	if err := checkPile(deck, who, false); err != nil {
		return a, err
	}
	switch a.Where {
	case whereTop, whereBottom:
	case whereShuffle:
		a.Renames, a.Cards = reidentify(t, t.shuffledIntoDeck(c, deck), rng)
	default:
		return a, invalid("unknown position %q", a.Where)
	}
	return a, nil
}

// resolveDraw records whose hand the cards go to and which cards they are. A
// draw takes from the deck of the credited seat, or from the deck or side deck
// a.Pile names, which must be one of the actor's: the cards go to that deck's
// owner's hand. The client-provided area is ignored.
func resolveDraw(t *Table, who actor, a Action) (Action, error) {
	if err := checkCount(a.N); err != nil {
		return a, err
	}
	deckID := "deck:" + string(PlayerArea(who.seat))
	if a.Pile != "" {
		deckID = a.Pile
	}
	deck, err := ownPile(t, who, deckID)
	if err != nil {
		return a, err
	}
	if deck.Kind != KindDeck && deck.Kind != KindSideDeck {
		return a, invalid("cards are drawn from a player's deck, not from %q", deck.ID)
	}
	a.Area = PlayerArea(deck.Owner)
	if a.N > len(deck.Cards) {
		return a, invalid("cannot draw %d cards from pile %q", a.N, deck.ID)
	}
	a.Cards = topCards(deck, a.N)
	return a, nil
}

// resolveReveal records the card to reveal: a rebuild after an undo reveals
// that card, wherever it is in the deck, never the card then on top. The deck
// is the one a.Pile names, which must be one of the actor's, or the shared
// encounter deck when it names none. Only one card at a time lies revealed on
// a deck.
func resolveReveal(t *Table, who actor, a Action) (Action, error) {
	deck, err := ownPile(t, who, cmp.Or(a.Pile, PileEncounter))
	if err != nil {
		return a, err
	}
	if !revealable(deck) {
		return a, invalid("the top card of pile %q cannot be revealed", deck.ID)
	}
	if len(t.revealedOn(deck.ID)) > 0 {
		return a, invalid("a card is already revealed on pile %q", deck.ID)
	}
	if len(deck.Cards) == 0 {
		return a, invalid("pile %q is empty", deck.ID)
	}
	a.Cards = topCards(deck, 1)
	return a, nil
}

// resolvePlay checks a play, which may tuck the card under a target card. A
// play from the top of the player's own deck or side deck names the deck
// rather than a card, as the client does not know its cards: resolve records
// the top card, whatever card the client names, so that a rebuild plays that
// card. A card revealed on the deck is its top card (see applyPlay).
func resolvePlay(t *Table, who actor, a Action) (Action, error) {
	if a.Pile != "" {
		deck, err := ownPile(t, who, a.Pile)
		if err != nil {
			return a, err
		}
		if deck.Kind != KindDeck && deck.Kind != KindSideDeck {
			return a, invalid("only a deck's top card is played from its pile, not %q's", deck.ID)
		}
		cards := t.deckCards(deck)
		if len(cards) == 0 {
			return a, invalid("pile %q is empty", deck.ID)
		}
		a.Card = topOf(cards, 1)[0]
	}
	return a, checkCards(t, who, a.Card, a.Target)
}

// resolveDeal records the card to deal, the encounter deck's top card, so
// that a rebuild deals that card (see resolveReveal). A card revealed on the
// deck is its top card: it lies back on top here (see coveredFor).
func resolveDeal(t *Table, a Action) (Action, error) {
	if a.Area == "" {
		return a, invalid("a deal needs a recipient")
	}
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

// resolveReorderTop checks a reorder of the top of one of the actor's piles.
// A reorder of a deck with a card revealed on it takes that card, its top one,
// back into the deck face down (see coveredFor). The reordered cards then get
// new ids, as a shuffle gives them (see reidentify): nobody can follow the
// card everybody saw into the deck. a.Cards keeps the new order in the ids
// the cards had.
func resolveReorderTop(t *Table, who actor, a Action, rng *rand.Rand) (Action, error) {
	if _, err := ownPile(t, who, a.Pile); err != nil {
		return a, err
	}
	a.Renames = nil
	if len(t.revealedOn(a.Pile)) > 0 {
		a.Renames, _ = reidentify(t, a.Cards, rng)
	}
	return a, nil
}

// resolveDiscardTop records the cards to discard, top first. Only a deck with
// a discard pile can be discarded from: a side deck may have none.
func resolveDiscardTop(t *Table, who actor, a Action) (Action, error) {
	pile, err := ownPile(t, who, a.Pile)
	if err != nil {
		return a, err
	}
	discardID, ok := discardPileOf(pile.ID)
	if !ok {
		return a, invalid("pile %q is not a deck", pile.ID)
	}
	if _, ok := t.Piles[discardID]; !ok {
		return a, invalid("pile %q has no discard pile", pile.ID)
	}
	if a.N > len(pile.Cards) {
		return a, invalid("cannot discard %d cards from pile %q", a.N, pile.ID)
	}
	a.Cards = topCards(pile, a.N)
	return a, nil
}

func resolveHandOrder(who actor, a Action) (Action, error) {
	if !validArea(a.Area) {
		return a, invalid("area %q has no hand", a.Area)
	}
	if !who.ownsArea(a.Area) {
		return a, forbidden("hand %q belongs to another player", a.Area)
	}
	return a, nil
}

// resolveShuffleKind resolves a shuffle-producing action (see producesShuffle)
// on t. A rebuild uses it when the recorded outcome no longer fits.
func resolveShuffleKind(t *Table, who actor, a Action, rng *rand.Rand) (Action, error) {
	if !producesShuffle(a) {
		return a, invalid("%q does not shuffle", a.Kind)
	}
	return resolveOnTable(t, who, a, rng)
}

func resolveShuffle(t *Table, who actor, a Action, rng *rand.Rand) (Action, error) {
	pile, err := ownPile(t, who, a.Pile)
	if err != nil {
		return a, err
	}
	if pile.Kind != KindDeck && pile.Kind != KindSideDeck && pile.Kind != KindEncounter {
		return a, invalid("pile %q cannot be shuffled", pile.ID)
	}
	a.Renames, a.Cards = reidentify(t, pile.Cards, rng)
	return a, nil
}

func resolveShuffleBack(t *Table, who actor, a Action, rng *rand.Rand) (Action, error) {
	source, err := ownPile(t, who, a.Pile)
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

func resolveShuffleIn(t *Table, who actor, a Action, rng *rand.Rand) (Action, error) {
	source, err := ownPile(t, who, a.Pile)
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
