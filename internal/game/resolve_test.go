package game

import (
	"errors"
	"fmt"
	"maps"
	"math/rand/v2"
	"reflect"
	"slices"
	"testing"
)

// resolveFixture is a started two-player game with a card in p0's hand, one in
// p0's discard pile, one in p0's set-aside pile and one revealed encounter
// card on the table.
type resolveFixture struct {
	g         *Game
	hand      string // in p0's hand
	disc      string // in disc:p0
	aside     string // in aside:p0
	ownTable  string // p0 card on the table
	encTable  string // encounter card on the table
	encAside  string // encounter card in saside
	deckCount int
}

func newResolveFixture(t *testing.T) *resolveFixture {
	t.Helper()
	g := startedGame(t, rhinoConfig())
	table := g.Table

	deck := table.Piles["deck:p0"]
	f := &resolveFixture{g: g, deckCount: len(deck.Cards)}
	f.hand = deck.Cards[len(deck.Cards)-1]
	f.disc = deck.Cards[len(deck.Cards)-2]
	f.aside = deck.Cards[len(deck.Cards)-3]
	mustApply(t, table, Action{Kind: ActToHand, Card: f.hand})
	mustApply(t, table, Action{Kind: ActDiscard, Card: f.disc})
	mustApply(t, table, Action{Kind: ActToPile, Card: f.aside, Target: "aside:p0"})

	for _, id := range slices.Sorted(maps.Keys(table.Cards)) {
		c := table.Cards[id]
		switch {
		case c.Zone == ZoneTable && c.Owner == 0 && f.ownTable == "":
			f.ownTable = id
		case c.Zone == ZoneTable && c.Owner == NoOwner && f.encTable == "":
			f.encTable = id
		}
	}
	f.encAside = table.Piles[PileEncounter].Cards[0]
	mustApply(t, table, Action{Kind: ActToPile, Card: f.encAside, Target: PileScenarioAside})
	if f.ownTable == "" || f.encTable == "" {
		t.Fatal("fixture found no table cards")
	}
	return f
}

