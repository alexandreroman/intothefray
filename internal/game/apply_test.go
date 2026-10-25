package game

import (
	"errors"
	"reflect"
	"slices"
	"strings"
	"testing"
)

// newTestTable builds a small table by hand: seat 0 has an ally (c1) with a
// tucked upgrade (c2) on the table, a hand card (c3) and a three-card deck
// (c4..c6); the encounter side has a minion (c7), an encounter deck (c8)
// and empty discard, victory and aside piles.
func newTestTable() *Table {
	t := &Table{
		Cards: map[string]*Card{
			"c1": {
				ID: "c1", Owner: 0, Home: "deck:p0", Zone: ZoneTable, X: 100, Y: 200, Z: 5,
				Tokens: map[string]int{"dmg": 2}, Status: map[string]int{"stunned": 1}, Exhausted: true, Face: 1, Faces: 2,
			},
			"c2": {ID: "c2", Owner: 0, Home: "deck:p0", Zone: ZoneTable, X: 100, Y: 220, Z: 4, Parent: "c1"},
			"c3": {ID: "c3", Owner: 0, Home: "deck:p0", Zone: ZoneHand},
			"c4": {ID: "c4", Owner: 0, Home: "deck:p0", Zone: ZonePile, Pile: "deck:p0"},
			"c5": {ID: "c5", Owner: 0, Home: "deck:p0", Zone: ZonePile, Pile: "deck:p0"},
			"c6": {ID: "c6", Owner: 0, Home: "deck:p0", Zone: ZonePile, Pile: "deck:p0"},
			"c7": {ID: "c7", Owner: NoOwner, Home: PileEncounter, Zone: ZoneTable, X: 600, Y: 20, Z: 6},
			"c8": {ID: "c8", Owner: NoOwner, Home: PileEncounter, Zone: ZonePile, Pile: PileEncounter},
		},
		Piles: map[string]*Pile{
			"deck:p0":            {ID: "deck:p0", Kind: KindDeck, Owner: 0, Cards: []string{"c4", "c5", "c6"}},
			"disc:p0":            {ID: "disc:p0", Kind: KindDiscard, Owner: 0},
			"aside:p0":           {ID: "aside:p0", Kind: KindAside, Owner: 0},
			PileEncounter:        {ID: PileEncounter, Kind: KindEncounter, Owner: NoOwner, Cards: []string{"c8"}},
			PileEncounterDiscard: {ID: PileEncounterDiscard, Kind: KindEncounterDiscard, Owner: NoOwner},
			PileVictory:          {ID: PileVictory, Kind: KindVictory, Owner: NoOwner},
			PileScenarioAside:    {ID: PileScenarioAside, Kind: KindAside, Owner: NoOwner},
		},
		Hands: map[Area][]string{"p0": {"c3"}},
		NextZ: 10,
	}
	return t
}

func mustApply(t *testing.T, table *Table, a Action) {
	t.Helper()
	if err := apply(table, a); err != nil {
		t.Fatalf("apply(%+v) = %v", a, err)
	}
}

func TestMoveCarriesAttachments(t *testing.T) {
	table := newTestTable()

	mustApply(t, table, Action{Kind: ActMove, Card: "c1", X: 304, Y: 296})

	c1, c2 := table.Cards["c1"], table.Cards["c2"]
	if c1.X != 300 || c1.Y != 300 {
		t.Errorf("c1 at (%d,%d), want (300,300)", c1.X, c1.Y)
	}
	if c2.X != 300 || c2.Y != 320 {
		t.Errorf("c2 at (%d,%d), want (300,320)", c2.X, c2.Y)
	}
	if c2.Parent != "c1" {
		t.Errorf("c2 parent = %q, want c1", c2.Parent)
	}
	if c2.Z >= c1.Z || c1.Z != 11 {
		t.Errorf("Z c1=%d c2=%d, want c2 below c1 and c1 on top", c1.Z, c2.Z)
	}
}

func TestMoveCarriesTheWholeStack(t *testing.T) {
	table := newTestTable()
	// c7 carries two attachments where they were dropped, c1 (with c2 still
	// tucked under it) and c3, and c4, tucked at the default offset.
	mustApply(t, table, Action{Kind: ActAttach, Card: "c1", Target: "c7", X: 640, Y: 100, Placed: true})
	mustApply(t, table, Action{Kind: ActPlay, Card: "c3", Target: "c7", X: 700, Y: 140, Placed: true})
	mustApply(t, table, Action{Kind: ActPlay, Card: "c4", Target: "c7"})
	stack := []string{"c1", "c2", "c3", "c4"}
	type offset struct{ dx, dy int }
	offsets := map[string]offset{}
	host := table.Cards["c7"]
	for _, id := range stack {
		c := table.Cards[id]
		offsets[id] = offset{c.X - host.X, c.Y - host.Y}
	}

	mustApply(t, table, Action{Kind: ActMove, Card: "c7", X: 1000, Y: 500})

	host = table.Cards["c7"]
	if host.X != 1000 || host.Y != 500 {
		t.Fatalf("c7 at (%d,%d), want (1000,500)", host.X, host.Y)
	}
	for _, id := range stack {
		c := table.Cards[id]
		if got := (offset{c.X - host.X, c.Y - host.Y}); got != offsets[id] {
			t.Errorf("%s lies at offset %v from c7, want %v", id, got, offsets[id])
		}
		if c.Z >= host.Z {
			t.Errorf("%s Z = %d, want below c7 (%d)", id, c.Z, host.Z)
		}
	}
}

func TestMoveClearsOnPile(t *testing.T) {
	table := newTestTable()
	table.Cards["c7"].OnPile = PileEncounter

	mustApply(t, table, Action{Kind: ActMove, Card: "c7", X: 700, Y: 0})

	if got := table.Cards["c7"].OnPile; got != "" {
		t.Errorf("OnPile = %q, want empty", got)
	}
}

func TestAttach(t *testing.T) {
	table := newTestTable()

	mustApply(t, table, Action{Kind: ActAttach, Card: "c7", Target: "c1"})

	c7 := table.Cards["c7"]
	if c7.Parent != "c1" || c7.X != 100 || c7.Y != 220 || c7.Z >= table.Cards["c1"].Z {
		t.Errorf("c7 = %+v, want tucked under c1 at (100,220)", c7)
	}
}

