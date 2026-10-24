package game

import (
	"errors"
	"testing"
)

func TestMarkerUnknownName(t *testing.T) {
	table := newTestTable()
	err := apply(table, Action{Kind: ActMarker, Name: "x", X: 100, Y: 100})
	if !errors.Is(err, ErrInvalid) {
		t.Errorf("err = %v, want ErrInvalid", err)
	}
}

func TestMarkerActiveAbsent(t *testing.T) {
	table := newTestTable()
	err := apply(table, Action{Kind: ActMarker, Name: MarkerActive, X: 100, Y: 100})
	if !errors.Is(err, ErrInvalid) {
		t.Errorf("err = %v, want ErrInvalid", err)
	}
}

func TestMarkerSnaps(t *testing.T) {
	table := newTestTable()
	mustApply(t, table, Action{Kind: ActMarker, Name: MarkerFirstPlayer, X: 37, Y: 52})
	if want := (Point{X: 40, Y: 50}); table.FirstPlayer != want {
		t.Errorf("FirstPlayer = %+v, want %+v", table.FirstPlayer, want)
	}
}

func TestMarkerMovesActive(t *testing.T) {
	f := newDoFixture(t)
	f.g.Table.Active = &Point{X: 10, Y: 20}
	before := len(f.g.Log)
	f.mustDo(t, "h", Action{Kind: ActMarker, Name: MarkerActive, X: 300, Y: 410}, at(1))
	if got := f.g.Table.Active; got == nil || *got != (Point{X: 300, Y: 410}) {
		t.Errorf("Active = %v, want (300, 410)", got)
	}
	if len(f.g.Log) != before {
		t.Errorf("log grew by %d lines, want none", len(f.g.Log)-before)
	}
}

func TestMarkerViewCopiesActive(t *testing.T) {
	table := newTestTable()
	table.Active = &Point{X: 10, Y: 20}
	view := table.viewFor(nil, -1)
	if view.Active == nil || *view.Active != *table.Active || view.Active == table.Active {
		t.Errorf("view active = %v, want a copy of %v", view.Active, table.Active)
	}
}