func TestPermissions(t *testing.T) {
	f := newResolveFixture(t)
	topDeck0 := f.g.Table.Piles["deck:p0"].Cards[0]

	tests := []struct {
		name string
		seat int
		a    Action
		want error // nil = allowed
	}{
		{"owner plays own hand card", 0, Action{Kind: ActPlay, Card: f.hand}, nil},
		{"other plays hand card", 1, Action{Kind: ActPlay, Card: f.hand}, ErrForbidden},
		{"other discards hand card", 1, Action{Kind: ActDiscard, Card: f.hand}, ErrForbidden},
		{"other sends hand card to deck", 1, Action{Kind: ActToDeck, Card: f.hand, Where: "top"}, ErrForbidden},
		{"other sends hand card to pile", 1, Action{Kind: ActToPile, Card: f.hand, Target: PileVictory}, ErrForbidden},
		{"other takes hand card", 1, Action{Kind: ActToHand, Card: f.hand}, ErrForbidden},
		{"other orders hand", 1, Action{Kind: ActHandOrder, Area: "p0"}, ErrForbidden},
		{"owner orders hand", 0, Action{Kind: ActHandOrder, Area: "p0"}, nil},
		{"hand order of villain", 0, Action{Kind: ActHandOrder, Area: "villain"}, ErrInvalid},

		{"other exhausts table card", 1, Action{Kind: ActExhaust, Card: f.ownTable}, nil},
		{"other moves table card", 1, Action{Kind: ActMove, Card: f.ownTable, X: 10, Y: 10}, nil},
		{"other takes table card to its hand", 1, Action{Kind: ActToHand, Card: f.ownTable}, ErrForbidden},
		{"owner takes table card", 0, Action{Kind: ActToHand, Card: f.ownTable}, nil},
		{"anyone takes encounter card", 0, Action{Kind: ActToHand, Card: f.encTable}, ErrForbidden},
		{"other discards table card", 1, Action{Kind: ActDiscard, Card: f.ownTable}, nil},
		{"other returns table card to deck", 1, Action{Kind: ActToDeck, Card: f.ownTable, Where: "top"}, ErrForbidden},
		{"owner returns table card to deck", 0, Action{Kind: ActToDeck, Card: f.ownTable, Where: "top"}, nil},
		{"anyone returns encounter card to deck", 1, Action{Kind: ActToDeck, Card: f.encTable, Where: "top"}, nil},

		{"other moves discarded card", 1, Action{Kind: ActToPile, Card: f.disc, Target: PileVictory}, nil},
		{"other takes discarded card", 1, Action{Kind: ActToHand, Card: f.disc}, ErrForbidden},
		{"owner takes discarded card", 0, Action{Kind: ActToHand, Card: f.disc}, nil},
		{"other takes deck card", 1, Action{Kind: ActToPile, Card: topDeck0, Target: PileVictory}, ErrForbidden},
		{"other takes set-aside card", 1, Action{Kind: ActToHand, Card: f.aside}, ErrForbidden},
		{"other sends card to set-aside", 1, Action{Kind: ActToPile, Card: f.ownTable, Target: "aside:p0"}, ErrForbidden},
		{"owner sends card to set-aside", 0, Action{Kind: ActToPile, Card: f.ownTable, Target: "aside:p0"}, nil},
		{"anyone sends card to victory", 1, Action{Kind: ActToPile, Card: f.ownTable, Target: PileVictory}, nil},

		{"other discards from deck", 1, Action{Kind: ActDiscardTop, Pile: "deck:p0", N: 1}, ErrForbidden},
		{"owner discards from deck", 0, Action{Kind: ActDiscardTop, Pile: "deck:p0", N: 1}, nil},
		{"anyone discards from encounter deck", 1, Action{Kind: ActDiscardTop, Pile: PileEncounter, N: 1}, nil},
		{"other shuffles deck", 1, Action{Kind: ActShuffle, Pile: "deck:p0"}, ErrForbidden},
		{"owner shuffles deck", 0, Action{Kind: ActShuffle, Pile: "deck:p0"}, nil},
		{"anyone shuffles encounter deck", 1, Action{Kind: ActShuffle, Pile: PileEncounter}, nil},
		{"other reorders deck", 1, Action{Kind: ActReorderTop, Pile: "deck:p0", Cards: []string{topDeck0}}, ErrForbidden},
		{"other shuffles discard back", 1, Action{Kind: ActShuffleBack, Pile: "disc:p0"}, ErrForbidden},
		{"owner shuffles discard back", 0, Action{Kind: ActShuffleBack, Pile: "disc:p0"}, nil},
		{"anyone shuffles encounter discard back", 1, Action{Kind: ActShuffleBack, Pile: PileEncounterDiscard}, nil},
		{"other shuffles in set-aside", 1, Action{Kind: ActShuffleIn, Pile: "aside:p0"}, ErrForbidden},
		{"anyone shuffles in scenario set-aside", 1, Action{Kind: ActShuffleIn, Pile: PileScenarioAside}, nil},

		{"draw", 1, Action{Kind: ActDraw, N: 1}, nil},
		{"reveal", 1, Action{Kind: ActReveal}, nil},
		{"deal", 1, Action{Kind: ActDeal, Area: "p1"}, nil},
		{"deal to nobody", 1, Action{Kind: ActDeal}, ErrInvalid},
		{"arrow", 1, Action{Kind: ActArrowAdd, Card: f.ownTable, Target: f.encTable}, nil},
		{"attach", 1, Action{Kind: ActAttach, Card: f.ownTable, Target: f.encTable}, nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := resolve(f.g, tt.seat, tt.a, newTestRNG())
			if tt.want == nil && err != nil || tt.want != nil && !errors.Is(err, tt.want) {
				t.Errorf("resolve() error = %v, want %v", err, tt.want)
			}
		})
	}
}

func TestResolveRejectsInvalidInput(t *testing.T) {
	f := newResolveFixture(t)
	tests := []struct {
		name string
		a    Action
	}{
		{"unknown kind", Action{Kind: "teleport"}},
		{"unknown card", Action{Kind: ActExhaust, Card: "nope"}},
		{"toHand without card", Action{Kind: ActToHand}},
		{"toDeck without card", Action{Kind: ActToDeck, Where: "top"}},
		{"toPile without card", Action{Kind: ActToPile, Target: PileVictory}},
		{"toDeck unknown position", Action{Kind: ActToDeck, Card: f.ownTable, Where: "middle"}},
		{"unknown pile", Action{Kind: ActShuffle, Pile: "nope"}},
		{"negative x", Action{Kind: ActMove, Card: f.ownTable, X: -1}},
		{"x too large", Action{Kind: ActMove, Card: f.ownTable, X: 20001}},
		{"y too large", Action{Kind: ActMove, Card: f.ownTable, Y: 20001}},
		{"delta too large", Action{Kind: ActToken, Card: f.ownTable, Name: "dmg", Delta: 100}},
		{"delta too small", Action{Kind: ActStatus, Card: f.ownTable, Name: "tough", Delta: -100}},
		{"discard zero", Action{Kind: ActDiscardTop, Pile: "deck:p0", N: 0}},
		{"discard 100", Action{Kind: ActDiscardTop, Pile: "deck:p0", N: 100}},
		{"discard more than the deck", Action{Kind: ActDiscardTop, Pile: "deck:p0", N: f.deckCount}},
		{"draw zero", Action{Kind: ActDraw}},
		{"draw more than the deck", Action{Kind: ActDraw, N: f.deckCount}},
		{"shuffle discard pile", Action{Kind: ActShuffle, Pile: "disc:p0"}},
		{"shuffle back a deck", Action{Kind: ActShuffleBack, Pile: "deck:p0"}},
		{"shuffle in victory", Action{Kind: ActShuffleIn, Pile: PileVictory}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := resolve(f.g, 0, tt.a, newTestRNG()); !errors.Is(err, ErrInvalid) {
				t.Errorf("resolve() error = %v, want ErrInvalid", err)
			}
		})
	}
}

