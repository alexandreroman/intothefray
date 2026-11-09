package game

import (
	"errors"
	"slices"
	"strings"
	"testing"

	"github.com/alexandreroman/intothefray/packs/packstest"
)

// The piles and cards sideSchemeFixture adds.
const (
	sideSchemeDeck    = "sdeck:s"
	sideSchemeDiscard = "sdisc:s"
	hydraPatrol       = "hp"
	anotherScheme     = "as"
)

// sideSchemeFixture is scenarioFixture with a Red Skull-like side-scheme deck
// "sdeck:s": owned by nobody, face down, with its own discard pile "sdisc:s",
// holding s1 and s2 (s2 on top). Two encounter cards, modular side schemes
// such as Hydra Patrol owned by nobody and at home in the encounter deck, lie
// face up on the table: "hp" at (500,300) and "as" at (700,300). The game
// starts from that table, so that Undo rebuilds it.
func sideSchemeFixture(t *testing.T) *doFixture {
	t.Helper()
	f := scenarioFixture(t)
	tb := f.g.Table
	tb.Piles[sideSchemeDeck] = &Pile{
		ID: sideSchemeDeck, Kind: KindScenarioDeck, Owner: NoOwner,
		Label: "Side-scheme", X: 500, Y: 30, Discard: sideSchemeDiscard, Cards: []string{},
	}
	tb.Piles[sideSchemeDiscard] = &Pile{
		ID: sideSchemeDiscard, Kind: KindScenarioDiscard, Owner: NoOwner,
		Label: "Side-scheme", X: 600, Y: 30, Cards: []string{},
	}
	code := tb.Cards["w1"].Code
	for _, id := range []string{"s1", "s2"} {
		c := &Card{ID: id, Code: code, Owner: NoOwner, Home: sideSchemeDeck}
		tb.Cards[id] = c
		tb.pushOnPile(tb.Piles[sideSchemeDeck], c)
	}
	// In order, so that each card always gets the same Z.
	for _, placed := range []struct {
		id string
		x  int
	}{{hydraPatrol, 500}, {anotherScheme, 700}} {
		c := &Card{ID: placed.id, Code: code, Owner: NoOwner, Home: PileEncounter}
		tb.Cards[placed.id] = c
		tb.placeOnTable(c, placed.x, 300)
	}
	f.g.History = newHistory(testSeed, tb, testNow)
	return f
}

// TestEncounterCardOnTopOfScenarioDeck puts an encounter card on top of a
// scenario deck that is not its home: it lands there under a new id, takes
// that deck as its home, and is discarded to that deck's own discard pile.
func TestEncounterCardOnTopOfScenarioDeck(t *testing.T) {
	f := sideSchemeFixture(t)
	name := f.nameOf(t, hydraPatrol)

	f.mustDo(t, "h", Action{Kind: ActToDeck, Card: hydraPatrol, Where: whereTop, Pile: sideSchemeDeck}, at(1))

	tb := f.g.Table
	id := f.renamedID(t, hydraPatrol)
	if id == hydraPatrol {
		t.Errorf("card %s keeps its id on top of a face-down deck", hydraPatrol)
	}
	if top := topCards(tb.Piles[sideSchemeDeck], 1)[0]; top != id {
		t.Errorf("top of %s = %s, want %s", sideSchemeDeck, top, id)
	}
	if c := tb.Cards[id]; c.Zone != ZonePile || c.Pile != sideSchemeDeck || c.Home != sideSchemeDeck {
		t.Errorf("card = %+v, want in %s, at home there", c, sideSchemeDeck)
	}
	if got, want := f.lastLog().Text, "put "+name+" on top of the Side-scheme deck"; got != want {
		t.Errorf("line = %q, want %q", got, want)
	}

	f.mustDo(t, "h", Action{Kind: ActPlay, Pile: sideSchemeDeck, X: 500, Y: 300}, at(2))
	f.mustDo(t, "h", Action{Kind: ActDiscard, Card: id}, at(3))
	if got := tb.Piles[sideSchemeDiscard].Cards; !slices.Equal(got, []string{id}) {
		t.Errorf("%s = %v, want [%s]", sideSchemeDiscard, got, id)
	}
	if c := tb.Cards[id]; c.Home != sideSchemeDeck {
		t.Errorf("home after the discard = %q, want %s", c.Home, sideSchemeDeck)
	}
	checkIntegrity(t, tb)
	checkHistory(t, f.g)
}