func TestAttachWhereDropped(t *testing.T) {
	table := newTestTable()

	// c1 carries c2, tucked 20 below it: both go where c1 is dropped, behind c7.
	mustApply(t, table, Action{Kind: ActAttach, Card: "c1", Target: "c7", X: 654, Y: 87, Placed: true})

	c1, c2, c7 := table.Cards["c1"], table.Cards["c2"], table.Cards["c7"]
	if c1.Parent != "c7" || c1.X != 650 || c1.Y != 90 || c1.Z >= c7.Z {
		t.Errorf("c1 = %+v, want under c7 where dropped, at (650,90)", c1)
	}
	if c2.Parent != "c1" || c2.X != 650 || c2.Y != 110 || c2.Z >= c1.Z {
		t.Errorf("c2 = %+v, want still under c1, at (650,110)", c2)
	}
}

func TestAttachRejectsCycle(t *testing.T) {
	table := newTestTable()
	before := table.Clone()

	err := apply(table, Action{Kind: ActAttach, Card: "c1", Target: "c2"})

	if !errors.Is(err, ErrInvalid) {
		t.Fatalf("err = %v, want ErrInvalid", err)
	}
	if !reflect.DeepEqual(before, table) {
		t.Error("table changed by a rejected action")
	}
}

func TestLeavingPlayDiscardsAttachments(t *testing.T) {
	table := newTestTable()

	mustApply(t, table, Action{Kind: ActDiscard, Card: "c1"})

	if got, want := table.Piles["disc:p0"].Cards, []string{"c2", "c1"}; !slices.Equal(got, want) {
		t.Errorf("disc:p0 = %v, want %v", got, want)
	}
	c1 := table.Cards["c1"]
	if c1.Tokens != nil || c1.Status != nil || c1.Exhausted || c1.Face != 0 {
		t.Errorf("c1 not reset: %+v", c1)
	}
	if c1.Zone != ZonePile || c1.Pile != "disc:p0" || table.Cards["c2"].Parent != "" {
		t.Errorf("c1 = %+v, c2 = %+v", c1, table.Cards["c2"])
	}
}

func TestDiscardEncounterCard(t *testing.T) {
	table := newTestTable()

	mustApply(t, table, Action{Kind: ActDiscard, Card: "c7"})

	if got := table.Piles[PileEncounterDiscard].Cards; !slices.Equal(got, []string{"c7"}) {
		t.Errorf("encd = %v, want [c7]", got)
	}
}

func TestToHand(t *testing.T) {
	table := newTestTable()

	mustApply(t, table, Action{Kind: ActToHand, Card: "c4"})

	if got := table.Hands["p0"]; !slices.Equal(got, []string{"c3", "c4"}) {
		t.Errorf("hand = %v, want [c3 c4]", got)
	}
	if got := table.Piles["deck:p0"].Cards; !slices.Equal(got, []string{"c5", "c6"}) {
		t.Errorf("deck = %v, want [c5 c6]", got)
	}
	if c := table.Cards["c4"]; c.Zone != ZoneHand || c.Pile != "" {
		t.Errorf("c4 = %+v, want in hand", c)
	}
}

func TestToHandRefusesEncounterCard(t *testing.T) {
	table := newTestTable()
	before := table.Clone()

	err := apply(table, Action{Kind: ActToHand, Card: "c7"})

	if !errors.Is(err, ErrInvalid) || !reflect.DeepEqual(before, table) {
		t.Errorf("err = %v, table changed = %t", err, !reflect.DeepEqual(before, table))
	}
}

func TestToDeckTopBottom(t *testing.T) {
	table := newTestTable()

	mustApply(t, table, Action{Kind: ActToDeck, Card: "c3", Where: "top"})
	mustApply(t, table, Action{Kind: ActToDeck, Card: "c1", Where: "bottom"})

	want := []string{"c1", "c4", "c5", "c6", "c3"}
	if got := table.Piles["deck:p0"].Cards; !slices.Equal(got, want) {
		t.Errorf("deck = %v, want %v", got, want)
	}
	if got := table.Piles["disc:p0"].Cards; !slices.Equal(got, []string{"c2"}) {
		t.Errorf("disc:p0 = %v, want [c2]", got)
	}
	if got := table.Hands["p0"]; len(got) != 0 {
		t.Errorf("hand = %v, want empty", got)
	}
}

// shuffleTo completes a shuffle action the way resolve does: every card of
// order (old ids, in the wanted order) is renamed "n"+id, and Cards lists the
// new ids.
func shuffleTo(a Action, order ...string) Action {
	a.Renames = map[string]string{}
	a.Cards = nil
	for _, id := range order {
		a.Renames[id] = "n" + id
		a.Cards = append(a.Cards, "n"+id)
	}
	return a
}

func TestToDeckShuffle(t *testing.T) {
	table := newTestTable()

	mustApply(t, table, shuffleTo(Action{Kind: ActToDeck, Card: "c3", Where: "shuffle"}, "c6", "c3", "c4", "c5"))

	if got := table.Piles["deck:p0"].Cards; !slices.Equal(got, []string{"nc6", "nc3", "nc4", "nc5"}) {
		t.Errorf("deck = %v", got)
	}
	nc3 := table.Cards["nc3"]
	if _, ok := table.Cards["c3"]; ok || nc3 == nil || nc3.ID != "nc3" || nc3.Pile != "deck:p0" {
		t.Error("c3 was not renamed to nc3 in the deck")
	}
}

func TestToDeckShuffleRejectsBadOrder(t *testing.T) {
	for name, order := range map[string][]string{
		"missing card":   {"c6", "c4", "c5"},
		"extra card":     {"c6", "c3", "c4", "c5", "c1"},
		"duplicate card": {"c6", "c3", "c3", "c5"},
	} {
		t.Run(name, func(t *testing.T) {
			table := newTestTable()
			before := table.Clone()

			err := apply(table, shuffleTo(Action{Kind: ActToDeck, Card: "c3", Where: "shuffle"}, order...))

			if !errors.Is(err, ErrInvalid) || !reflect.DeepEqual(before, table) {
				t.Errorf("err = %v, table unchanged = %t", err, reflect.DeepEqual(before, table))
			}
		})
	}
}

