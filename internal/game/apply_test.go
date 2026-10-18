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

func TestToDeckShuffle(t *testing.T) {
	table := newTestTable()

	mustApply(t, table, Action{Kind: ActToDeck, Card: "c3", Where: "shuffle", Cards: []string{"c6", "c3", "c4", "c5"}})

	if got := table.Piles["deck:p0"].Cards; !slices.Equal(got, []string{"c6", "c3", "c4", "c5"}) {
		t.Errorf("deck = %v", got)
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

			err := apply(table, Action{Kind: ActToDeck, Card: "c3", Where: "shuffle", Cards: order})

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

func TestPlayRefusesCardsOutsideHand(t *testing.T) {
	table := newTestTable()

	for _, id := range []string{"c1", "c4"} {
		if err := apply(table, Action{Kind: ActPlay, Card: id, Area: "p0"}); !errors.Is(err, ErrInvalid) {
			t.Errorf("card %s: err = %v, want ErrInvalid", id, err)
		}
	}
}