// TestEncounterCardIntoScenarioDeckPositions puts an encounter card into a
// scenario deck at each position: it always gets a new id and that deck as
// its home.
func TestEncounterCardIntoScenarioDeckPositions(t *testing.T) {
	tests := []struct {
		where string
		index func(cards []string) int // where the card must lie, bottom first
	}{
		{whereTop, func(cards []string) int { return len(cards) - 1 }},
		{whereBottom, func([]string) int { return 0 }},
		{whereShuffle, func([]string) int { return -1 }},
	}
	for _, tt := range tests {
		t.Run(tt.where, func(t *testing.T) {
			f := sideSchemeFixture(t)

			f.mustDo(t, "h", Action{Kind: ActToDeck, Card: hydraPatrol, Where: tt.where, Pile: sideSchemeDeck}, at(1))

			tb := f.g.Table
			if _, ok := tb.Cards[hydraPatrol]; ok {
				t.Fatalf("card %s keeps its id", hydraPatrol)
			}
			id := f.renamedID(t, hydraPatrol)
			cards := tb.Piles[sideSchemeDeck].Cards
			if len(cards) != 3 || !slices.Contains(cards, id) {
				t.Fatalf("%s = %v, want 3 cards with %s", sideSchemeDeck, cards, id)
			}
			if i := tt.index(cards); i >= 0 && cards[i] != id {
				t.Errorf("%s = %v, want %s at %d", sideSchemeDeck, cards, id, i)
			}
			if c := tb.Cards[id]; c.Pile != sideSchemeDeck || c.Home != sideSchemeDeck {
				t.Errorf("card = %+v, want in %s, at home there", c, sideSchemeDeck)
			}
			if len(tb.Piles[PileEncounter].Cards) != len(f.g.History.Initial.Piles[PileEncounter].Cards) {
				t.Error("the encounter deck changed")
			}
			checkIntegrity(t, tb)
			checkHistory(t, f.g)
		})
	}
}

// TestEncounterCardOnTopOfAnotherEncounterDeck puts an encounter card on top
// of a scenario encounter deck: discarded later, it goes to that deck's
// discard pile.
func TestEncounterCardOnTopOfAnotherEncounterDeck(t *testing.T) {
	f := sideSchemeFixture(t)

	f.mustDo(t, "h", Action{Kind: ActToDeck, Card: hydraPatrol, Where: whereTop, Pile: "enc:w"}, at(1))
	id := f.renamedID(t, hydraPatrol)
	f.mustDo(t, "h", Action{Kind: ActDiscardTop, Pile: "enc:w", N: 1}, at(2))

	tb := f.g.Table
	if got := tb.Piles["encd:w"].Cards; !slices.Equal(got, []string{id}) {
		t.Errorf("encd:w = %v, want [%s]", got, id)
	}
	checkIntegrity(t, tb)
	checkHistory(t, f.g)
}