func TestToPile(t *testing.T) {
	table := newTestTable()
	table.Cards["c7"].FaceDown = true

	mustApply(t, table, Action{Kind: ActToPile, Card: "c7", Target: PileVictory})
	mustApply(t, table, Action{Kind: ActToPile, Card: "c3", Target: "aside:p0"})

	if got := table.Piles[PileVictory].Cards; !slices.Equal(got, []string{"c7"}) || table.Cards["c7"].FaceDown {
		t.Errorf("vic = %v, c7 = %+v", got, table.Cards["c7"])
	}
	if got := table.Piles["aside:p0"].Cards; !slices.Equal(got, []string{"c3"}) {
		t.Errorf("aside:p0 = %v", got)
	}
}

func TestToPileRefusesOtherPiles(t *testing.T) {
	table := newTestTable()

	for _, target := range []string{"deck:p0", "disc:p0", PileEncounter, "nope"} {
		if err := apply(table, Action{Kind: ActToPile, Card: "c7", Target: target}); !errors.Is(err, ErrInvalid) {
			t.Errorf("target %q: err = %v, want ErrInvalid", target, err)
		}
	}
}

func TestUnknownIDIsRejected(t *testing.T) {
	table := newTestTable()
	before := table.Clone()

	err := apply(table, Action{Kind: ActMove, Card: "c999", X: 0, Y: 0})

	if !errors.Is(err, ErrInvalid) {
		t.Fatalf("err = %v, want ErrInvalid", err)
	}
	if !reflect.DeepEqual(before, table) {
		t.Error("table changed by a rejected action")
	}
}

func TestUnknownKindIsRejected(t *testing.T) {
	if err := apply(newTestTable(), Action{Kind: "bogus"}); !errors.Is(err, ErrInvalid) {
		t.Errorf("err = %v, want ErrInvalid", err)
	}
}

func TestPlayFromHand(t *testing.T) {
	table := newTestTable()

	mustApply(t, table, Action{Kind: ActPlay, Card: "c3", X: 247, Y: 83})

	c3 := table.Cards["c3"]
	if c3.Zone != ZoneTable || c3.X != 250 || c3.Y != 80 || c3.Z != 10 {
		t.Errorf("c3 = %+v, want on table at (250,80) with Z 10", c3)
	}
	if got := table.Hands["p0"]; len(got) != 0 {
		t.Errorf("hand = %v, want empty", got)
	}
}

func TestPlayFromPile(t *testing.T) {
	table := newTestTable()

	mustApply(t, table, Action{Kind: ActPlay, Card: "c4", X: 300, Y: 100})

	// Out of a deck, the card lands face down.
	c4 := table.Cards["c4"]
	if c4.Zone != ZoneTable || c4.Pile != "" || !c4.FaceDown || c4.X != 300 || c4.Y != 100 {
		t.Errorf("c4 = %+v, want face down on the table at (300,100)", c4)
	}
	if got := table.Piles["deck:p0"].Cards; !slices.Equal(got, []string{"c5", "c6"}) {
		t.Errorf("deck = %v, want [c5 c6]", got)
	}
}

func TestPlayUnderACard(t *testing.T) {
	table := newTestTable()

	// The position is the target's: what the client sends for it does not count.
	mustApply(t, table, Action{Kind: ActPlay, Card: "c3", Target: "c7", X: 10, Y: 10})

	c3, c7 := table.Cards["c3"], table.Cards["c7"]
	if c3.Zone != ZoneTable || c3.Parent != "c7" || c3.X != 600 || c3.Y != 40 {
		t.Errorf("c3 = %+v, want tucked under c7 at (600,40)", c3)
	}
	if c3.Z >= c7.Z {
		t.Errorf("c3.Z = %d, want below c7.Z = %d", c3.Z, c7.Z)
	}
	if got := table.Hands["p0"]; len(got) != 0 {
		t.Errorf("hand = %v, want empty", got)
	}
}

func TestPlayUnderACardFromAPile(t *testing.T) {
	table := newTestTable()

	mustApply(t, table, Action{Kind: ActPlay, Card: "c6", Target: "c1"})

	c6 := table.Cards["c6"]
	if c6.Zone != ZoneTable || c6.Pile != "" || !c6.FaceDown || c6.Parent != "c1" ||
		c6.X != 100 || c6.Y != 220 {
		t.Errorf("c6 = %+v, want face down under c1 at (100,220)", c6)
	}
	if got := table.Piles["deck:p0"].Cards; !slices.Equal(got, []string{"c4", "c5"}) {
		t.Errorf("deck = %v, want [c4 c5]", got)
	}
}

func TestPlayUnderACardWhereDropped(t *testing.T) {
	table := newTestTable()

	mustApply(t, table, Action{Kind: ActPlay, Card: "c3", Target: "c7", X: 712, Y: 4, Placed: true})

	c3, c7 := table.Cards["c3"], table.Cards["c7"]
	if c3.Zone != ZoneTable || c3.Parent != "c7" || c3.X != 710 || c3.Y != 0 || c3.Z >= c7.Z {
		t.Errorf("c3 = %+v, want under c7 where dropped, at (710,0)", c3)
	}

	// Moving the host carries it along, at the same offset.
	mustApply(t, table, Action{Kind: ActMove, Card: "c7", X: 800, Y: 100})
	if c3 := table.Cards["c3"]; c3.X != 910 || c3.Y != 80 {
		t.Errorf("c3 = (%d,%d) after its host moved, want (910,80)", c3.X, c3.Y)
	}
}

func TestPlayUnderRefusesATargetOffTheTable(t *testing.T) {
	for _, target := range []string{"c4", "c3", "nope"} {
		table := newTestTable()
		before := table.Clone()

		err := apply(table, Action{Kind: ActPlay, Card: "c5", Target: target})

		if !errors.Is(err, ErrInvalid) {
			t.Errorf("target %s: err = %v, want ErrInvalid", target, err)
		}
		if !reflect.DeepEqual(before, table) {
			t.Errorf("target %s: table changed by a rejected action", target)
		}
	}
}

// A card revealed on a deck is on the table already: played under itself or
// under a card tucked beneath it, it would make a cycle, as an attach would.
func TestPlayOfARevealedCardRefusesItselfOrItsAttachmentsAsTarget(t *testing.T) {
	for _, target := range []string{"c7", "c9"} {
		table := newTestTable()
		table.Cards["c7"].OnPile = PileEncounter
		table.Cards["c9"] = &Card{
			ID: "c9", Owner: NoOwner, Home: PileEncounter, Zone: ZoneTable, X: 600, Y: 40, Z: 5, Parent: "c7",
		}
		before := table.Clone()

		err := apply(table, Action{Kind: ActPlay, Card: "c7", Target: target})

		if !errors.Is(err, ErrInvalid) {
			t.Errorf("target %s: err = %v, want ErrInvalid", target, err)
		}
		if !reflect.DeepEqual(before, table) {
			t.Errorf("target %s: table changed by a rejected action", target)
		}
	}
}

