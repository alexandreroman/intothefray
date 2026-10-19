package game

import (
	"errors"
	"strings"
	"testing"
)

// readyFixture is a started game where Host (p0) has exhausted their
// identity and a played card, and the villain is exhausted too.
type readyFixture struct {
	*doFixture
	identity string
	played   string
}

func newReadyFixture(t *testing.T) *readyFixture {
	t.Helper()
	f := &readyFixture{doFixture: newDoFixture(t)}
	f.identity = f.doFixture.identity(t)
	f.mustDo(t, "h", Action{Kind: ActDraw, N: 1}, at(1))
	f.played = f.g.Table.Hands["p0"][0]
	f.mustDo(t, "h", Action{Kind: ActPlay, Card: f.played, X: 900, Y: 400}, at(2))
	f.mustDo(t, "h", Action{Kind: ActExhaust, Card: f.identity}, at(3))
	f.mustDo(t, "h", Action{Kind: ActExhaust, Card: f.played}, at(4))
	f.mustDo(t, "h", Action{Kind: ActExhaust, Card: f.villain()}, at(5))
	return f
}

func TestReadyAllReadiesTheActorsCardsInOneLine(t *testing.T) {
	f := newReadyFixture(t)
	lines := len(f.g.Log)

	f.mustDo(t, "h", Action{Kind: ActReadyAll}, at(6))

	table := f.g.Table
	if table.Cards[f.identity].Exhausted || table.Cards[f.played].Exhausted {
		t.Error("Host's cards are still exhausted after Ready all")
	}
	if !table.Cards[f.villain()].Exhausted {
		t.Error("Ready all readied the villain, which is nobody's")
	}
	if got, want := len(f.g.Log), lines+1; got != want {
		t.Fatalf("log has %d lines, want %d", got, want)
	}
	if got, want := f.lastLog().Text, "readied all their cards (2)"; got != want {
		t.Errorf("last line = %q, want %q", got, want)
	}

	// One undo exhausts them both again.
	f.mustDo(t, "h", Action{Kind: ActUndo}, at(7))
	// An undo rebuilds the table.
	table = f.g.Table
	if !table.Cards[f.identity].Exhausted || !table.Cards[f.played].Exhausted {
		t.Error("undoing Ready all left Host's cards ready")
	}
	checkReplay(t, f.doFixture)
}

func TestReadyAllSkipsLockedCards(t *testing.T) {
	f := newReadyFixture(t)
	f.mustDo(t, "h", Action{Kind: ActStatus, Card: f.played, Name: statusLocked, Delta: 1}, at(6))

	f.mustDo(t, "h", Action{Kind: ActReadyAll}, at(7))

	if f.g.Table.Cards[f.identity].Exhausted {
		t.Error("the identity is still exhausted")
	}
	if !f.g.Table.Cards[f.played].Exhausted {
		t.Error("Ready all readied a locked card")
	}
	if got, want := f.lastLog().Text, "readied all their cards (1)"; got != want {
		t.Errorf("last line = %q, want %q", got, want)
	}
	checkReplay(t, f.doFixture)
}

func TestReadyAllRefusedWithNothingToReady(t *testing.T) {
	f := newReadyFixture(t)
	f.mustDo(t, "h", Action{Kind: ActReadyAll}, at(6))

	// The villain is still exhausted, but it is nobody's.
	err := f.do("h", Action{Kind: ActReadyAll}, at(7))
	if !errors.Is(err, ErrInvalid) {
		t.Errorf("second Ready all = %v, want ErrInvalid", err)
	}
}

func TestLockedCardIsExhaustedButNeverReadied(t *testing.T) {
	f := newDoFixture(t)
	id := f.identity(t)
	f.mustDo(t, "h", Action{Kind: ActStatus, Card: id, Name: statusLocked, Delta: 1}, at(1))
	if got, want := f.lastLog().Text, "added 1 locked status to "; !strings.HasPrefix(got, want) {
		t.Errorf("last line = %q, want it to start with %q", got, want)
	}

	f.mustDo(t, "h", Action{Kind: ActExhaust, Card: id}, at(2))
	if err := f.do("h", Action{Kind: ActExhaust, Card: id}, at(3)); !errors.Is(err, ErrInvalid) {
		t.Errorf("readying a locked card = %v, want ErrInvalid", err)
	}
	if !f.g.Table.Cards[id].Exhausted {
		t.Error("a locked card was readied")
	}

	// Unlocked, it readies again.
	f.mustDo(t, "h", Action{Kind: ActStatus, Card: id, Name: statusLocked, Delta: -1}, at(4))
	f.mustDo(t, "h", Action{Kind: ActExhaust, Card: id}, at(5))
	if f.g.Table.Cards[id].Exhausted {
		t.Error("an unlocked card did not ready")
	}
}

func TestApplyReadyAllIsAllOrNothing(t *testing.T) {
	table := newTestTable()

	err := apply(table, Action{Kind: ActReadyAll, Cards: []string{"c1", "nope"}})
	if !errors.Is(err, ErrInvalid) {
		t.Fatalf("ready all with an unknown card = %v, want ErrInvalid", err)
	}
	if !table.Cards["c1"].Exhausted {
		t.Error("a refused Ready all readied c1")
	}

	mustApply(t, table, Action{Kind: ActReadyAll, Cards: []string{"c1"}})
	if table.Cards["c1"].Exhausted {
		t.Error("c1 is still exhausted")
	}
}