// TestResolveRejectsAreasOfEmptySeats checks that a two-player table only
// knows the areas p0 and p1: the seats of its players.
func TestResolveRejectsAreasOfEmptySeats(t *testing.T) {
	f := newResolveFixture(t)
	actions := map[string]func(area Area) Action{
		"deal":      func(area Area) Action { return Action{Kind: ActDeal, Area: area} },
		"handOrder": func(area Area) Action { return Action{Kind: ActHandOrder, Area: area} },
	}
	for name, action := range actions {
		t.Run(name, func(t *testing.T) {
			for _, area := range []Area{"p2", "p3", "p4", "villain", "nowhere"} {
				if _, err := resolve(f.g, 0, action(area), newTestRNG()); !errors.Is(err, ErrInvalid) {
					t.Errorf("area %s: resolve() error = %v, want ErrInvalid", area, err)
				}
			}
			if name == "handOrder" {
				return
			}
			for _, area := range []Area{"p0", "p1"} {
				if _, err := resolve(f.g, 0, action(area), newTestRNG()); err != nil {
					t.Errorf("area %s: resolve() error = %v, want nil", area, err)
				}
			}
		})
	}
}

// TestResolveRecordsTopCards checks that the cards taken from a pile top are
// fixed at resolve time, so that replaying the action onto another table
// acts on the same cards or fails.
func TestResolveRecordsTopCards(t *testing.T) {
	f := newResolveFixture(t)
	enc := f.g.Table.Piles[PileEncounter]
	deck := f.g.Table.Piles["deck:p0"]

	tests := []struct {
		name string
		a    Action
		want []string
	}{
		{"reveal", Action{Kind: ActReveal}, topCards(enc, 1)},
		{"deal", Action{Kind: ActDeal, Area: "p1"}, topCards(enc, 1)},
		{"discard top", Action{Kind: ActDiscardTop, Pile: "deck:p0", N: 2}, topCards(deck, 2)},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := resolve(f.g, 0, tt.a, newTestRNG())
			if err != nil {
				t.Fatal(err)
			}
			if !slices.Equal(got.Cards, tt.want) {
				t.Errorf("Cards = %v, want %v", got.Cards, tt.want)
			}
		})
	}
}

func TestResolveDealRecordsTheRevealedCard(t *testing.T) {
	f := newResolveFixture(t)
	revealed := topCards(f.g.Table.Piles[PileEncounter], 1)
	mustApply(t, f.g.Table, Action{Kind: ActReveal, Cards: revealed})

	got, err := resolve(f.g, 0, Action{Kind: ActDeal, Area: "p1"}, newTestRNG())
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(got.Cards, revealed) {
		t.Errorf("Cards = %v, want the revealed card %v", got.Cards, revealed)
	}
}

func TestResolveRejectsUnknownSeat(t *testing.T) {
	f := newResolveFixture(t)
	if _, err := resolve(f.g, 2, Action{Kind: ActReveal}, newTestRNG()); !errors.Is(err, ErrForbidden) {
		t.Errorf("resolve() error = %v, want ErrForbidden", err)
	}
}

func TestResolveOverwritesSeat(t *testing.T) {
	f := newResolveFixture(t)

	got, err := resolve(f.g, 1, Action{Kind: ActArrowClear, Seat: 0}, newTestRNG())
	if err != nil {
		t.Fatal(err)
	}
	if got.Seat != 1 {
		t.Errorf("Seat = %d, want 1", got.Seat)
	}
}

func TestResolveDrawTakesTop(t *testing.T) {
	f := newResolveFixture(t)
	deck := f.g.Table.Piles["deck:p0"].Cards
	want := []string{deck[len(deck)-1], deck[len(deck)-2], deck[len(deck)-3]}

	// The client-provided area and cards are ignored.
	got, err := resolve(f.g, 0, Action{Kind: ActDraw, N: 3, Area: "p1", Cards: []string{"x"}}, newTestRNG())
	if err != nil {
		t.Fatal(err)
	}
	if got.Area != "p0" || !slices.Equal(got.Cards, want) {
		t.Errorf("draw = area %q cards %v, want p0 %v", got.Area, got.Cards, want)
	}
	mustApply(t, f.g.Table.Clone(), got)
}