func TestPlayRefusesCardsOutsideHandAndPiles(t *testing.T) {
	table := newStageTable()

	for _, id := range []string{"c1", "c22"} {
		if err := apply(table, Action{Kind: ActPlay, Card: id}); !errors.Is(err, ErrInvalid) {
			t.Errorf("card %s: err = %v, want ErrInvalid", id, err)
		}
	}
}

// newStageTable adds a two-card villain stage to the test table: Rhino I (c20)
// is current, on the table with 3 dmg and an attachment (c21); Rhino II (c22)
// waits in the stage zone.
func newStageTable() *Table {
	table := newTestTable()
	table.Cards["c20"] = &Card{
		ID: "c20", Owner: NoOwner, Zone: ZoneTable, X: 280, Y: 0, Z: 7, Faces: 2,
		Tokens: map[string]int{"dmg": 3}, Status: map[string]int{"tough": 1}, Exhausted: true,
	}
	table.Cards["c21"] = &Card{
		ID: "c21", Owner: NoOwner, Zone: ZoneTable, X: 280, Y: 20, Z: 6, Parent: "c20",
	}
	table.Cards["c22"] = &Card{ID: "c22", Owner: NoOwner, Zone: ZoneStage, Faces: 2}
	table.Stages = []*Stage{{Key: "villain", Label: "Villain", Current: "c20", Cards: []string{"c20", "c22"}}}
	return table
}

func TestTokenNeverNegative(t *testing.T) {
	table := newTestTable()

	mustApply(t, table, Action{Kind: ActToken, Card: "c1", Name: "dmg", Delta: 3})
	if got := table.Cards["c1"].Tokens["dmg"]; got != 5 {
		t.Errorf("dmg = %d, want 5", got)
	}

	mustApply(t, table, Action{Kind: ActToken, Card: "c1", Name: "dmg", Delta: -10})
	if _, ok := table.Cards["c1"].Tokens["dmg"]; ok {
		t.Errorf("tokens = %v, want the dmg entry deleted", table.Cards["c1"].Tokens)
	}

	mustApply(t, table, Action{Kind: ActToken, Card: "c2", Name: "thr", Delta: -1})
	if len(table.Cards["c2"].Tokens) != 0 {
		t.Errorf("tokens = %v, want none", table.Cards["c2"].Tokens)
	}
}

func TestStatusNeverNegative(t *testing.T) {
	table := newTestTable()

	mustApply(t, table, Action{Kind: ActStatus, Card: "c1", Name: "tough", Delta: 1})
	mustApply(t, table, Action{Kind: ActStatus, Card: "c1", Name: "stunned", Delta: -4})

	status := table.Cards["c1"].Status
	if status["tough"] != 1 || len(status) != 1 {
		t.Errorf("status = %v, want only tough=1", status)
	}
}

func TestTokenAndStatusRejectBadInput(t *testing.T) {
	tests := []Action{
		{Kind: ActToken, Card: "c1", Name: "stunned", Delta: 1},
		{Kind: ActToken, Card: "c1", Name: "bogus", Delta: 1},
		{Kind: ActStatus, Card: "c1", Name: "dmg", Delta: 1},
		{Kind: ActStatus, Card: "c1", Name: "acc", Delta: 1},
		{Kind: ActToken, Card: "c3", Name: "dmg", Delta: 1}, // in hand
		{Kind: ActStatus, Card: "c999", Name: "tough", Delta: 1},
	}
	for _, a := range tests {
		table := newTestTable()
		before := table.Clone()

		if err := apply(table, a); !errors.Is(err, ErrInvalid) {
			t.Errorf("%+v: err = %v, want ErrInvalid", a, err)
		}
		if !reflect.DeepEqual(before, table) {
			t.Errorf("%+v: table changed by a rejected action", a)
		}
	}
}

func TestExhaustSetsTheRecordedState(t *testing.T) {
	table := newTestTable() // c1 is exhausted

	mustApply(t, table, Action{Kind: ActExhaust, Card: "c1", Exhausted: new(true)})
	if !table.Cards["c1"].Exhausted {
		t.Error("c1 is ready, want it kept exhausted")
	}
	mustApply(t, table, Action{Kind: ActExhaust, Card: "c1", Exhausted: new(false)})
	if table.Cards["c1"].Exhausted {
		t.Error("c1 is still exhausted")
	}
	for name, a := range map[string]Action{
		"hand card":    {Kind: ActExhaust, Card: "c3", Exhausted: new(true)},
		"not resolved": {Kind: ActExhaust, Card: "c1"},
	} {
		if err := apply(table, a); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s: err = %v, want ErrInvalid", name, err)
		}
	}
}

func TestFlipSetsTheRecordedSide(t *testing.T) {
	table := newTestTable()
	c1 := table.Cards["c1"] // face 1 of 2
	c1.FaceDown = true

	mustApply(t, table, Action{Kind: ActFlip, Card: "c1", Face: 0, FaceDown: new(false)})

	if c1.FaceDown || c1.Face != 0 {
		t.Errorf("faceDown = %v, face = %d, want face up on face 0", c1.FaceDown, c1.Face)
	}
	for name, a := range map[string]Action{
		"no such face": {Kind: ActFlip, Card: "c1", Face: 2, FaceDown: new(false)},
		"not resolved": {Kind: ActFlip, Card: "c1"},
		"hand card":    {Kind: ActFlip, Card: "c3", FaceDown: new(false)},
	} {
		if err := apply(table, a); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s: err = %v, want ErrInvalid", name, err)
		}
	}
}