// TestEncounterCardOverARevealedCard puts an encounter card on top of a
// scenario deck whose top card is revealed: the revealed card goes back into
// the deck under it, out of sight, so it gets a new id too.
func TestEncounterCardOverARevealedCard(t *testing.T) {
	f := sideSchemeFixture(t)
	f.mustDo(t, "h", Action{Kind: ActReveal, Pile: sideSchemeDeck}, at(1))

	f.mustDo(t, "h", Action{Kind: ActToDeck, Card: hydraPatrol, Where: whereTop, Pile: sideSchemeDeck}, at(2))

	tb := f.g.Table
	revealed := f.renamedID(t, "s2")
	if revealed == "s2" {
		t.Error("the covered card keeps its id")
	}
	want := []string{"s1", revealed, f.renamedID(t, hydraPatrol)}
	if got := tb.Piles[sideSchemeDeck].Cards; !slices.Equal(got, want) {
		t.Errorf("%s = %v, want %v", sideSchemeDeck, got, want)
	}
	if c := tb.Cards[revealed]; c.Zone != ZonePile || c.OnPile != "" {
		t.Errorf("covered card = %+v, want back in the deck", c)
	}
	checkIntegrity(t, tb)
	checkHistory(t, f.g)
}

// TestSideCardBackOnItsSideDeck puts an Invocation card on top of the
// player's deck, draws it back, then returns it to its face-up side deck: on
// top it stays in sight and keeps its id, at the bottom of a deck holding
// cards it gets a new one. Either way the side deck is its home again.
func TestSideCardBackOnItsSideDeck(t *testing.T) {
	tests := []struct {
		where   string
		renamed bool
		line    string
	}{
		{whereTop, false, "put <name> on top of their Invocation deck"},
		{whereBottom, true, "put a card at the bottom of their Invocation deck"},
	}
	for _, tt := range tests {
		t.Run(tt.where, func(t *testing.T) {
			f := sideDeckFixture(t)
			card := drawSide(t, f, "h", invocationDeck, 1)
			name := f.nameOf(t, card)
			f.mustDo(t, "h", Action{Kind: ActToDeck, Card: card, Where: whereTop, Pile: "deck:p0"}, at(2))
			if c := f.g.Table.Cards[f.renamedID(t, card)]; c.Home != "deck:p0" {
				t.Fatalf("home in the deck = %q, want deck:p0", c.Home)
			}
			f.mustDo(t, "h", Action{Kind: ActDraw, N: 1}, at(3))
			card = f.lastInHand("p0")

			f.mustDo(t, "h", Action{Kind: ActToDeck, Card: card, Where: tt.where, Pile: invocationDeck}, at(4))

			tb := f.g.Table
			id := f.renamedID(t, card)
			if renamed := id != card; renamed != tt.renamed {
				t.Errorf("renamed = %t, want %t", renamed, tt.renamed)
			}
			if c := tb.Cards[id]; c.Pile != invocationDeck || c.Home != invocationDeck || c.SideDeck != invocationDeck {
				t.Errorf("card = %+v, want in %s, at home there", c, invocationDeck)
			}
			if got, want := f.lastLog().Text, strings.ReplaceAll(tt.line, "<name>", name); got != want {
				t.Errorf("line = %q, want %q", got, want)
			}
			checkIntegrity(t, tb)
			checkHistory(t, f.g)
			checkReplay(t, f)
		})
	}
}

// TestSideDeckRefusesForeignCards refuses a card of the player's deck, and a
// card of the player's other side deck, into a side deck, wherever it goes in
// it: a side deck takes only the cards of its own set.
func TestSideDeckRefusesForeignCards(t *testing.T) {
	f := heroGame(t, heroDeck(t, packstest.Catalog(t), herculesIdentity, "Hercules"))
	labor, gift := sideDeckID(0, 0), sideDeckID(0, 1)
	f.mustDo(t, "h", Action{Kind: ActDraw, N: 1}, at(1))
	deckCard := f.lastInHand("p0")
	giftCard := drawSide(t, f, "h", gift, 2)
	f.mustDo(t, "h", Action{Kind: ActPlay, Card: giftCard, X: 800, Y: 500}, at(3))
	events := len(f.g.History.Events)

	for _, card := range []string{deckCard, giftCard} {
		for _, where := range []string{whereTop, whereBottom, whereShuffle} {
			err := f.do("h", Action{Kind: ActToDeck, Card: card, Where: where, Pile: labor}, at(4))
			if !errors.Is(err, ErrInvalid) {
				t.Errorf("%s %s of %s: err = %v, want ErrInvalid", card, where, labor, err)
			}
		}
	}
	err := f.do("h", group(
		Action{Kind: ActToDeck, Card: deckCard, Where: whereTop, Pile: labor},
		Action{Kind: ActToDeck, Card: giftCard, Where: whereTop, Pile: labor},
	), at(5))
	if !errors.Is(err, ErrInvalid) {
		t.Errorf("group onto %s: err = %v, want ErrInvalid", labor, err)
	}
	if len(f.g.History.Events) != events {
		t.Error("a refused action was recorded")
	}
	// The Gift card still goes back to its own deck.
	f.mustDo(t, "h", Action{Kind: ActToDeck, Card: giftCard, Where: whereTop, Pile: gift}, at(6))
}

