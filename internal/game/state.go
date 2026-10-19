package game

import (
	"fmt"
	"maps"
	"slices"

	"github.com/alexandreroman/intothefray/internal/pack"
)

// Area is a region of the table: the villain side or one player's side.
type Area string

// AreaVillain is the villain side of the table.
const AreaVillain Area = "villain"

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
	Area      Area           `json:"area,omitempty"`
	X         int            `json:"x"`
	Y         int            `json:"y"`
	Z         int            `json:"z"`
	Parent    string         `json:"parent,omitempty"` // id of the card it is tucked under
	Pile      string         `json:"pile,omitempty"`   // pile id while Zone == ZonePile
	OnPile    string         `json:"onPile,omitempty"` // revealed on top of this pile (Zone table)
	Exhausted bool           `json:"exhausted,omitempty"`
	Tokens    map[string]int `json:"tokens,omitempty"` // "dmg", "thr", "gen"
	Status    map[string]int `json:"status,omitempty"` // "stunned", "confused", "tough"
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
)

// Well-known pile ids. Per-player piles are "deck:pN", "disc:pN", "aside:pN".
const (
	PileEncounter        = "enc"
	PileEncounterDiscard = "encd"
	PileVictory          = "vic"
	PileScenarioAside    = "saside"
)

// Pile is an ordered stack of cards.
type Pile struct {
	ID    string   `json:"id"`
	Kind  PileKind `json:"kind"`
	Owner int      `json:"owner"`
	Area  Area     `json:"area"`
	X     int      `json:"x"`
	Y     int      `json:"y"`
	Cards []string `json:"cards"` // bottom → top
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

// Point is a position within an area.
type Point struct {
	Area Area `json:"area"`
	X    int  `json:"x"`
	Y    int  `json:"y"`
}

// PrivateView is a Look or Search a player has opened on a pile.
type PrivateView struct {
	Pile  string   `json:"pile"`
	Mode  string   `json:"mode"`  // "top" or "search"
	Cards []string `json:"cards"` // top first
}

// Table is the whole shared state of a game.
type Table struct {
	Cards       map[string]*Card      `json:"cards"`
	Piles       map[string]*Pile      `json:"piles"`
	Hands       map[Area][]string     `json:"hands"`
	Stages      []*Stage              `json:"stages"`
	FirstPlayer Point                 `json:"firstPlayer"`
	Arrows      []Arrow               `json:"arrows,omitempty"`
	Views       map[Area]*PrivateView `json:"views,omitempty"` // open Look/Search per player
	NextZ       int                   `json:"nextZ"`
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