func TestChooseStageKeepsTokensOnPreviousCard(t *testing.T) {
	table := newStageTable()

	mustApply(t, table, Action{Kind: ActChooseStage, Stage: "villain", Card: "c22", Face: 1})

	next, prev, attachment := table.Cards["c22"], table.Cards["c20"], table.Cards["c21"]
	if next.Zone != ZoneTable || next.X != 280 || next.Y != 0 || next.Z != 7 {
		t.Errorf("c22 = %+v, want on the table at the position of c20", next)
	}
	if next.Face != 1 || next.Exhausted {
		t.Errorf("c22 face = %d, exhausted = %v, want face 1, ready", next.Face, next.Exhausted)
	}
	if prev.Zone != ZoneStage || prev.Tokens["dmg"] != 3 || prev.Status["tough"] != 1 {
		t.Errorf("c20 = %+v, want in the stage zone keeping dmg=3 and tough=1", prev)
	}
	if prev.Exhausted || prev.X != 0 || prev.Y != 0 {
		t.Errorf("c20 = %+v, want ready and without a position", prev)
	}
	if attachment.Parent != "c22" {
		t.Errorf("attachment parent = %q, want c22", attachment.Parent)
	}
	if table.Stages[0].Current != "c22" {
		t.Errorf("current = %q, want c22", table.Stages[0].Current)
	}
}

func TestChooseStageOtherFaceOfCurrent(t *testing.T) {
	table := newStageTable()
	before := table.Clone()

	mustApply(t, table, Action{Kind: ActChooseStage, Stage: "villain", Card: "c20", Face: 1})

	before.Cards["c20"].Face = 1
	if !reflect.DeepEqual(before, table) {
		t.Error("table differs from the original by more than the face of c20")
	}
}

func TestChooseStageRejectsBadInput(t *testing.T) {
	tests := []Action{
		{Kind: ActChooseStage, Stage: "nope", Card: "c22"},
		{Kind: ActChooseStage, Stage: "villain", Card: "c1"},           // not in the stage
		{Kind: ActChooseStage, Stage: "villain", Card: "c22", Face: 2}, // face out of range
		{Kind: ActChooseStage, Stage: "villain", Card: "c22", Face: -1},
	}
	for _, a := range tests {
		table := newStageTable()
		before := table.Clone()

		if err := apply(table, a); !errors.Is(err, ErrInvalid) {
			t.Errorf("%+v: err = %v, want ErrInvalid", a, err)
		}
		if !reflect.DeepEqual(before, table) {
			t.Errorf("%+v: table changed by a rejected action", a)
		}
	}
}

func TestDrawMovesTopCards(t *testing.T) {
	table := newTestTable()

	mustApply(t, table, Action{Kind: ActDraw, Area: "p0", Cards: []string{"c6", "c5"}})

	if got := table.Piles["deck:p0"].Cards; !slices.Equal(got, []string{"c4"}) {
		t.Errorf("deck = %v, want [c4]", got)
	}
	if got := table.Hands["p0"]; !slices.Equal(got, []string{"c3", "c6", "c5"}) {
		t.Errorf("hand = %v, want [c3 c6 c5]", got)
	}
	if c := table.Cards["c6"]; c.Zone != ZoneHand || c.Pile != "" || c.FaceDown {
		t.Errorf("c6 = %+v, want a face-up hand card", c)
	}
}

// TestDrawTakesRecordedCardsAnywhere draws cards that are no longer on top of
// the deck, as a rebuild after an undo may: they leave from where they are and
// reach the hand in the recorded order.
func TestDrawTakesRecordedCardsAnywhere(t *testing.T) {
	table := newTestTable()

	mustApply(t, table, Action{Kind: ActDraw, Area: "p0", Cards: []string{"c4", "c6"}})

	if got := table.Piles["deck:p0"].Cards; !slices.Equal(got, []string{"c5"}) {
		t.Errorf("deck = %v, want [c5]", got)
	}
	if got := table.Hands["p0"]; !slices.Equal(got, []string{"c3", "c4", "c6"}) {
		t.Errorf("hand = %v, want [c3 c4 c6]", got)
	}
	checkIntegrity(t, table)
}

func TestDrawRejectsWrongCards(t *testing.T) {
	for name, cards := range map[string][]string{
		"not in the deck": {"c8"},
		"twice":           {"c6", "c6"},
		"too many":        {"c6", "c5", "c4", "c3"},
		"none":            nil,
	} {
		t.Run(name, func(t *testing.T) {
			table := newTestTable()
			err := apply(table, Action{Kind: ActDraw, Area: "p0", Cards: cards})
			if !errors.Is(err, ErrInvalid) {
				t.Errorf("err = %v, want ErrInvalid", err)
			}
		})
	}
}

func TestRevealPutsTopCardOnPilePosition(t *testing.T) {
	table := newTestTable()
	table.Piles[PileEncounter].X, table.Piles[PileEncounter].Y = 0, 0
	table.Cards["c8"].FaceDown = true

	mustApply(t, table, Action{Kind: ActReveal, Cards: []string{"c8"}})

	c := table.Cards["c8"]
	if c.Zone != ZoneTable || c.OnPile != PileEncounter || c.FaceDown || c.Z != 10 {
		t.Errorf("c8 = %+v, want a face-up revealed table card with Z 10", c)
	}
	if len(table.Piles[PileEncounter].Cards) != 0 {
		t.Errorf("enc = %v, want empty", table.Piles[PileEncounter].Cards)
	}
}

func TestRevealAndDealTakeRecordedCardAnywhere(t *testing.T) {
	for _, kind := range []Kind{ActReveal, ActDeal} {
		t.Run(string(kind), func(t *testing.T) {
			table := newTestTable()
			table.Piles[PileEncounter].Cards = []string{"c8", "c9"}
			table.Cards["c9"] = &Card{ID: "c9", Owner: NoOwner, Home: PileEncounter, Zone: ZonePile, Pile: PileEncounter}

			mustApply(t, table, Action{Kind: kind, Area: "p1", Cards: []string{"c8"}})

			if c := table.Cards["c8"]; c.Zone != ZoneTable {
				t.Errorf("c8 = %+v, want it on the table", c)
			}
			if got := table.Piles[PileEncounter].Cards; !slices.Equal(got, []string{"c9"}) {
				t.Errorf("enc = %v, want [c9]", got)
			}
			checkIntegrity(t, table)
		})
	}
}

func TestRevealRefusedWhenOneRevealed(t *testing.T) {
	table := newTestTable()
	table.Cards["c7"].OnPile = PileEncounter

	if err := apply(table, Action{Kind: ActReveal, Cards: []string{"c8"}}); !errors.Is(err, ErrInvalid) {
		t.Errorf("err = %v, want ErrInvalid", err)
	}
}