// TestToDeckRefusals refuses a deck that does not take the card: one of
// another owner, another player's, or a pile that is no deck.
func TestToDeckRefusals(t *testing.T) {
	tests := []struct {
		name string
		card string // "" for a card of p0 played on the table
		pile string
		want error
	}{
		{"player card onto a scenario deck", "", sideSchemeDeck, ErrInvalid},
		{"player card onto the encounter deck", "", PileEncounter, ErrInvalid},
		{"encounter card onto a player deck", hydraPatrol, "deck:p0", ErrInvalid},
		{"onto another player's deck", "", "deck:p1", ErrForbidden},
		{"onto a discard pile", hydraPatrol, PileEncounterDiscard, ErrInvalid},
		{"onto a scenario discard pile", hydraPatrol, sideSchemeDiscard, ErrInvalid},
		{"player card onto its discard pile", "", "disc:p0", ErrInvalid},
		{"onto the victory display", hydraPatrol, PileVictory, ErrInvalid},
		{"onto a set-aside pile", hydraPatrol, PileScenarioAside, ErrInvalid},
		{"onto an unknown pile", hydraPatrol, "nope", ErrInvalid},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := sideSchemeFixture(t)
			card := tt.card
			if card == "" {
				card = f.playCards(t, "h", "p0", 1)[0]
			}
			events := len(f.g.History.Events)

			err := f.do("h", Action{Kind: ActToDeck, Card: card, Where: whereTop, Pile: tt.pile}, at(5))

			if !errors.Is(err, tt.want) {
				t.Errorf("err = %v, want %v", err, tt.want)
			}
			if len(f.g.History.Events) != events {
				t.Error("the refused action was recorded")
			}
		})
	}
}

// TestToDeckRefusesAnotherPlayersSideDeck refuses a card onto the side deck
// of another player, whoever owns the card.
func TestToDeckRefusesAnotherPlayersSideDeck(t *testing.T) {
	f := sideDeckFixture(t)
	f.mustDo(t, "h", Action{Kind: ActDraw, N: 1}, at(1))
	hostCard := f.lastInHand("p0")
	f.mustDo(t, "b", Action{Kind: ActDraw, N: 1}, at(2))
	bobCard := f.lastInHand("p1")

	events := len(f.g.History.Events)

	for _, tt := range []struct {
		token, card, pile string
	}{
		{"h", hostCard, senseDeck},
		{"b", bobCard, invocationDeck},
	} {
		err := f.do(tt.token, Action{Kind: ActToDeck, Card: tt.card, Where: whereTop, Pile: tt.pile}, at(3))
		if !errors.Is(err, ErrForbidden) {
			t.Errorf("%s puts %s onto %s: err = %v, want ErrForbidden", tt.token, tt.card, tt.pile, err)
		}
	}
	if len(f.g.History.Events) != events {
		t.Error("a refused action was recorded")
	}
}

