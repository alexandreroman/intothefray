package game

import (
	"fmt"
	"slices"
	"testing"
)

// specializedTraining is a player card whose deck sets the Specialist
// upgrades aside at setup.
const specializedTraining = "43021"

// specialists are the cards Specialized Training sets aside, sorted.
var specialists = []string{"43034", "43035", "43036", "43037"}

// specialistsOn returns the sorted codes of the Specialist upgrades on a pile.
func specialistsOn(table *Table, pileID string) []string {
	var codes []string
	for _, code := range codesOf(table, table.Piles[pileID].Cards) {
		if slices.Contains(specialists, code) {
			codes = append(codes, code)
		}
	}
	slices.Sort(codes)
	return codes
}

// checkSpecialistsSetAside fails unless seat's set-aside pile holds one copy
// of each Specialist, owned by the seat and at home in its deck, and its deck
// holds none.
func checkSpecialistsSetAside(t *testing.T, table *Table, seat int) {
	t.Helper()
	area := string(PlayerArea(seat))
	if got := specialistsOn(table, "aside:"+area); !slices.Equal(got, specialists) {
		t.Errorf("Specialists on aside:%s = %v, want %v", area, got, specialists)
	}
	if got := specialistsOn(table, "deck:"+area); len(got) != 0 {
		t.Errorf("Specialists in deck:%s = %v, want none", area, got)
	}
	for _, id := range table.Piles["aside:"+area].Cards {
		c := table.Cards[id]
		if slices.Contains(specialists, c.Code) && (c.Owner != seat || c.Home != "deck:"+area) {
			t.Errorf("Specialist %+v, want owned by seat %d at home in deck:%s", c, seat, area)
		}
	}
}

// checkNoSpecialists fails if seat's set-aside pile or deck holds a Specialist.
func checkNoSpecialists(t *testing.T, table *Table, seat int) {
	t.Helper()
	area := string(PlayerArea(seat))
	for _, pileID := range []string{"aside:" + area, "deck:" + area} {
		if got := specialistsOn(table, pileID); len(got) != 0 {
			t.Errorf("Specialists on %s = %v, want none", pileID, got)
		}
	}
}

// withTraining returns a Spider-Man deck listing Specialized Training and the
// extra entries.
func withTraining(t *testing.T, extra ...DeckEntry) DeckChoice {
	t.Helper()
	deck := spiderManDeck(t, newCatalog(t))
	deck.Cards = append(deck.Cards, DeckEntry{Code: specializedTraining, Qty: 1})
	deck.Cards = append(deck.Cards, extra...)
	return deck
}

func TestSetupSetsAsideTheCardsADeckCardNames(t *testing.T) {
	tests := []struct {
		name  string
		extra []DeckEntry
	}{
		{"none listed", nil},
		{"some listed", []DeckEntry{{Code: "43034", Qty: 1}, {Code: "43036", Qty: 2}}},
		{"all listed", []DeckEntry{
			{Code: "43034", Qty: 1}, {Code: "43035", Qty: 1}, {Code: "43036", Qty: 1}, {Code: "43037", Qty: 1},
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := heroGame(t, withTraining(t, tt.extra...))
			table := f.g.Table

			checkSpecialistsSetAside(t, table, 0)
			// The card that sets them aside stays in the deck.
			if !slices.Contains(codesOf(table, table.Piles["deck:p0"].Cards), specializedTraining) {
				t.Errorf("deck:p0 has no %s", specializedTraining)
			}
			// The game's card pool is made of the table's codes.
			for _, code := range specialists {
				if !slices.Contains(table.CardCodes(), code) {
					t.Errorf("card codes of the table lack %s", code)
				}
			}
			checkIntegrity(t, table)
		})
	}
}

func TestSetupWithoutTheDeckCardSetsNothingAside(t *testing.T) {
	cat := newCatalog(t)
	tests := []struct {
		name     string
		extra    []DeckEntry
		wantDeck []string
	}{
		{"nothing listed", nil, nil},
		// Without Specialized Training, a listed Specialist is a deck card.
		{"a Specialist listed", []DeckEntry{{Code: "43035", Qty: 1}}, []string{"43035"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			deck := spiderManDeck(t, cat)
			deck.Cards = append(deck.Cards, tt.extra...)
			f := heroGame(t, deck)
			table := f.g.Table

			if got := specialistsOn(table, "aside:p0"); len(got) != 0 {
				t.Errorf("Specialists on aside:p0 = %v, want none", got)
			}
			if got := specialistsOn(table, "deck:p0"); !slices.Equal(got, tt.wantDeck) {
				t.Errorf("Specialists in deck:p0 = %v, want %v", got, tt.wantDeck)
			}
		})
	}
}

// threeSeatGame starts a Rhino game where Alex plays seats 0 and 1 and Sam
// seat 2, with the given decks.
func threeSeatGame(t *testing.T, decks [3]DeckChoice) *Table {
	t.Helper()
	cat := newCatalog(t)
	g := twoSlotLobby(t)
	if err := g.Configure("a", rhinoConfig(), cat); err != nil {
		t.Fatal(err)
	}
	slots := []struct {
		token string
		slot  int
	}{{"a", 0}, {"a", 1}, {"s", 0}}
	for i, slot := range slots {
		seatDeck(t, g, slot.token, slot.slot, decks[i], cat)
	}
	if err := g.Start("a", cat, testSeed, testNow); err != nil {
		t.Fatal(err)
	}
	return g.Table
}

func TestSetupSetsAsideDeckCardsPerSeat(t *testing.T) {
	cat := newCatalog(t)
	plain := spiderManDeck(t, cat)
	training := withTraining(t)
	tests := []struct {
		name  string
		decks [3]DeckChoice
		with  []bool // per seat: whether the Specialists are set aside
	}{
		{"one seat with the card", [3]DeckChoice{plain, training, plain}, []bool{false, true, false}},
		{"every seat with the card", [3]DeckChoice{training, training, training}, []bool{true, true, true}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			table := threeSeatGame(t, tt.decks)
			for seat, with := range tt.with {
				t.Run(fmt.Sprintf("seat %d", seat), func(t *testing.T) {
					if with {
						checkSpecialistsSetAside(t, table, seat)
					} else {
						checkNoSpecialists(t, table, seat)
					}
				})
			}
			checkIntegrity(t, table)
		})
	}
}