func TestDrawUsesActingSeatDeck(t *testing.T) {
	f := newResolveFixture(t)
	deck := f.g.Table.Piles["deck:p1"].Cards

	got, err := resolve(f.g, 1, Action{Kind: ActDraw, N: 1, Area: "p0"}, newTestRNG())
	if err != nil {
		t.Fatal(err)
	}
	if got.Area != "p1" || !slices.Equal(got.Cards, deck[len(deck)-1:]) {
		t.Errorf("draw = area %q cards %v, want p1 from its own deck", got.Area, got.Cards)
	}
}

func TestResolveShuffleIsPermutation(t *testing.T) {
	f := newResolveFixture(t)
	table := f.g.Table
	ownDeck := table.Piles["deck:p0"].Cards
	tests := []struct {
		name string
		seat int
		a    Action
		want []string // cards that must be shuffled
	}{
		{"shuffle deck", 0, Action{Kind: ActShuffle, Pile: "deck:p0"}, ownDeck},
		{"shuffle encounter deck", 1, Action{Kind: ActShuffle, Pile: PileEncounter}, table.Piles[PileEncounter].Cards},
		{
			"shuffle back", 0,
			Action{Kind: ActShuffleBack, Pile: "disc:p0"},
			append(slices.Clone(ownDeck), f.disc),
		},
		{
			"shuffle in", 1,
			Action{Kind: ActShuffleIn, Pile: PileScenarioAside},
			append(slices.Clone(table.Piles[PileEncounter].Cards), f.encAside),
		},
		{
			"to deck shuffle", 0,
			Action{Kind: ActToDeck, Card: f.hand, Where: "shuffle"},
			append(slices.Clone(ownDeck), f.hand),
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Client orders are ignored.
			tt.a.Cards = []string{"bogus"}
			before := table.Clone()

			first, err := resolve(f.g, tt.seat, tt.a, newTestRNG())
			if err != nil {
				t.Fatal(err)
			}
			second, err := resolve(f.g, tt.seat, tt.a, newTestRNG())
			if err != nil {
				t.Fatal(err)
			}

			renamed := slices.Collect(maps.Keys(first.Renames))
			if !samePermutation(renamed, tt.want) {
				t.Errorf("Renames cover %v, want %v", renamed, tt.want)
			}
			if !samePermutation(slices.Collect(maps.Values(first.Renames)), first.Cards) {
				t.Errorf("Cards = %v, not the new ids %v", first.Cards, first.Renames)
			}
			if !slices.Equal(first.Cards, second.Cards) {
				t.Errorf("same seed gave %v then %v", first.Cards, second.Cards)
			}
			if !reflect.DeepEqual(before, table) {
				t.Error("resolve modified the table")
			}
			mustApply(t, table.Clone(), first)
		})
	}
}

func TestResolveShuffleDependsOnSeed(t *testing.T) {
	f := newResolveFixture(t)
	a := Action{Kind: ActShuffle, Pile: PileEncounter}
	orders := map[string]bool{}
	for seed := range uint64(5) {
		got, err := resolve(f.g, 0, a, rand.New(rand.NewPCG(seed, 0))) //nolint:gosec // deterministic test
		if err != nil {
			t.Fatal(err)
		}
		orders[fmt.Sprint(got.Cards)] = true
	}
	if len(orders) < 2 {
		t.Error("five seeds gave a single order")
	}
}

// TestResolveRecordsTheResultingState checks that exhaust and flip record the
// state they lead to, so that a rebuild on another table sets that state
// instead of toggling it again.
func TestResolveRecordsTheResultingState(t *testing.T) {
	f := newResolveFixture(t)
	c := f.g.Table.Cards[f.ownTable]

	exhaust, err := resolve(f.g, 0, Action{Kind: ActExhaust, Card: f.ownTable}, newTestRNG())
	if err != nil || exhaust.Exhausted == nil || *exhaust.Exhausted != !c.Exhausted {
		t.Errorf("exhaust = %+v, %v; want Exhausted %t", exhaust, err, !c.Exhausted)
	}

	c.Faces, c.Face = 2, 1
	flip, err := resolve(f.g, 0, Action{Kind: ActFlip, Card: f.ownTable, Face: 1}, newTestRNG())
	if err != nil || flip.Face != 0 || flip.FaceDown == nil || *flip.FaceDown {
		t.Errorf("flip of face 1 of 2 = %+v, %v; want face 0, face up", flip, err)
	}

	c.FaceDown = true
	flip, err = resolve(f.g, 0, Action{Kind: ActFlip, Card: f.ownTable}, newTestRNG())
	if err != nil || flip.Face != 1 || flip.FaceDown == nil || *flip.FaceDown {
		t.Errorf("flip of a face-down card = %+v, %v; want face 1, face up", flip, err)
	}
}