// TestUndoEncounterCardOnScenarioDeck undoes the plays and moves that follow
// an encounter card put on a scenario deck, then the move itself: the
// rebuild keeps the card at home in that deck, then brings it back to the
// table, at home in the encounter deck.
func TestUndoEncounterCardOnScenarioDeck(t *testing.T) {
	f := sideSchemeFixture(t)
	f.mustDo(t, "h", Action{Kind: ActToDeck, Card: hydraPatrol, Where: whereTop, Pile: sideSchemeDeck}, at(1))
	id := f.renamedID(t, hydraPatrol)
	f.mustDo(t, "h", Action{Kind: ActPlay, Pile: sideSchemeDeck, X: 900, Y: 300}, at(2))

	f.mustDo(t, "h", Action{Kind: ActUndo}, at(3))
	tb := f.g.Table
	if c := tb.Cards[id]; c == nil || c.Pile != sideSchemeDeck || c.Home != sideSchemeDeck {
		t.Fatalf("card after the first undo = %+v, want in %s, at home there", c, sideSchemeDeck)
	}
	checkIntegrity(t, tb)
	checkHistory(t, f.g)

	f.mustDo(t, "h", Action{Kind: ActUndo}, at(4))
	tb = f.g.Table
	c := tb.Cards[hydraPatrol]
	if c == nil || c.Zone != ZoneTable || c.X != 500 || c.Y != 300 || c.Home != PileEncounter {
		t.Fatalf("card after the second undo = %+v, want on the table at home in %s", c, PileEncounter)
	}
	if got := tb.Piles[sideSchemeDeck].Cards; !slices.Equal(got, []string{"s1", "s2"}) {
		t.Errorf("%s = %v, want [s1 s2]", sideSchemeDeck, got)
	}
	checkIntegrity(t, tb)
	checkHistory(t, f.g)
}

// TestGroupOnTopOfScenarioDeck puts two encounter cards on top of a scenario
// deck at once: both take it as their home, and the line names it.
func TestGroupOnTopOfScenarioDeck(t *testing.T) {
	f := sideSchemeFixture(t)
	names := f.nameOf(t, hydraPatrol) + ", " + f.nameOf(t, anotherScheme)
	subs := []Action{
		{Kind: ActToDeck, Card: hydraPatrol, Where: whereTop, Pile: sideSchemeDeck},
		{Kind: ActToDeck, Card: anotherScheme, Where: whereTop, Pile: sideSchemeDeck},
	}

	f.mustDo(t, "h", group(subs...), at(1))

	tb := f.g.Table
	for _, card := range []string{hydraPatrol, anotherScheme} {
		id := f.renamedID(t, card)
		if c := tb.Cards[id]; c == nil || c.Pile != sideSchemeDeck || c.Home != sideSchemeDeck {
			t.Errorf("card %s = %+v, want in %s, at home there", card, c, sideSchemeDeck)
		}
	}
	if got, want := f.lastLog().Text, "put 2 cards on top of the Side-scheme deck ("+names+")"; got != want {
		t.Errorf("line = %q, want %q", got, want)
	}
	checkIntegrity(t, tb)
	checkHistory(t, f.g)
}

// tuckUnder has Bob tuck two cards under host: the top card of his Sense
// deck, whose cards are discarded to its bottom, and a card of his deck,
// which goes to his discard pile. It returns their ids.
func (f *doFixture) tuckUnder(t *testing.T, host string) (senseCard, deckCard string) {
	t.Helper()
	senseCard = topCards(f.g.Table.Piles[senseDeck], 1)[0]
	f.mustDo(t, "b", Action{Kind: ActPlay, Pile: senseDeck, Target: host, X: 500, Y: 420}, at(3))
	f.mustDo(t, "b", Action{Kind: ActDraw, N: 1}, at(4))
	deckCard = f.lastInHand("p1")
	f.mustDo(t, "b", Action{Kind: ActPlay, Card: deckCard, Target: host, X: 500, Y: 440}, at(5))
	return senseCard, deckCard
}

