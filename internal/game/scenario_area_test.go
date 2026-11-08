package game

import (
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/alexandreroman/intothefray/packs/packstest"
)

// collectionID is the pile of The Collection, the scenario area of Infiltrate
// the Museum.
const collectionID = "area:collection"

// collectionFixture is a started game of Infiltrate the Museum for two
// Spider-Man players: "h" (Host, p0) and "b" (Bob, p1).
func collectionFixture(t *testing.T) *doFixture {
	t.Helper()
	cat := packstest.Catalog(t)
	return &doFixture{g: startedGame(t, DefaultConfig(cat, "infiltrate_the_museum")), cat: cat}
}

// drawOne has the player of token draw the top card of their deck, and
// returns it.
func (f *doFixture) drawOne(t *testing.T, token string, area Area, seconds int) string {
	t.Helper()
	f.mustDo(t, token, Action{Kind: ActDraw, N: 1}, at(seconds))
	return f.lastInHand(area)
}

func TestScenarioAreaSetup(t *testing.T) {
	table := collectionFixture(t).g.Table
	pile := table.Piles[collectionID]
	if pile == nil {
		t.Fatalf("no pile %s", collectionID)
	}
	want := Pile{
		ID: collectionID, Kind: KindScenarioArea, Owner: NoOwner, X: outOfPlayX, Y: rowY(villainRow),
		Cards: []string{}, Label: "The Collection",
	}
	if !reflect.DeepEqual(*pile, want) {
		t.Errorf("pile = %+v, want %+v", pile, want)
	}

	// A scenario without areas has none.
	for id := range newDoFixture(t).g.Table.Piles {
		if strings.HasPrefix(id, scenarioAreaPrefix) {
			t.Errorf("Rhino has pile %s, want no scenario area", id)
		}
	}
}

func TestScenarioAreaTakesPlayerCards(t *testing.T) {
	f := collectionFixture(t)
	card := f.drawOne(t, "b", "p1", 1)

	f.mustDo(t, "b", Action{Kind: ActToPile, Card: card, Target: collectionID}, at(2))
	c := f.g.Table.Cards[card]
	if c.Zone != ZonePile || c.Pile != collectionID || c.FaceDown {
		t.Fatalf("card = %+v, want face up in %s", c, collectionID)
	}
	if c.Owner != 1 || c.Home != playerDeckID("p1") {
		t.Errorf("card owner %d home %q, want Bob's card at home in his deck", c.Owner, c.Home)
	}
	if got, want := f.lastLog().Text, "moved "+f.nameOf(t, card)+" to The Collection"; got != want {
		t.Errorf("line = %q, want %q", got, want)
	}

	// The area is shared: anyone discards from it, to the card's owner's
	// discard pile.
	f.mustDo(t, "h", Action{Kind: ActDiscard, Card: card}, at(3))
	if got := f.g.Table.Piles[playerDiscardID("p1")].Cards; !slices.Equal(got, []string{card}) {
		t.Errorf("Bob's discard pile = %v, want [%s]", got, card)
	}

	// Back into the area, then into its owner's hand.
	f.mustDo(t, "b", Action{Kind: ActToPile, Card: card, Target: collectionID}, at(4))
	f.mustDo(t, "b", Action{Kind: ActToHand, Card: card}, at(5))
	if got := f.g.Table.Hands["p1"]; !slices.Contains(got, card) {
		t.Errorf("Bob's hand = %v, want it to hold %s", got, card)
	}
	if got := f.g.Table.Piles[collectionID].Cards; len(got) != 0 {
		t.Errorf("The Collection = %v, want it empty", got)
	}
}

func TestScenarioAreaTakesEncounterCards(t *testing.T) {
	f := collectionFixture(t)
	f.mustDo(t, "h", Action{Kind: ActDeal, Area: "p0", X: 600, Y: 400}, at(1))
	card := f.lastDealt(t)
	f.mustDo(t, "h", Action{Kind: ActFlip, Card: card}, at(2))

	f.mustDo(t, "b", Action{Kind: ActToPile, Card: card, Target: collectionID}, at(3))
	if c := f.g.Table.Cards[card]; c.Pile != collectionID || c.Owner != NoOwner || c.Home != PileEncounter {
		t.Fatalf("card = %+v, want the encounter card in %s", c, collectionID)
	}

	// Played back onto the table, as from the victory display.
	f.mustDo(t, "h", Action{Kind: ActPlay, Card: card, X: 800, Y: 400}, at(4))
	if c := f.g.Table.Cards[card]; c.Zone != ZoneTable || c.FaceDown {
		t.Fatalf("card = %+v, want face up on the table", c)
	}

	f.mustDo(t, "h", Action{Kind: ActToPile, Card: card, Target: collectionID}, at(5))
	f.mustDo(t, "b", Action{Kind: ActDiscard, Card: card}, at(6))
	if got := f.g.Table.Piles[PileEncounterDiscard].Cards; !slices.Equal(got, []string{card}) {
		t.Errorf("encounter discard pile = %v, want [%s]", got, card)
	}
}

func TestScenarioAreaIsPublic(t *testing.T) {
	f := collectionFixture(t)
	card := f.drawOne(t, "b", "p1", 1)
	code := f.g.Table.Cards[card].Code
	f.mustDo(t, "b", Action{Kind: ActToPile, Card: card, Target: collectionID}, at(2))

	for _, token := range []string{"h", "b", "spectator"} {
		table := f.g.ViewFor(token).Table
		i := slices.IndexFunc(table.Piles, func(p PileView) bool { return p.ID == collectionID })
		if i < 0 {
			t.Errorf("%s sees no %s", token, collectionID)
			continue
		}
		pile := table.Piles[i]
		if pile.Kind != KindScenarioArea || pile.Label != "The Collection" || !slices.Equal(pile.Cards, []string{card}) {
			t.Errorf("%s sees %+v, want The Collection holding %s", token, pile, card)
		}
		j := slices.IndexFunc(table.Cards, func(c CardView) bool { return c.ID == card })
		if j < 0 || table.Cards[j].Code != code {
			t.Errorf("%s does not see card %s as %s", token, card, code)
		}
	}
}
