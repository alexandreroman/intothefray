package game

import (
	"fmt"
	"maps"
	"slices"
	"strings"

	"github.com/alexandreroman/intothefray/internal/pack"
)

// Area names the seat of a player: "p0", "p1"... Hands and private views
// are keyed by it. The table itself is one surface shared by everyone, with
// no areas.
type Area string

// PlayerArea returns the area of the player seated at seat (0 → "p0").
func PlayerArea(seat int) Area {
	return Area(fmt.Sprintf("p%d", seat))
}

// NoOwner is the Owner of cards and piles that belong to no player.
const NoOwner = -1

// Zone tells where a card currently lives.
type Zone string

// Card zones.
const (
	ZoneTable Zone = "table"
	ZoneHand  Zone = "hand"
	ZonePile  Zone = "pile"
	ZoneStage Zone = "stage"
)

// Card is one physical card on the table.
type Card struct {
	ID        string         `json:"id"`   // opaque and random (see newCardID)
	Code      string         `json:"code"` // canonical pack code
	Face      int            `json:"face"`
	Faces     int            `json:"faces"` // number of faces, filled at setup
	FaceDown  bool           `json:"faceDown,omitempty"`
	Back      pack.Back      `json:"back"`
	Owner     int            `json:"owner"` // seat, or NoOwner
	Home      string         `json:"home"`  // id of the pile it returns to: "deck:p0" or "enc"
	Zone      Zone           `json:"zone"`
	X         int            `json:"x"`
	Y         int            `json:"y"`
	Z         int            `json:"z"`
	Parent    string         `json:"parent,omitempty"` // id of the card it is tucked under
	Pile      string         `json:"pile,omitempty"`   // pile id while Zone == ZonePile
	OnPile    string         `json:"onPile,omitempty"` // revealed on top of this pile (Zone table)
	Exhausted bool           `json:"exhausted,omitempty"`
	Tokens    map[string]int `json:"tokens,omitempty"` // "dmg", "thr", "gen", "acc"
	// Status counts the statuses ("stunned", "confused", "tough", "retaliate",
	// "locked"); the count of "retaliate" is the card's Retaliate value.
	Status map[string]int `json:"status,omitempty"`
	// Mods records signed stat modifiers ("atk", "thw", "def", "sch", "rec",
	// "hp"), bookkeeping only: a modifier changes nothing else on the card.
	Mods map[string]int `json:"mods,omitempty"`
	// Identity marks a player's hero or alter-ego card, set at setup: it never
	// leaves the table (see checkStaysOnTable). A version of the identity
	// takes the mark over when it is played (see takeOverIdentity).
	Identity bool `json:"identity,omitempty"`
	// IdentityVersion marks another version of a player's identity, such as
	// Ironheart's set-aside versions: played onto the table, it becomes its
	// owner's identity. Setup marks the set-aside identity cards; an identity
	// replaced by a version becomes one in turn.
	IdentityVersion bool `json:"identityVersion,omitempty"`
}

// PileKind tells what a pile is used for.
type PileKind string

// Pile kinds.
const (
	KindDeck             PileKind = "deck"
	KindDiscard          PileKind = "discard"
	KindEncounter        PileKind = "encounter"
	KindEncounterDiscard PileKind = "encounterDiscard"
	KindVictory          PileKind = "victory"
	KindAside            PileKind = "aside"
	// A side deck is one of a hero's extra decks, such as Doctor Strange's
	// Invocation deck; a side discard is the discard pile of one of them.
	KindSideDeck    PileKind = "sideDeck"
	KindSideDiscard PileKind = "sideDiscard"
	// A scenario deck is a deck the scenario owns that is not an encounter
	// deck; a scenario discard is its discard pile.
	KindScenarioDeck    PileKind = "scenarioDeck"
	KindScenarioDiscard PileKind = "scenarioDiscard"
)

// Well-known pile ids. Per-player piles are "deck:pN", "disc:pN", "aside:pN",
// and for the side decks of a hero "side:pN:I" and "sided:pN:I" (see
// sideDeckID).
const (
	PileEncounter        = "enc"
	PileEncounterDiscard = "encd"
	PileVictory          = "vic"
	PileScenarioAside    = "saside"
)

// Prefixes of the ids of side piles.
const (
	sideDeckPrefix    = "side:"
	sideDiscardPrefix = "sided:"
)

// Prefixes of the ids of scenario deck piles: encounter decks and their
// discard piles, then the other scenario decks and their discard piles.
const (
	scenarioEncounterPrefix        = "enc:"
	scenarioEncounterDiscardPrefix = "encd:"
	scenarioDeckPrefix             = "sdeck:"
	scenarioDiscardPrefix          = "sdisc:"
)

// sideDeckID returns the id of the side deck of seat at index i of its
// hero's side decks: "side:p0:0".
func sideDeckID(seat, i int) string {
	return fmt.Sprintf("%s%s:%d", sideDeckPrefix, PlayerArea(seat), i)
}

// sideDiscardID returns the id of the discard pile of that side deck:
// "sided:p0:0".
func sideDiscardID(seat, i int) string {
	return fmt.Sprintf("%s%s:%d", sideDiscardPrefix, PlayerArea(seat), i)
}

// isSideDeckID reports whether id names a side deck.
func isSideDeckID(id string) bool {
	return strings.HasPrefix(id, sideDeckPrefix)
}