// TestShuffleHostIntoAnotherDeck shuffles a Sense card that two cards are
// tucked under into the player's deck, which is not its home. The tucked
// Sense card goes to the bottom of its own deck under a new id; the tucked
// card of the player's deck goes on top of their discard pile, as it is.
func TestShuffleHostIntoAnotherDeck(t *testing.T) {
	f := sideDeckFixture(t)
	host := topCards(f.g.Table.Piles[senseDeck], 1)[0]
	f.mustDo(t, "b", Action{Kind: ActPlay, Pile: senseDeck, X: 500, Y: 400}, at(1))
	senseCard, deckCard := f.tuckUnder(t, host)

	f.mustDo(t, "b", Action{Kind: ActToDeck, Card: host, Where: whereShuffle, Pile: "deck:p1"}, at(6))

	tb := f.g.Table
	hostID := f.renamedID(t, host)
	if hostID == host {
		t.Errorf("host %s keeps its id", host)
	}
	if c := tb.Cards[hostID]; c == nil || c.Pile != "deck:p1" || c.Home != "deck:p1" || c.SideDeck != senseDeck {
		t.Errorf("host = %+v, want in deck:p1, at home there, a card of %s", c, senseDeck)
	}

	senseID := f.renamedID(t, senseCard)
	if senseID == senseCard {
		t.Errorf("tucked Sense card %s keeps its id", senseCard)
	}
	if sense := tb.Piles[senseDeck].Cards; sense[0] != senseID {
		t.Errorf("%s = %v, want %s at the bottom", senseDeck, sense, senseID)
	}
	if c := tb.Cards[senseID]; c == nil || c.Parent != "" || c.Home != senseDeck {
		t.Errorf("tucked Sense card = %+v, want untucked, at home in %s", c, senseDeck)
	}

	if id := f.renamedID(t, deckCard); id != deckCard {
		t.Errorf("tucked deck card %s gets the new id %s on its way to a face-up pile", deckCard, id)
	}
	if top := topCards(tb.Piles["disc:p1"], 1); !slices.Equal(top, []string{deckCard}) {
		t.Errorf("top of disc:p1 = %v, want [%s]", top, deckCard)
	}
	checkIntegrity(t, tb)
	checkHistory(t, f.g)
	checkReplay(t, f)
}

// TestHostOnTopOfItsSideDeckDropsTuckedSenseCard puts a Sense card, another
// Sense card tucked under it, on top of the Sense deck: the host lands on top
// in sight, as it is, and the tucked card drops to the bottom of the deck
// under a new id.
func TestHostOnTopOfItsSideDeckDropsTuckedSenseCard(t *testing.T) {
	f := sideDeckFixture(t)
	host := topCards(f.g.Table.Piles[senseDeck], 1)[0]
	f.mustDo(t, "b", Action{Kind: ActPlay, Pile: senseDeck, X: 500, Y: 400}, at(1))
	senseCard := topCards(f.g.Table.Piles[senseDeck], 1)[0]
	f.mustDo(t, "b", Action{Kind: ActPlay, Pile: senseDeck, Target: host, X: 500, Y: 420}, at(2))

	f.mustDo(t, "b", Action{Kind: ActToDeck, Card: host, Where: whereTop, Pile: senseDeck}, at(3))

	tb := f.g.Table
	if id := f.renamedID(t, host); id != host {
		t.Errorf("host %s gets the new id %s on top of a face-up deck", host, id)
	}
	senseID := f.renamedID(t, senseCard)
	if senseID == senseCard {
		t.Errorf("tucked Sense card %s keeps its id", senseCard)
	}
	cards := tb.Piles[senseDeck].Cards
	if cards[0] != senseID || cards[len(cards)-1] != host {
		t.Errorf("%s = %v, want %s at the bottom and %s on top", senseDeck, cards, senseID, host)
	}
	checkIntegrity(t, tb)
	checkHistory(t, f.g)
	checkReplay(t, f)
}