func TestRevealRefusedWhenEncounterDeckEmpty(t *testing.T) {
	table := newTestTable()
	table.Piles[PileEncounter].Cards = nil

	if err := apply(table, Action{Kind: ActReveal}); !errors.Is(err, ErrInvalid) {
		t.Errorf("err = %v, want ErrInvalid", err)
	}
}

func TestRevealAndDealRejectAnotherCard(t *testing.T) {
	for name, a := range map[string]Action{
		"reveal": {Kind: ActReveal, Cards: []string{"c4"}},
		"deal":   {Kind: ActDeal, Area: "p1", Cards: []string{"c4"}},
		"none":   {Kind: ActDeal, Area: "p1"},
	} {
		t.Run(name, func(t *testing.T) {
			table := newTestTable()
			before := table.Clone()
			if err := apply(table, a); !errors.Is(err, ErrInvalid) {
				t.Errorf("err = %v, want ErrInvalid", err)
			}
			if !reflect.DeepEqual(table, before) {
				t.Error("the table changed")
			}
		})
	}
}

func TestDealFaceDown(t *testing.T) {
	table := newTestTable()

	mustApply(t, table, Action{Kind: ActDeal, Area: "p1", X: 104, Y: 96, Cards: []string{"c8"}})

	c := table.Cards["c8"]
	if c.Zone != ZoneTable || !c.FaceDown || c.X != 100 || c.Y != 100 || c.OnPile != "" {
		t.Errorf("c8 = %+v, want a face-down card at (100,100)", c)
	}
}

func TestDealWhileRevealedDealsTheRevealedCard(t *testing.T) {
	table := newTestTable()
	table.Cards["c7"].OnPile = PileEncounter

	mustApply(t, table, Action{Kind: ActDeal, Area: "p1", X: 0, Y: 0, Cards: []string{"c7"}})

	if c := table.Cards["c7"]; !c.FaceDown || c.OnPile != "" {
		t.Errorf("c7 = %+v, want dealt face down", c)
	}
	if got := table.Piles[PileEncounter].Cards; !slices.Equal(got, []string{"c8"}) {
		t.Errorf("enc = %v, want [c8]", got)
	}
}

func TestDiscardTop(t *testing.T) {
	table := newTestTable()

	mustApply(t, table, Action{Kind: ActDiscardTop, Pile: "deck:p0", N: 2, Cards: []string{"c6", "c5"}})

	if got := table.Piles["deck:p0"].Cards; !slices.Equal(got, []string{"c4"}) {
		t.Errorf("deck = %v, want [c4]", got)
	}
	if got := table.Piles["disc:p0"].Cards; !slices.Equal(got, []string{"c6", "c5"}) {
		t.Errorf("discard = %v, want [c6 c5]", got)
	}

	mustApply(t, table, Action{Kind: ActDiscardTop, Pile: PileEncounter, N: 1, Cards: []string{"c8"}})
	if got := table.Piles[PileEncounterDiscard].Cards; !slices.Equal(got, []string{"c8"}) {
		t.Errorf("encd = %v, want [c8]", got)
	}
}

func TestDiscardTopTakesRecordedCardsAnywhere(t *testing.T) {
	table := newTestTable()

	mustApply(t, table, Action{Kind: ActDiscardTop, Pile: "deck:p0", N: 2, Cards: []string{"c4", "c6"}})

	if got := table.Piles["deck:p0"].Cards; !slices.Equal(got, []string{"c5"}) {
		t.Errorf("deck = %v, want [c5]", got)
	}
	if got := table.Piles["disc:p0"].Cards; !slices.Equal(got, []string{"c4", "c6"}) {
		t.Errorf("discard = %v, want [c4 c6]", got)
	}
	checkIntegrity(t, table)
}

func TestDiscardTopRejectsBadInput(t *testing.T) {
	for name, a := range map[string]Action{
		"zero":        {Kind: ActDiscardTop, Pile: "deck:p0", N: 0},
		"too many":    {Kind: ActDiscardTop, Pile: "deck:p0", N: 4, Cards: []string{"c6", "c5", "c4", "c8"}},
		"not in pile": {Kind: ActDiscardTop, Pile: "deck:p0", N: 1, Cards: []string{"c8"}},
		"twice":       {Kind: ActDiscardTop, Pile: "deck:p0", N: 2, Cards: []string{"c6", "c6"}},
		"not a deck":  {Kind: ActDiscardTop, Pile: "disc:p0", N: 1, Cards: []string{"c6"}},
	} {
		t.Run(name, func(t *testing.T) {
			table := newTestTable()
			before := table.Clone()
			if err := apply(table, a); !errors.Is(err, ErrInvalid) {
				t.Errorf("err = %v, want ErrInvalid", err)
			}
			if !reflect.DeepEqual(table, before) {
				t.Error("table changed after a rejected action")
			}
		})
	}
}

func TestShuffleMustBePermutation(t *testing.T) {
	table := newTestTable()

	err := apply(table, shuffleTo(Action{Kind: ActShuffle, Pile: "deck:p0"}, "c1", "c2", "c3"))
	if !errors.Is(err, ErrInvalid) {
		t.Errorf("err = %v, want ErrInvalid", err)
	}

	mustApply(t, table, shuffleTo(Action{Kind: ActShuffle, Pile: "deck:p0"}, "c6", "c4", "c5"))
	if got := table.Piles["deck:p0"].Cards; !slices.Equal(got, []string{"nc6", "nc4", "nc5"}) {
		t.Errorf("deck = %v, want [nc6 nc4 nc5]", got)
	}
}

