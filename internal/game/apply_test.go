package game

import (
	"errors"
	"reflect"
	"slices"
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
				ID: "c1", Owner: 0, Home: "deck:p0", Zone: ZoneTable, Area: "p0", X: 100, Y: 200, Z: 5,
				Tokens: map[string]int{"dmg": 2}, Status: map[string]int{"stunned": 1}, Exhausted: true, Face: 1, Faces: 2,
			},
			"c2": {ID: "c2", Owner: 0, Home: "deck:p0", Zone: ZoneTable, Area: "p0", X: 100, Y: 220, Z: 4, Parent: "c1"},
			"c3": {ID: "c3", Owner: 0, Home: "deck:p0", Zone: ZoneHand, Area: "p0"},
			"c4": {ID: "c4", Owner: 0, Home: "deck:p0", Zone: ZonePile, Pile: "deck:p0"},
			"c5": {ID: "c5", Owner: 0, Home: "deck:p0", Zone: ZonePile, Pile: "deck:p0"},
			"c6": {ID: "c6", Owner: 0, Home: "deck:p0", Zone: ZonePile, Pile: "deck:p0"},
			"c7": {ID: "c7", Owner: NoOwner, Home: PileEncounter, Zone: ZoneTable, Area: AreaVillain, X: 600, Y: 20, Z: 6},
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

	mustApply(t, table, Action{Kind: ActMove, Card: "c1", Area: "p1", X: 304, Y: 296})

	c1, c2 := table.Cards["c1"], table.Cards["c2"]
	if c1.Area != "p1" || c1.X != 300 || c1.Y != 300 {
		t.Errorf("c1 at %s (%d,%d), want p1 (300,300)", c1.Area, c1.X, c1.Y)
	}
	if c2.Area != "p1" || c2.X != 300 || c2.Y != 320 {
		t.Errorf("c2 at %s (%d,%d), want p1 (300,320)", c2.Area, c2.X, c2.Y)
	}
	if c2.Parent != "c1" {
		t.Errorf("c2 parent = %q, want c1", c2.Parent)
	}
	if c2.Z >= c1.Z || c1.Z != 11 {
		t.Errorf("Z c1=%d c2=%d, want c2 below c1 and c1 on top", c1.Z, c2.Z)
	}
}

func TestMoveClearsOnPile(t *testing.T) {
	table := newTestTable()
	table.Cards["c7"].OnPile = PileEncounter

	mustApply(t, table, Action{Kind: ActMove, Card: "c7", Area: AreaVillain, X: 700, Y: 0})

	if got := table.Cards["c7"].OnPile; got != "" {
		t.Errorf("OnPile = %q, want empty", got)
	}
}

