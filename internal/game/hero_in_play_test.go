package game

import (
	"slices"
	"testing"

	"github.com/alexandreroman/intothefray/internal/pack"
	"github.com/alexandreroman/intothefray/packs/packstest"
)

// spectrumIdentity is Spectrum, whose set starts her three energy form
// upgrades in play: Monica Rambeau reads "Setup: Put all 3 energy form
// upgrades into play, facedown.". They start face up, since a face-down table
// card hides its code even from its owner (see putHeroInPlay).
const spectrumIdentity = "21001"

// energyForms are Gamma, Photon and Pulsar, in the order setup lays them out.
var energyForms = []string{"21002", "21003", "21004"}

// seatCardsOnTable returns the cards owned by seat that lie on the table,
// left to right, the identity among them.
func seatCardsOnTable(table *Table, seat int) []*Card {
	var cards []*Card
	for _, c := range table.Cards {
		if c.Zone == ZoneTable && c.Owner == seat {
			cards = append(cards, c)
		}
	}
	slices.SortFunc(cards, func(a, b *Card) int { return a.X - b.X })
	return cards
}

func TestSetupPutsHeroSetupCardsInPlay(t *testing.T) {
	cat := packstest.Catalog(t)
	withoutForms := heroDeck(t, cat, spectrumIdentity, "Spectrum")
	withoutForms.Cards = slices.DeleteFunc(withoutForms.Cards, func(entry DeckEntry) bool {
		return slices.Contains(energyForms, entry.Code)
	})
	expert := rhinoConfig()
	expert.Difficulty = pack.Expert
	expert.Expert = "expert"

	tests := []struct {
		name string
		cfg  LobbyConfig
		deck DeckChoice
	}{
		// heroDeck lists every card of the hero's set, the forms among them,
		// as a marvelcdb deck does.
		{"forms listed once", rhinoConfig(), heroDeck(t, cat, spectrumIdentity, "Spectrum")},
		{"forms listed twice", rhinoConfig(), heroDeck(t, cat, spectrumIdentity, "Spectrum",
			DeckEntry{Code: "21002", Qty: 1}, DeckEntry{Code: "21003", Qty: 1}, DeckEntry{Code: "21004", Qty: 1})},
		{"forms not listed", rhinoConfig(), withoutForms},
		{"expert", expert, heroDeck(t, cat, spectrumIdentity, "Spectrum")},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Spectrum sits at seat 0 so that the first player token lies in
			// her row.
			f := startedWith(t, tt.cfg, tt.deck, spiderManDeck(t, cat))
			table := f.g.Table

			cards := seatCardsOnTable(table, 0)
			if len(cards) != 1+len(energyForms) {
				t.Fatalf("seat 0 has %d cards on the table, want the identity and %d forms",
					len(cards), len(energyForms))
			}
			identity := cards[0]
			if !identity.Identity || identity.X != 300 {
				t.Fatalf("first card of row 1 = %+v, want the identity at x 300", identity)
			}
			// Each form lies inPlayGap past the card before it, on the grid:
			// 300 + 112 + 40 = 452, up to 460, then 620 and 780.
			wantX := []int{460, 620, 780}
			for i, c := range cards[1:] {
				if c.Code != energyForms[i] || c.X != wantX[i] || c.Y != identity.Y {
					t.Errorf("card %d of row 1 = %s at (%d, %d), want %s at (%d, %d)",
						i+1, c.Code, c.X, c.Y, energyForms[i], wantX[i], identity.Y)
				}
				if c.Face != 0 || c.FaceDown {
					t.Errorf("form %s on face %d, face down %v, want face up on face 0", c.Code, c.Face, c.FaceDown)
				}
				if c.Home != "deck:p0" {
					t.Errorf("form %s at home in %q, want deck:p0", c.Code, c.Home)
				}
			}
			// One copy of each form, on the table only.
			for _, code := range energyForms {
				copies := 0
				for _, c := range table.Cards {
					if c.Code == code {
						copies++
					}
				}
				if copies != 1 {
					t.Errorf("%d copies of %s, want 1", copies, code)
				}
			}
			if got := cardsOn(table, "deck:p0", energyForms); len(got) != 0 {
				t.Errorf("forms in deck:p0 = %v, want none", got)
			}
			// The rest of the deck list is in the deck.
			var wantDeck []string
			for _, code := range expectedDeckCodes(t, cat, tt.deck) {
				if !slices.Contains(energyForms, code) {
					wantDeck = append(wantDeck, code)
				}
			}
			if got := codesOf(table, table.Piles["deck:p0"].Cards); !slices.Equal(got, wantDeck) {
				t.Errorf("deck:p0 = %v, want %v", got, wantDeck)
			}

			// The first player token lies past the last form, not on it: 780 +
			// 112 + 40 = 932, up to 940.
			want := Point{X: 940, Y: identity.Y + 40}
			if token := table.FirstPlayer; token == nil || *token != want {
				t.Errorf("first player = %v, want %+v, past the last form", token, want)
			}
			// Spider-Man's set has no Setup cards: his identity lies alone.
			if row := seatCardsOnTable(table, 1); len(row) != 1 || !row[0].Identity {
				t.Errorf("seat 1 has %d cards on the table, want its identity only", len(row))
			}
			checkIntegrity(t, table)
		})
	}
}

func TestHeroSetupCardsGameReplays(t *testing.T) {
	cat := packstest.Catalog(t)
	f := startedWith(t, rhinoConfig(), heroDeck(t, cat, spectrumIdentity, "Spectrum"))
	forms := seatCardsOnTable(f.g.Table, 0)[1:]
	f.mustDo(t, "h", Action{Kind: ActFlip, Card: forms[0].ID}, at(1))
	f.mustDo(t, "h", Action{Kind: ActDiscard, Card: forms[1].ID}, at(2))
	f.mustDo(t, "h", Action{Kind: ActUndo}, at(3))

	checkIntegrity(t, f.g.Table)
	checkHistory(t, f.g)
	checkReplay(t, f)
}