func TestShuffleBackAndIn(t *testing.T) {
	table := newTestTable()
	mustApply(t, table, Action{Kind: ActDiscard, Card: "c3"})

	bad := shuffleTo(Action{Kind: ActShuffleBack, Pile: "disc:p0"}, "c4", "c5", "c6")
	if err := apply(table, bad); !errors.Is(err, ErrInvalid) {
		t.Errorf("incomplete order: err = %v, want ErrInvalid", err)
	}

	mustApply(t, table, shuffleTo(Action{Kind: ActShuffleBack, Pile: "disc:p0"}, "c5", "c3", "c6", "c4"))
	if got := table.Piles["deck:p0"].Cards; !slices.Equal(got, []string{"nc5", "nc3", "nc6", "nc4"}) {
		t.Errorf("deck = %v, want [nc5 nc3 nc6 nc4]", got)
	}
	if len(table.Piles["disc:p0"].Cards) != 0 {
		t.Errorf("discard = %v, want empty", table.Piles["disc:p0"].Cards)
	}
	if c := table.Cards["nc3"]; c.Zone != ZonePile || c.Pile != "deck:p0" {
		t.Errorf("nc3 = %+v, want in deck:p0", c)
	}

	// c7 is an encounter card, c4 a player card: only c7 goes back to enc.
	mustApply(t, table, Action{Kind: ActToPile, Card: "c7", Target: PileScenarioAside})
	mustApply(t, table, Action{Kind: ActToPile, Card: "nc4", Target: PileScenarioAside})
	mustApply(t, table, shuffleTo(Action{Kind: ActShuffleIn, Pile: PileScenarioAside}, "c7", "c8"))
	if got := table.Piles[PileEncounter].Cards; !slices.Equal(got, []string{"nc7", "nc8"}) {
		t.Errorf("enc = %v, want [nc7 nc8]", got)
	}
	if got := table.Piles[PileScenarioAside].Cards; !slices.Equal(got, []string{"nc4"}) {
		t.Errorf("saside = %v, want [nc4]", got)
	}
}

func TestReorderTop(t *testing.T) {
	table := newTestTable()

	mustApply(t, table, Action{Kind: ActReorderTop, Pile: "deck:p0", Cards: []string{"c5", "c6"}})

	if got := table.Piles["deck:p0"].Cards; !slices.Equal(got, []string{"c4", "c6", "c5"}) {
		t.Errorf("deck = %v, want [c4 c6 c5]", got)
	}
	err := apply(table, Action{Kind: ActReorderTop, Pile: "deck:p0", Cards: []string{"c4", "c5"}})
	if !errors.Is(err, ErrInvalid) {
		t.Errorf("other set: err = %v, want ErrInvalid", err)
	}
}

func TestHandOrder(t *testing.T) {
	table := newTestTable()
	table.Hands["p0"] = []string{"c3", "c4"}

	mustApply(t, table, Action{Kind: ActHandOrder, Area: "p0", Cards: []string{"c4", "c3"}})
	if got := table.Hands["p0"]; !slices.Equal(got, []string{"c4", "c3"}) {
		t.Errorf("hand = %v, want [c4 c3]", got)
	}
	err := apply(table, Action{Kind: ActHandOrder, Area: "p0", Cards: []string{"c4"}})
	if !errors.Is(err, ErrInvalid) {
		t.Errorf("err = %v, want ErrInvalid", err)
	}
}

func TestFirstPlayer(t *testing.T) {
	table := newTestTable()

	mustApply(t, table, Action{Kind: ActMarker, Name: MarkerFirstPlayer, X: 423, Y: 7})

	if want := (Point{X: 420, Y: 10}); table.FirstPlayer != want {
		t.Errorf("FirstPlayer = %+v, want %+v", table.FirstPlayer, want)
	}
}

func TestArrowsPerSeat(t *testing.T) {
	table := newTestTable()
	mustApply(t, table, Action{Kind: ActArrowAdd, Card: "c1", Target: "c7", Seat: 0})
	mustApply(t, table, Action{Kind: ActArrowAdd, Card: "c7", Target: "c1", Seat: 1})

	mustApply(t, table, Action{Kind: ActArrowClear, Seat: 1})

	want := []Arrow{{From: "c1", To: "c7", Seat: 0}}
	if !reflect.DeepEqual(table.Arrows, want) {
		t.Errorf("arrows = %v, want %v", table.Arrows, want)
	}
}

func TestArrowAddRequiresTableCards(t *testing.T) {
	table := newTestTable()

	err := apply(table, Action{Kind: ActArrowAdd, Card: "c1", Target: "c3", Seat: 0})
	if !errors.Is(err, ErrInvalid) {
		t.Errorf("err = %v, want ErrInvalid", err)
	}
}

func TestLeavingTableRemovesArrows(t *testing.T) {
	table := newTestTable()
	table.Cards["c9"] = &Card{ID: "c9", Owner: 0, Home: "deck:p0", Zone: ZoneTable, Z: 1}
	mustApply(t, table, Action{Kind: ActArrowAdd, Card: "c1", Target: "c7", Seat: 0})
	mustApply(t, table, Action{Kind: ActArrowAdd, Card: "c7", Target: "c2", Seat: 1})
	mustApply(t, table, Action{Kind: ActArrowAdd, Card: "c7", Target: "c9", Seat: 1})

	// c2 is tucked under c1 and leaves the table with it.
	mustApply(t, table, Action{Kind: ActDiscard, Card: "c1"})

	want := []Arrow{{From: "c7", To: "c9", Seat: 1}}
	if !reflect.DeepEqual(table.Arrows, want) {
		t.Errorf("arrows = %v, want %v", table.Arrows, want)
	}
}

func TestHandOrderWithNilHands(t *testing.T) {
	table := newTestTable()
	table.Hands = nil

	mustApply(t, table, Action{Kind: ActHandOrder, Area: "p1", Cards: []string{}})

	if len(table.Hands["p1"]) != 0 {
		t.Errorf("hand = %v, want empty", table.Hands["p1"])
	}
}

func TestHandOrderRefusesUnknownArea(t *testing.T) {
	err := apply(newTestTable(), Action{Kind: ActHandOrder, Area: "villain", Cards: []string{}})
	if !errors.Is(err, ErrInvalid) {
		t.Errorf("err = %v, want ErrInvalid", err)
	}
}

func TestChooseStageRemovesArrowsOfPreviousCard(t *testing.T) {
	table := newStageTable()
	mustApply(t, table, Action{Kind: ActArrowAdd, Card: "c20", Target: "c7", Seat: 0})
	mustApply(t, table, Action{Kind: ActArrowAdd, Card: "c7", Target: "c1", Seat: 0})

	mustApply(t, table, Action{Kind: ActChooseStage, Stage: "villain", Card: "c22", Face: 0})

	want := []Arrow{{From: "c7", To: "c1", Seat: 0}}
	if !reflect.DeepEqual(table.Arrows, want) {
		t.Errorf("arrows = %v, want %v", table.Arrows, want)
	}
}