// scenarioDeckIDs returns the ids of the deck of a scenario deck with key and
// of its discard pile: "enc:w" and "encd:w" for an encounter deck, "sdeck:x"
// and "sdisc:x" for the others.
func scenarioDeckIDs(key string, encounter bool) (deck, discard string) {
	if encounter {
		return scenarioEncounterPrefix + key, scenarioEncounterDiscardPrefix + key
	}
	return scenarioDeckPrefix + key, scenarioDiscardPrefix + key
}

// Pile is an ordered stack of cards.
type Pile struct {
	ID    string   `json:"id"`
	Kind  PileKind `json:"kind"`
	Owner int      `json:"owner"`
	X     int      `json:"x"`
	Y     int      `json:"y"`
	Cards []string `json:"cards"` // bottom → top
	// Label names a side pile: "Invocation" for the Invocation deck and its
	// discard pile.
	Label string `json:"label,omitempty"`
	// TopFaceUp shows the top card of a side deck to everyone.
	TopFaceUp bool `json:"topFaceUp,omitempty"`
	// Back is the printed back the cards of a side deck share, which the
	// client captions with the deck's label; empty when they keep their own.
	Back pack.Back `json:"back,omitempty"`
	// Compact is a scenario deck or discard pile, drawn 100 x 140.
	Compact bool `json:"compact,omitempty"`
}

// Stage is a scheme or villain stage track.
type Stage struct {
	Key     string   `json:"key"`
	Label   string   `json:"label"`
	Current string   `json:"current"`
	Cards   []string `json:"cards"`
}

// Arrow points from one card to another, drawn by the player at Seat.
type Arrow struct {
	From string `json:"from"`
	To   string `json:"to"`
	Seat int    `json:"seat"`
}

// Point is a position on the table, in table units.
type Point struct {
	X int `json:"x"`
	Y int `json:"y"`
}

// Marker names of the table: the first player token and the active counter.
const (
	MarkerFirstPlayer = "firstPlayer"
	MarkerActive      = "active"
)

// PrivateView is a Look or Search a player has opened on a pile.
type PrivateView struct {
	Pile  string   `json:"pile"`
	Mode  string   `json:"mode"`  // "top" or "search"
	Cards []string `json:"cards"` // top first
}

// Table is the whole shared state of a game.
type Table struct {
	Cards       map[string]*Card  `json:"cards"`
	Piles       map[string]*Pile  `json:"piles"`
	Hands       map[Area][]string `json:"hands"`
	Stages      []*Stage          `json:"stages"`
	FirstPlayer Point             `json:"firstPlayer"`
	// Active is the active counter, nil when the scenario has none.
	Active *Point                `json:"active,omitempty"`
	Arrows []Arrow               `json:"arrows,omitempty"`
	Views  map[Area]*PrivateView `json:"views,omitempty"` // open Look/Search per player
	NextZ  int                   `json:"nextZ"`
}

// Clone returns a deep copy of the table; nothing is shared with t.
func (t *Table) Clone() *Table {
	clone := *t
	clone.Cards = cloneMapOfPtrs(t.Cards, (*Card).clone)
	clone.Piles = cloneMapOfPtrs(t.Piles, (*Pile).clone)
	clone.Hands = cloneMapOfSlices(t.Hands)
	clone.Stages = cloneStages(t.Stages)
	clone.Arrows = slices.Clone(t.Arrows)
	clone.Views = cloneMapOfPtrs(t.Views, (*PrivateView).clone)
	if t.Active != nil {
		p := *t.Active
		clone.Active = &p
	}
	return &clone
}

// CardCodes returns the distinct canonical codes of the table's cards,
// sorted. No action creates a card, so the set is fixed once the table is
// set up.
func (t *Table) CardCodes() []string {
	codes := make([]string, 0, len(t.Cards))
	for _, c := range t.Cards {
		codes = append(codes, c.Code)
	}
	slices.Sort(codes)
	return slices.Compact(codes)
}

func (c *Card) clone() *Card {
	clone := *c
	clone.Tokens = maps.Clone(c.Tokens)
	clone.Status = maps.Clone(c.Status)
	clone.Mods = maps.Clone(c.Mods)
	return &clone
}

func (p *Pile) clone() *Pile {
	clone := *p
	clone.Cards = slices.Clone(p.Cards)
	return &clone
}

func (s *Stage) clone() *Stage {
	clone := *s
	clone.Cards = slices.Clone(s.Cards)
	return &clone
}

func (v *PrivateView) clone() *PrivateView {
	clone := *v
	clone.Cards = slices.Clone(v.Cards)
	return &clone
}

// cloneStages deep-copies a list of stages; nil stays nil.
func cloneStages(stages []*Stage) []*Stage {
	if stages == nil {
		return nil
	}
	clone := make([]*Stage, len(stages))
	for i, stage := range stages {
		clone[i] = stage.clone()
	}
	return clone
}

// cloneMapOfPtrs deep-copies a map whose values are pointers; nil stays nil.
func cloneMapOfPtrs[K comparable, V any](m map[K]*V, cloneValue func(*V) *V) map[K]*V {
	if m == nil {
		return nil
	}
	clone := make(map[K]*V, len(m))
	for key, value := range m {
		clone[key] = cloneValue(value)
	}
	return clone
}

// cloneMapOfSlices deep-copies a map whose values are slices; nil stays nil.
func cloneMapOfSlices[K comparable, V any](m map[K][]V) map[K][]V {
	if m == nil {
		return nil
	}
	clone := make(map[K][]V, len(m))
	for key, value := range m {
		clone[key] = slices.Clone(value)
	}
	return clone
}