// TestRevealedCardOntoAnotherDeck puts the card revealed on the side-scheme
// deck on top of another encounter deck, which has a card revealed on it too:
// that card goes back into its deck under the moved one, and both get new
// ids.
func TestRevealedCardOntoAnotherDeck(t *testing.T) {
	f := sideSchemeFixture(t)
	f.mustDo(t, "h", Action{Kind: ActReveal, Pile: sideSchemeDeck}, at(1))
	f.mustDo(t, "h", Action{Kind: ActReveal, Pile: "enc:w"}, at(2))

	f.mustDo(t, "h", Action{Kind: ActToDeck, Card: "s2", Where: whereTop, Pile: "enc:w"}, at(3))

	tb := f.g.Table
	moved, covered := f.renamedID(t, "s2"), f.renamedID(t, "w3")
	if moved == "s2" || covered == "w3" {
		t.Errorf("new ids = %s, %s, want both cards renamed", moved, covered)
	}
	if got, want := tb.Piles["enc:w"].Cards, []string{"w1", "w2", covered, moved}; !slices.Equal(got, want) {
		t.Errorf("enc:w = %v, want %v", got, want)
	}
	if got := tb.Piles[sideSchemeDeck].Cards; !slices.Equal(got, []string{"s1"}) {
		t.Errorf("%s = %v, want [s1]", sideSchemeDeck, got)
	}
	for _, id := range []string{moved, covered} {
		if c := tb.Cards[id]; c.Zone != ZonePile || c.OnPile != "" || c.Home != "enc:w" {
			t.Errorf("card %s = %+v, want in enc:w, at home there", id, c)
		}
	}
	checkIntegrity(t, tb)
	checkHistory(t, f.g)
}

// TestToDeckRefusesTheOtherSeatsDeck refuses a card of one seat onto the deck
// of another seat of the same player, whichever seat the action is credited
// to: the deck takes the cards of its own seat only.
func TestToDeckRefusesTheOtherSeatsDeck(t *testing.T) {
	f := multiDeckFixture(t)
	f.mustDoAs(t, "a", 0, Action{Kind: ActDraw, N: 1}, at(1))
	card := f.lastInHand("p0")
	events := len(f.g.History.Events)

	for _, seat := range []int{0, 1} {
		err := f.doAs("a", seat, Action{Kind: ActToDeck, Card: card, Where: whereTop, Pile: "deck:p1"}, at(2))
		if !errors.Is(err, ErrInvalid) {
			t.Errorf("seat %d: err = %v, want ErrInvalid", seat, err)
		}
	}
	if len(f.g.History.Events) != events {
		t.Error("a refused action was recorded")
	}
}

// TestToDeckWithoutPileGoesToTheNewHome puts an Invocation card on top of
// the player's deck, draws it back, then puts it at the bottom of its deck
// naming none: it goes to the player's deck, its new home.
func TestToDeckWithoutPileGoesToTheNewHome(t *testing.T) {
	f := sideDeckFixture(t)
	card := drawSide(t, f, "h", invocationDeck, 1)
	f.mustDo(t, "h", Action{Kind: ActToDeck, Card: card, Where: whereTop, Pile: "deck:p0"}, at(2))
	f.mustDo(t, "h", Action{Kind: ActDraw, N: 1}, at(3))
	card = f.lastInHand("p0")
	invocationSize := len(f.g.Table.Piles[invocationDeck].Cards)

	f.mustDo(t, "h", Action{Kind: ActToDeck, Card: card, Where: whereBottom}, at(4))

	tb := f.g.Table
	id := f.renamedID(t, card)
	if got := tb.Piles["deck:p0"].Cards[0]; got != id {
		t.Errorf("bottom of deck:p0 = %s, want %s", got, id)
	}
	if c := tb.Cards[id]; c.Home != "deck:p0" {
		t.Errorf("home = %q, want deck:p0", c.Home)
	}
	if got := len(tb.Piles[invocationDeck].Cards); got != invocationSize {
		t.Errorf("%s holds %d cards, want %d", invocationDeck, got, invocationSize)
	}
	checkIntegrity(t, tb)
	checkHistory(t, f.g)
	checkReplay(t, f)
}