func TestShuffleRejectsDuplicateNewIDs(t *testing.T) {
	table := newTestTable()
	before := table.Clone()

	a := Action{Kind: ActShuffle, Pile: "deck:p0", Cards: []string{"x", "x", "y"}}
	a.Renames = map[string]string{"c4": "x", "c5": "x", "c6": "y"}
	err := apply(table, a)

	if !errors.Is(err, ErrInvalid) || !reflect.DeepEqual(before, table) {
		t.Errorf("err = %v, table unchanged = %t", err, reflect.DeepEqual(before, table))
	}
}

func TestStageCurrentCardStaysOnTheTable(t *testing.T) {
	tests := []struct {
		name string
		// prepare changes the stage table before the refused action.
		prepare func(t *testing.T, table *Table)
		a       Action
	}{
		{"discard", nil, Action{Kind: ActDiscard, Card: "c20"}},
		{"to victory", nil, Action{Kind: ActToPile, Card: "c20", Target: PileVictory}},
		{"to deck top", nil, Action{Kind: ActToDeck, Card: "c20", Where: whereTop}},
		{"to hand", nil, Action{Kind: ActToHand, Card: "c20"}},
		{"shuffled into deck", nil, shuffleTo(Action{Kind: ActToDeck, Card: "c20", Where: whereShuffle}, "c8", "c20")},
		{
			"discard the card it is attached to",
			func(t *testing.T, table *Table) {
				mustApply(t, table, Action{Kind: ActAttach, Card: "c20", Target: "c7"})
			},
			Action{Kind: ActDiscard, Card: "c7"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			table := newStageTable()
			table.Cards["c20"].Home = PileEncounter
			if tt.prepare != nil {
				tt.prepare(t, table)
			}
			before := table.Clone()

			err := apply(table, tt.a)

			if !errors.Is(err, ErrInvalid) {
				t.Errorf("err = %v, want ErrInvalid", err)
			}
			if !reflect.DeepEqual(before, table) {
				t.Error("the refused action changed the table")
			}
		})
	}
}

// newIdentityTable is newTestTable with the ally c1, which carries the
// upgrade c2, standing for seat 0's identity.
func newIdentityTable() *Table {
	table := newTestTable()
	table.Cards["c1"].Identity = true
	return table
}

func TestIdentityCardStaysOnTheTable(t *testing.T) {
	tests := []struct {
		name string
		// prepare changes the table before the refused action.
		prepare func(t *testing.T, table *Table)
		a       Action
	}{
		{"discard", nil, Action{Kind: ActDiscard, Card: "c1"}},
		{"to hand", nil, Action{Kind: ActToHand, Card: "c1"}},
		{"to deck top", nil, Action{Kind: ActToDeck, Card: "c1", Where: whereTop}},
		{"to deck bottom", nil, Action{Kind: ActToDeck, Card: "c1", Where: whereBottom}},
		{
			"shuffled into deck",
			nil,
			shuffleTo(Action{Kind: ActToDeck, Card: "c1", Where: whereShuffle}, "c4", "c5", "c6", "c1"),
		},
		{"to victory", nil, Action{Kind: ActToPile, Card: "c1", Target: PileVictory}},
		{"set aside", nil, Action{Kind: ActToPile, Card: "c1", Target: "aside:p0"}},
		{"in a group", nil, group(Action{Kind: ActDiscard, Card: "c7"}, Action{Kind: ActDiscard, Card: "c1"})},
		{
			"discard the card it is attached to",
			func(t *testing.T, table *Table) {
				mustApply(t, table, Action{Kind: ActAttach, Card: "c1", Target: "c7"})
			},
			Action{Kind: ActDiscard, Card: "c7"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			table := newIdentityTable()
			if tt.prepare != nil {
				tt.prepare(t, table)
			}
			before := table.Clone()

			err := apply(table, tt.a)

			if !errors.Is(err, ErrInvalid) || !strings.Contains(err.Error(), "the identity card stays on the table") {
				t.Errorf("err = %v, want the identity card to stay on the table", err)
			}
			if !reflect.DeepEqual(before, table) {
				t.Error("the refused action changed the table")
			}
		})
	}
}

func TestIdentityCardIsPlayedOnTheTable(t *testing.T) {
	tests := []struct {
		name string
		a    Action
	}{
		{"move", Action{Kind: ActMove, Card: "c1", X: 300, Y: 300}},
		{"exhaust", Action{Kind: ActExhaust, Card: "c1", Exhausted: new(false)}},
		{"flip", Action{Kind: ActFlip, Card: "c1", Face: 0, FaceDown: new(false)}},
		{"token", Action{Kind: ActToken, Card: "c1", Name: "dmg", Delta: 1}},
		{"status", Action{Kind: ActStatus, Card: "c1", Name: "tough", Delta: 1}},
		{"modifier", Action{Kind: ActModifier, Card: "c1", Name: "def", Delta: 1}},
		{"arrow", Action{Kind: ActArrowAdd, Card: "c7", Target: "c1", Seat: 1}},
		{"ready all", Action{Kind: ActReadyAll, Cards: []string{"c1"}}},
		{"play under it", Action{Kind: ActPlay, Card: "c3", Target: "c1"}},
		{"attach under it", Action{Kind: ActAttach, Card: "c7", Target: "c1"}},
		{"attach it under another card", Action{Kind: ActAttach, Card: "c1", Target: "c7"}},
		{"discard what is tucked under it", Action{Kind: ActDiscard, Card: "c2"}},
		{
			"move as a group",
			group(Action{Kind: ActMove, Card: "c1", X: 300, Y: 300}, Action{Kind: ActMove, Card: "c7", X: 500, Y: 300}),
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			table := newIdentityTable()

			mustApply(t, table, tt.a)

			if c1 := table.Cards["c1"]; c1.Zone != ZoneTable || !c1.Identity {
				t.Errorf("c1 = %+v, want the identity on the table", c1)
			}
		})
	}
}

func TestRenameCardsRewritesStages(t *testing.T) {
	table := newStageTable()

	renameCards(table, map[string]string{"c20": "n20", "c22": "n22"})

	stage := table.stage("villain")
	if stage.Current != "n20" || !slices.Equal(stage.Cards, []string{"n20", "n22"}) {
		t.Errorf("stage = %+v, want current n20 and cards [n20 n22]", stage)
	}
	if got := table.Cards["c21"].Parent; got != "n20" {
		t.Errorf("c21 parent = %q, want n20", got)
	}
}
