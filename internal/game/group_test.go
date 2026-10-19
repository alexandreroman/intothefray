package game

import (
	"errors"
	"fmt"
	"maps"
	"reflect"
	"slices"
	"strings"
	"testing"
)

// group returns a group action of subs.
func group(subs ...Action) Action {
	return Action{Kind: ActGroup, Actions: subs}
}

// checkPileCards fails when pile id does not hold exactly want, bottom first.
func checkPileCards(t *testing.T, table *Table, id string, want ...string) {
	t.Helper()
	if got := table.Piles[id].Cards; !slices.Equal(got, want) {
		t.Errorf("pile %s = %v, want %v", id, got, want)
	}
}

func TestGroupMoveKeepsOffsets(t *testing.T) {
	table := newTestTable()

	// c1 carries c2; both units move by (+400,+300).
	mustApply(t, table, group(
		Action{Kind: ActMove, Card: "c1", X: 500, Y: 500},
		Action{Kind: ActMove, Card: "c7", X: 1000, Y: 320},
	))

	c1, c2, c7 := table.Cards["c1"], table.Cards["c2"], table.Cards["c7"]
	if c1.X != 500 || c1.Y != 500 {
		t.Errorf("c1 at (%d,%d), want (500,500)", c1.X, c1.Y)
	}
	if c2.X != 500 || c2.Y != 520 || c2.Parent != "c1" {
		t.Errorf("c2 at (%d,%d) under %q, want (500,520) under c1", c2.X, c2.Y, c2.Parent)
	}
	if c7.X != 1000 || c7.Y != 320 {
		t.Errorf("c7 at (%d,%d), want (1000,320)", c7.X, c7.Y)
	}
	if c2.Z >= c1.Z || c1.Z >= c7.Z {
		t.Errorf("Z c2=%d c1=%d c7=%d, want c2 < c1 < c7 (sub order)", c2.Z, c1.Z, c7.Z)
	}
}

func TestGroupDiscard(t *testing.T) {
	table := newTestTable()
	mustApply(t, table, Action{Kind: ActPlay, Card: "c3", X: 300, Y: 200})

	mustApply(t, table, group(
		Action{Kind: ActDiscard, Card: "c1"},
		Action{Kind: ActDiscard, Card: "c3"},
		Action{Kind: ActDiscard, Card: "c7"},
	))

	// c2, tucked under c1, is discarded with it.
	checkPileCards(t, table, "disc:p0", "c2", "c1", "c3")
	checkPileCards(t, table, PileEncounterDiscard, "c7")
	for _, id := range []string{"c1", "c2", "c3", "c7"} {
		if c := table.Cards[id]; c.Zone != ZonePile || c.Parent != "" {
			t.Errorf("%s in zone %q under %q, want in a pile, free", id, c.Zone, c.Parent)
		}
	}
}

func TestGroupToHand(t *testing.T) {
	f := multiDeckFixture(t)
	// Alex draws a card from each of his decks and plays both.
	f.mustDoAs(t, "a", 0, Action{Kind: ActDraw, N: 1, Pile: "deck:p0"}, at(1))
	f.mustDoAs(t, "a", 0, Action{Kind: ActDraw, N: 1, Pile: "deck:p1"}, at(2))
	first, second := f.g.Table.Hands["p0"][0], f.g.Table.Hands["p1"][0]
	f.mustDoAs(t, "a", 0, Action{Kind: ActPlay, Card: first, X: 400, Y: 400}, at(3))
	f.mustDoAs(t, "a", 1, Action{Kind: ActPlay, Card: second, X: 600, Y: 400}, at(4))

	f.mustDoAs(t, "a", 0, group(
		Action{Kind: ActToHand, Card: first},
		Action{Kind: ActToHand, Card: second},
	), at(5))

	if got := f.g.Table.Hands["p0"]; !slices.Equal(got, []string{first}) {
		t.Errorf("hand p0 = %v, want [%s]", got, first)
	}
	if got := f.g.Table.Hands["p1"]; !slices.Equal(got, []string{second}) {
		t.Errorf("hand p1 = %v, want [%s]", got, second)
	}
	event := f.lastEvent(t)
	if event.Seat != 0 || event.Action.Seat != 0 {
		t.Errorf("event seat = %d, action seat = %d, want 0", event.Seat, event.Action.Seat)
	}
	for i, sub := range event.Action.Actions {
		if sub.Seat != 0 {
			t.Errorf("sub %d seat = %d, want the credited seat 0", i, sub.Seat)
		}
	}
}

func TestGroupToPileVictory(t *testing.T) {
	table := newTestTable()

	mustApply(t, table, group(
		Action{Kind: ActToPile, Card: "c1", Target: PileVictory},
		Action{Kind: ActToPile, Card: "c7", Target: PileVictory},
	))

	checkPileCards(t, table, PileVictory, "c1", "c7")
	checkPileCards(t, table, "disc:p0", "c2")
}

func TestGroupApplyFailureLeavesTable(t *testing.T) {
	table := newTestTable()
	before := table.Clone()

	// c4 lies in a deck: the second move fails after the first one ran.
	err := apply(table, group(
		Action{Kind: ActMove, Card: "c7", X: 1000, Y: 1000},
		Action{Kind: ActMove, Card: "c4", X: 1200, Y: 1000},
	))

	if !errors.Is(err, ErrInvalid) {
		t.Errorf("apply() = %v, want ErrInvalid", err)
	}
	if !reflect.DeepEqual(table, before) {
		t.Error("a failed group changed the table")
	}
}