func TestAttach(t *testing.T) {
	table := newTestTable()

	mustApply(t, table, Action{Kind: ActAttach, Card: "c7", Target: "c1"})

	c7 := table.Cards["c7"]
	if c7.Parent != "c1" || c7.Area != "p0" || c7.X != 100 || c7.Y != 220 || c7.Z >= table.Cards["c1"].Z {
		t.Errorf("c7 = %+v, want tucked under c1 at (100,220)", c7)
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
	if _, ok := table.Cards["c3"]; ok || table.Cards["nc3"] == nil || table.Cards["nc3"].ID != "nc3" || table.Cards["nc3"].Pile != "deck:p0" {
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

	err := apply(table, Action{Kind: ActMove, Card: "c999", Area: "p0", X: 0, Y: 0})

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

	mustApply(t, table, Action{Kind: ActPlay, Card: "c3", Area: "p0", X: 247, Y: 83})

	c3 := table.Cards["c3"]
	if c3.Zone != ZoneTable || c3.Area != "p0" || c3.X != 250 || c3.Y != 80 || c3.Z != 10 {
		t.Errorf("c3 = %+v, want on table at (250,80) with Z 10", c3)
	}
	if got := table.Hands["p0"]; len(got) != 0 {
		t.Errorf("hand = %v, want empty", got)
	}
}

func TestPlayFromPile(t *testing.T) {
	table := newTestTable()
	table.Cards["c4"].FaceDown = true

	mustApply(t, table, Action{Kind: ActPlay, Card: "c4", Area: "p0", X: 300, Y: 100})

	c4 := table.Cards["c4"]
	if c4.Zone != ZoneTable || c4.Pile != "" || c4.FaceDown || c4.X != 300 || c4.Y != 100 {
		t.Errorf("c4 = %+v, want face up on the table at (300,100)", c4)
	}
	if got := table.Piles["deck:p0"].Cards; !slices.Equal(got, []string{"c5", "c6"}) {
		t.Errorf("deck = %v, want [c5 c6]", got)
	}
}

func TestPlayRefusesCardsOutsideHandAndPiles(t *testing.T) {
	table := newStageTable()

	for _, id := range []string{"c1", "c22"} {
		if err := apply(table, Action{Kind: ActPlay, Card: id, Area: "p0"}); !errors.Is(err, ErrInvalid) {
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
		ID: "c20", Owner: NoOwner, Zone: ZoneTable, Area: AreaVillain, X: 280, Y: 0, Z: 7, Faces: 2,
		Tokens: map[string]int{"dmg": 3}, Status: map[string]int{"tough": 1}, Exhausted: true,
	}
	table.Cards["c21"] = &Card{
		ID: "c21", Owner: NoOwner, Zone: ZoneTable, Area: AreaVillain, X: 280, Y: 20, Z: 6, Parent: "c20",
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

func TestExhaustToggles(t *testing.T) {
	table := newTestTable()

	mustApply(t, table, Action{Kind: ActExhaust, Card: "c1"})
	if table.Cards["c1"].Exhausted {
		t.Error("c1 still exhausted after the first toggle")
	}
	mustApply(t, table, Action{Kind: ActExhaust, Card: "c1"})
	if !table.Cards["c1"].Exhausted {
		t.Error("c1 not exhausted after the second toggle")
	}
	if err := apply(table, Action{Kind: ActExhaust, Card: "c3"}); !errors.Is(err, ErrInvalid) {
		t.Errorf("hand card: err = %v, want ErrInvalid", err)
	}
}

func TestFlipCyclesAndRevealsFaceDown(t *testing.T) {
	table := newTestTable()
	c1 := table.Cards["c1"] // Face 1 of 2

	mustApply(t, table, Action{Kind: ActFlip, Card: "c1"})
	if c1.Face != 0 {
		t.Errorf("face = %d, want 0 after wrapping", c1.Face)
	}
	mustApply(t, table, Action{Kind: ActFlip, Card: "c1"})
	if c1.Face != 1 {
		t.Errorf("face = %d, want 1", c1.Face)
	}

	c1.FaceDown = true
	mustApply(t, table, Action{Kind: ActFlip, Card: "c1"})
	if c1.FaceDown || c1.Face != 1 {
		t.Errorf("faceDown = %v, face = %d, want face up on face 1", c1.FaceDown, c1.Face)
	}
}

func TestFlipSingleFacedCardStaysOnFaceZero(t *testing.T) {
	table := newTestTable() // c7 has no Faces set

	mustApply(t, table, Action{Kind: ActFlip, Card: "c7"})

	if table.Cards["c7"].Face != 0 {
		t.Errorf("face = %d, want 0", table.Cards["c7"].Face)
	}
}

func TestChooseStageKeepsTokensOnPreviousCard(t *testing.T) {
	table := newStageTable()

	mustApply(t, table, Action{Kind: ActChooseStage, Stage: "villain", Card: "c22", Face: 1})

	next, prev, attachment := table.Cards["c22"], table.Cards["c20"], table.Cards["c21"]
	if next.Zone != ZoneTable || next.Area != AreaVillain || next.X != 280 || next.Y != 0 || next.Z != 7 {
		t.Errorf("c22 = %+v, want on the table at the position of c20", next)
	}
	if next.Face != 1 || next.Exhausted {
		t.Errorf("c22 face = %d, exhausted = %v, want face 1, ready", next.Face, next.Exhausted)
	}
	if prev.Zone != ZoneStage || prev.Tokens["dmg"] != 3 || prev.Status["tough"] != 1 {
		t.Errorf("c20 = %+v, want in the stage zone keeping dmg=3 and tough=1", prev)
	}
	if prev.Exhausted || prev.Area != "" || prev.X != 0 || prev.Y != 0 {
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

func TestDrawRejectsWrongCards(t *testing.T) {
	for name, cards := range map[string][]string{
		"not the top": {"c5"},
		"wrong order": {"c5", "c6"},
		"too many":    {"c6", "c5", "c4", "c3"},
		"none":        nil,
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
	table.Piles[PileEncounter].Area = AreaVillain
	table.Piles[PileEncounter].X, table.Piles[PileEncounter].Y = 0, 0
	table.Cards["c8"].FaceDown = true

	mustApply(t, table, Action{Kind: ActReveal, Cards: []string{"c8"}})

	c := table.Cards["c8"]
	if c.Zone != ZoneTable || c.Area != AreaVillain || c.OnPile != PileEncounter || c.FaceDown || c.Z != 10 {
		t.Errorf("c8 = %+v, want a face-up revealed table card with Z 10", c)
	}
	if len(table.Piles[PileEncounter].Cards) != 0 {
		t.Errorf("enc = %v, want empty", table.Piles[PileEncounter].Cards)
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
	if c.Zone != ZoneTable || !c.FaceDown || c.Area != "p1" || c.X != 100 || c.Y != 100 || c.OnPile != "" {
		t.Errorf("c8 = %+v, want a face-down card at p1 (100,100)", c)
	}
}

func TestDealWhileRevealedDealsTheRevealedCard(t *testing.T) {
	table := newTestTable()
	table.Cards["c7"].OnPile = PileEncounter

	mustApply(t, table, Action{Kind: ActDeal, Area: "p1", X: 0, Y: 0, Cards: []string{"c7"}})

	if c := table.Cards["c7"]; !c.FaceDown || c.OnPile != "" || c.Area != "p1" {
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

func TestDiscardTopRejectsBadInput(t *testing.T) {
	for name, a := range map[string]Action{
		"zero":        {Kind: ActDiscardTop, Pile: "deck:p0", N: 0},
		"too many":    {Kind: ActDiscardTop, Pile: "deck:p0", N: 4, Cards: []string{"c6", "c5", "c4", "c8"}},
		"not the top": {Kind: ActDiscardTop, Pile: "deck:p0", N: 1, Cards: []string{"c4"}},
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

	mustApply(t, table, Action{Kind: ActFirstPlayer, Area: "p1", X: 423, Y: 7})

	if want := (Point{Area: "p1", X: 420, Y: 10}); table.FirstPlayer != want {
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
	table.Cards["c9"] = &Card{ID: "c9", Owner: 0, Home: "deck:p0", Zone: ZoneTable, Area: "p0", Z: 1}
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

func TestHandOrderRefusesVillainArea(t *testing.T) {
	err := apply(newTestTable(), Action{Kind: ActHandOrder, Area: AreaVillain, Cards: []string{}})
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
