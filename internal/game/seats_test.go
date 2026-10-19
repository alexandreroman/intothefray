package game

import (
	"errors"
	"slices"
	"testing"
)

// twoSlotLobby returns a lobby where the host, Alex ("a"), has two empty deck
// slots and Sam ("s") has one.
func twoSlotLobby(t *testing.T) *Game {
	t.Helper()
	g := mustNewGame(t, "g1", "a", "Alex", testNow)
	if err := g.AddDeck("a"); err != nil {
		t.Fatal(err)
	}
	if _, err := g.Join("s", "Sam"); err != nil {
		t.Fatal(err)
	}
	return g
}

func TestSeatNumbering(t *testing.T) {
	g := twoSlotLobby(t)

	if got := g.seatsOf(0); !slices.Equal(got, []int{0, 1}) {
		t.Errorf("seatsOf(0) = %v, want [0 1]", got)
	}
	if got := g.seatsOf(1); !slices.Equal(got, []int{2}) {
		t.Errorf("seatsOf(1) = %v, want [2]", got)
	}
	if got := g.seatsOf(2); len(got) != 0 {
		t.Errorf("seatsOf(2) = %v, want none", got)
	}

	for seat, want := range map[int]int{-1: -1, 0: 0, 1: 0, 2: 1, 3: -1} {
		if got := g.seatPlayer(seat); got != want {
			t.Errorf("seatPlayer(%d) = %d, want %d", seat, got, want)
		}
	}
	if got := g.homeSeat(0); got != 0 {
		t.Errorf("homeSeat(0) = %d, want 0", got)
	}
	if got := g.homeSeat(1); got != 2 {
		t.Errorf("homeSeat(1) = %d, want 2", got)
	}
}

func TestCapacityCountsDeckSlots(t *testing.T) {
	g := twoSlotLobby(t)
	if err := g.AddDeck("s"); err != nil {
		t.Fatal(err)
	}

	if err := g.AddDeck("a"); !errors.Is(err, ErrInvalid) {
		t.Errorf("AddDeck at 4 slots = %v, want ErrInvalid", err)
	}
	role, err := g.Join("new", "Bo")
	if err != nil || role != RoleSpectator {
		t.Errorf("Join at 4 slots = %v, %v; want spectator", role, err)
	}
	if err := g.TakeSeat("new"); !errors.Is(err, ErrInvalid) {
		t.Errorf("TakeSeat at 4 slots = %v, want ErrInvalid", err)
	}

	// Removing a slot frees room for a newcomer.
	if err := g.RemoveDeck("a", 1); err != nil {
		t.Fatal(err)
	}
	if err := g.TakeSeat("new"); err != nil {
		t.Errorf("TakeSeat with a free slot = %v, want nil", err)
	}
}