// checkGroupRejected fails unless resolving a for seat 0 of f gives want.
func checkGroupRejected(t *testing.T, f *resolveFixture, a Action, want error) {
	t.Helper()
	if _, err := resolve(f.g, f.g.actorOf(0), a, newTestRNG()); !errors.Is(err, want) {
		t.Errorf("resolve() = %v, want %v", err, want)
	}
}

func TestGroupResolveCreditsEverySub(t *testing.T) {
	f := newResolveFixture(t)

	resolved, err := resolve(f.g, f.g.actorOf(0), group(
		Action{Kind: ActMove, Card: f.ownTable, X: 100, Y: 100, Seat: 3},
		Action{Kind: ActMove, Card: f.encTable, X: 300, Y: 100},
	), newTestRNG())
	if err != nil {
		t.Fatalf("resolve() = %v", err)
	}
	if resolved.Seat != 0 || len(resolved.Actions) != 2 {
		t.Fatalf("resolved = %+v, want seat 0 and two subs", resolved)
	}
	for i, sub := range resolved.Actions {
		if sub.Seat != 0 {
			t.Errorf("sub %d seat = %d, want 0", i, sub.Seat)
		}
	}
}

func TestGroupRejectsMixedKinds(t *testing.T) {
	f := newResolveFixture(t)

	checkGroupRejected(t, f, group(
		Action{Kind: ActMove, Card: f.ownTable, X: 100, Y: 100},
		Action{Kind: ActDiscard, Card: f.encTable},
	), ErrInvalid)
}

func TestGroupRejectsUngroupableKind(t *testing.T) {
	f := newResolveFixture(t)

	checkGroupRejected(t, f, group(
		Action{Kind: ActExhaust, Card: f.ownTable},
		Action{Kind: ActExhaust, Card: f.encTable},
	), ErrInvalid)
}

func TestGroupRejectsNested(t *testing.T) {
	f := newResolveFixture(t)
	inner := group(
		Action{Kind: ActDiscard, Card: f.ownTable},
		Action{Kind: ActDiscard, Card: f.encTable},
	)

	checkGroupRejected(t, f, group(inner, inner), ErrInvalid)
}

func TestGroupRejectsDuplicateCard(t *testing.T) {
	f := newResolveFixture(t)

	checkGroupRejected(t, f, group(
		Action{Kind: ActMove, Card: f.ownTable, X: 100, Y: 100},
		Action{Kind: ActMove, Card: f.ownTable, X: 300, Y: 100},
	), ErrInvalid)
}

func TestGroupRejectsDescendant(t *testing.T) {
	f := newResolveFixture(t)
	mustApply(t, f.g.Table, Action{Kind: ActAttach, Card: f.encTable, Target: f.ownTable})
	host := Action{Kind: ActDiscard, Card: f.ownTable}
	tucked := Action{Kind: ActDiscard, Card: f.encTable}

	checkGroupRejected(t, f, group(host, tucked), ErrInvalid)
	checkGroupRejected(t, f, group(tucked, host), ErrInvalid)
}

func TestGroupRejectsOneOrTooMany(t *testing.T) {
	f := newResolveFixture(t)
	// The table holds fewer cards than a group may move: the extra subs
	// name unknown cards, which only the count check reports first.
	ids := slices.Sorted(maps.Keys(f.g.Table.Cards))
	var tooMany []Action
	for i := range maxCount + 1 {
		id := fmt.Sprintf("unknown-%d", i)
		if i < len(ids) {
			id = ids[i]
		}
		tooMany = append(tooMany, Action{Kind: ActMove, Card: id, X: 100, Y: 100})
	}

	tests := []struct {
		name string
		subs []Action
	}{
		{"none", nil},
		{"one", []Action{{Kind: ActMove, Card: f.ownTable, X: 100, Y: 100}}},
		{"too many", tooMany},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := resolve(f.g, f.g.actorOf(0), group(tt.subs...), newTestRNG())
			if !errors.Is(err, ErrInvalid) || !strings.Contains(err.Error(), "a group holds") {
				t.Errorf("resolve() = %v, want ErrInvalid on the count", err)
			}
		})
	}
}

func TestGroupForbiddenSubIsAllOrNothing(t *testing.T) {
	f := newDoFixture(t)
	before := f.g.Table.Clone()
	events := len(f.g.History.Events)

	// Bob takes his own identity, then the host's.
	err := f.do("b", group(
		Action{Kind: ActToHand, Card: identityOf(t, f.g, 1)},
		Action{Kind: ActToHand, Card: identityOf(t, f.g, 0)},
	), at(1))

	if !errors.Is(err, ErrForbidden) {
		t.Errorf("Do() = %v, want ErrForbidden", err)
	}
	if !reflect.DeepEqual(f.g.Table, before) {
		t.Error("a forbidden group changed the table")
	}
	if got := len(f.g.History.Events); got != events {
		t.Errorf("history holds %d events, want %d", got, events)
	}
}

func TestGroupRejectsShuffleWhere(t *testing.T) {
	f := newResolveFixture(t)
	toDeck := func(where string) Action {
		return group(
			Action{Kind: ActToDeck, Card: f.hand, Where: where},
			Action{Kind: ActToDeck, Card: f.ownTable, Where: where},
		)
	}

	checkGroupRejected(t, f, toDeck(whereShuffle), ErrInvalid)
	for _, where := range []string{whereTop, whereBottom} {
		if _, err := resolve(f.g, f.g.actorOf(0), toDeck(where), newTestRNG()); err != nil {
			t.Errorf("resolve(toDeck %s) = %v, want nil", where, err)
		}
	}
}
