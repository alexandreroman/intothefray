package game

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"slices"
	"strings"
	"testing"

	"github.com/alexandreroman/intothefray/internal/pack"
)

// Identities of heroes with side decks or set-aside cards.
const (
	doctorStrangeIdentity = "09001"
	daredevilIdentity     = "60001"
	herculesIdentity      = "59001"
	valkyrieIdentity      = "25001"
	icemanIdentity        = "46001"
)

// Pile ids of the side piles of the side-deck fixture.
const (
	invocationDeck    = "side:p0:0"
	invocationDiscard = "sided:p0:0"
	senseDeck         = "side:p1:0"
)

// heroDeck builds a deck from the cards of hero's set, without its
// obligation, plus the extra entries; the identity is listed too, as a
// marvelcdb deck lists it.
func heroDeck(t *testing.T, cat *pack.Catalog, identity, name string, extra ...DeckEntry) DeckChoice {
	t.Helper()
	hero, ok := cat.HeroByIdentity(identity)
	if !ok {
		t.Fatalf("no hero with identity %s", identity)
	}
	set, ok := cat.Set(hero.Set)
	if !ok {
		t.Fatalf("no set %q", hero.Set)
	}
	deck := DeckChoice{Name: name, Hero: identity, HeroName: name}
	deck.Cards = append(deck.Cards, DeckEntry{Code: identity, Qty: 1})
	for _, code := range set.Cards {
		if code == hero.Identity || code == hero.Obligation {
			continue
		}
		deck.Cards = append(deck.Cards, DeckEntry{Code: code, Qty: 1})
	}
	deck.Cards = append(deck.Cards, extra...)
	return deck
}

// heroGame returns a started Rhino game where "h" (Host) plays the first deck
// at p0 and "b" (Bob) the second one, if any, at p1.
func heroGame(t *testing.T, decks ...DeckChoice) *doFixture {
	t.Helper()
	cat := newCatalog(t)
	g := mustNewGame(t, "g1", "h", "Host", testNow)
	tokens := []string{"h", "b"}[:len(decks)]
	if len(decks) > 1 {
		if _, err := g.Join("b", "Bob"); err != nil {
			t.Fatal(err)
		}
	}
	if err := g.Configure("h", rhinoConfig(), cat); err != nil {
		t.Fatal(err)
	}
	for i, token := range tokens {
		seatDeck(t, g, token, 0, decks[i], cat)
	}
	if err := g.Start("h", cat, testSeed, testNow); err != nil {
		t.Fatal(err)
	}
	return &doFixture{g: g, cat: cat}
}

// sideDeckFixture is a started game where Host plays Doctor Strange (p0,
// with the Invocation deck and its discard pile) and Bob Daredevil (p1, with
// the Sense deck and no discard pile).
func sideDeckFixture(t *testing.T) *doFixture {
	t.Helper()
	cat := newCatalog(t)
	return heroGame(t,
		heroDeck(t, cat, doctorStrangeIdentity, "Doctor Strange"),
		heroDeck(t, cat, daredevilIdentity, "Daredevil"))
}

// drawSide draws the top card of a side deck into its owner's hand and
// returns its id.
func drawSide(t *testing.T, f *doFixture, token, pile string, seconds int) string {
	t.Helper()
	id := topCards(f.g.Table.Piles[pile], 1)[0]
	f.mustDo(t, token, Action{Kind: ActDraw, N: 1, Pile: pile}, at(seconds))
	return id
}

func TestSetupSideDecks(t *testing.T) {
	f := sideDeckFixture(t)
	table := f.g.Table
	rowY0, rowY1 := rowY(playerRow(0)), rowY(playerRow(1))

	invocation := table.Piles[invocationDeck]
	if invocation == nil || invocation.Kind != KindSideDeck || invocation.Owner != 0 ||
		invocation.Label != "Invocation" || !invocation.TopFaceUp || invocation.X != 320 || invocation.Y != rowY0 {
		t.Fatalf("Invocation deck = %+v, want p0's face-up side deck at (320, %d)", invocation, rowY0)
	}
	invocationCodes := []string{"09032", "09033", "09034", "09035", "09036"}
	if got := codesOf(table, invocation.Cards); !slices.Equal(got, invocationCodes) {
		t.Errorf("Invocation deck = %v, want %v", got, invocationCodes)
	}
	for _, id := range invocation.Cards {
		if c := table.Cards[id]; c.Owner != 0 || c.Home != invocationDeck || c.Zone != ZonePile {
			t.Errorf("Invocation card %+v, want owned by p0 at home in %s", c, invocationDeck)
		}
	}
	discard := table.Piles[invocationDiscard]
	if discard == nil || discard.Kind != KindSideDiscard || discard.Owner != 0 || discard.Label != "Invocation" ||
		discard.TopFaceUp || len(discard.Cards) != 0 || discard.X != 480 || discard.Y != rowY0 {
		t.Errorf("Invocation discard = %+v, want p0's empty side discard at (480, %d)", discard, rowY0)
	}
	if strange := f.g.Table.Cards[identityOf(t, f.g, 0)]; strange.X != 680 || strange.Y != rowY0 {
		t.Errorf("Doctor Strange at (%d, %d), want (680, %d)", strange.X, strange.Y, rowY0)
	}
	if table.FirstPlayer != (Point{X: 840, Y: rowY0}) {
		t.Errorf("first player = %+v, want (840, %d)", table.FirstPlayer, rowY0)
	}

	sense := table.Piles[senseDeck]
	if sense == nil || sense.Kind != KindSideDeck || sense.Owner != 1 || sense.Label != "Sense" ||
		!sense.TopFaceUp || len(sense.Cards) != 5 || sense.X != 320 || sense.Y != rowY1 {
		t.Errorf("Sense deck = %+v, want p1's face-up side deck of 5 at (320, %d)", sense, rowY1)
	}
	if _, ok := table.Piles["sided:p1:0"]; ok {
		t.Error("the Sense deck has a discard pile")
	}
	if daredevil := f.g.Table.Cards[identityOf(t, f.g, 1)]; daredevil.X != 520 {
		t.Errorf("Daredevil at x %d, want 520", daredevil.X)
	}

	// The decks hold none of the side deck cards.
	for seat, deck := range []DeckChoice{
		heroDeck(t, f.cat, doctorStrangeIdentity, "Doctor Strange"),
		heroDeck(t, f.cat, daredevilIdentity, "Daredevil"),
	} {
		pile := table.Piles["deck:"+string(PlayerArea(seat))]
		if got, want := codesOf(table, pile.Cards), expectedDeckCodes(t, f.cat, deck); !slices.Equal(got, want) {
			t.Errorf("p%d deck = %v, want %v", seat, got, want)
		}
	}
	checkIntegrity(t, table)
}

func TestSetupTwoSideDecks(t *testing.T) {
	f := heroGame(t, heroDeck(t, newCatalog(t), herculesIdentity, "Hercules"))
	table := f.g.Table
	y := rowY(playerRow(0))

	labels := map[string]bool{}
	for i, x := range []int{320, 480} {
		pile := table.Piles[sideDeckID(0, i)]
		if pile == nil || pile.Kind != KindSideDeck || pile.X != x || pile.Y != y || len(pile.Cards) != 3 {
			t.Fatalf("side deck %d = %+v, want 3 cards at (%d, %d)", i, pile, x, y)
		}
		labels[pile.Label] = true
		if _, ok := table.Piles[sideDiscardID(0, i)]; ok {
			t.Errorf("side deck %d has a discard pile", i)
		}
	}
	if !labels["Labor"] || !labels["Gift"] {
		t.Errorf("side deck labels = %v, want Labor and Gift", labels)
	}
	if hercules := f.g.Table.Cards[identityOf(t, f.g, 0)]; hercules.X != 680 {
		t.Errorf("Hercules at x %d, want 680", hercules.X)
	}
	if table.FirstPlayer.X != 840 {
		t.Errorf("first player at x %d, want 840", table.FirstPlayer.X)
	}
}

func TestSetupSetAsideHeroCards(t *testing.T) {
	cat := newCatalog(t)
	tests := []struct {
		name     string
		deck     DeckChoice
		code     string
		copies   int
		identity string
	}{
		{"Valkyrie's Death-Glow", heroDeck(t, cat, valkyrieIdentity, "Valkyrie"), "25002", 1, valkyrieIdentity},
		// The deck list names Frostbite, as a deck builder may: it stays out
		// of the deck all the same.
		{
			"Iceman's Frostbite", heroDeck(t, cat, icemanIdentity, "Iceman", DeckEntry{Code: "46002", Qty: 2}),
			"46002", 6, icemanIdentity,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := heroGame(t, tt.deck)
			table := f.g.Table

			var aside []*Card
			for _, id := range table.Piles["aside:p0"].Cards {
				if c := table.Cards[id]; c.Code == tt.code {
					aside = append(aside, c)
				}
			}
			if len(aside) != tt.copies {
				t.Fatalf("%s on aside:p0 = %d copies, want %d", tt.code, len(aside), tt.copies)
			}
			for _, c := range aside {
				if c.Owner != 0 || c.Home != "deck:p0" {
					t.Errorf("set-aside card %+v, want owned by p0 at home in deck:p0", c)
				}
			}
			if slices.Contains(codesOf(table, table.Piles["deck:p0"].Cards), tt.code) {
				t.Errorf("%s is in the deck", tt.code)
			}
			// No side piles: the identity keeps its place.
			if identity := f.g.Table.Cards[identityOf(t, f.g, 0)]; identity.X != identityX {
				t.Errorf("identity at x %d, want %d", identity.X, identityX)
			}
			checkIntegrity(t, table)
		})
	}
}

// Hashes of the JSON form of setup tables of heroes without side decks or
// set-aside cards, recorded before side decks existed: those setups must
// draw the same random numbers and so give the same tables and card ids.
// They change only with the card data of the heroes and scenario they use.
const (
	spiderManSetupHash = "ce7ff1fd9610a360dbf0fd8273777efa30b33cfb1c2912e050c44fbf7c190047"
	threeDeckSetupHash = "a74bf965c24c836b6ae33a39c1834137caba1b5be058d4c07e7a8fb85fa08f9f"
)

func TestSetupWithoutSideDecksIsUnchanged(t *testing.T) {
	tests := []struct {
		name  string
		table func(*testing.T) *Table
		want  string
	}{
		{
			"two Spider-Man players",
			func(t *testing.T) *Table { return startedGame(t, rhinoConfig()).Table },
			spiderManSetupHash,
		},
		{
			"three decks",
			func(t *testing.T) *Table { return twoDeckGame(t).Table },
			threeDeckSetupHash,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sum := sha256.Sum256(indentedJSON(t, tt.table(t)))
			if got := hex.EncodeToString(sum[:]); got != tt.want {
				t.Errorf("setup table hash = %s, want %s", got, tt.want)
			}
		})
	}
}

func TestSideDeckGameReplays(t *testing.T) {
	f := sideDeckFixture(t)
	invocation := drawSide(t, f, "h", invocationDeck, 1)
	f.mustDo(t, "h", Action{Kind: ActPlay, Card: invocation, X: 800, Y: 500}, at(2))
	f.mustDo(t, "h", Action{Kind: ActDiscard, Card: invocation}, at(3))
	f.mustDo(t, "h", Action{Kind: ActDiscardTop, Pile: invocationDeck, N: 1}, at(4))
	f.mustDo(t, "h", Action{Kind: ActShuffleBack, Pile: invocationDiscard}, at(5))
	f.mustDo(t, "h", Action{Kind: ActPlay, Pile: invocationDeck, X: 900, Y: 500}, at(6))
	sense := drawSide(t, f, "b", senseDeck, 7)
	f.mustDo(t, "b", Action{Kind: ActToDeck, Card: sense, Where: whereBottom}, at(8))
	f.mustDo(t, "b", Action{Kind: ActShuffle, Pile: senseDeck}, at(9))
	drawSide(t, f, "b", senseDeck, 10)
	f.mustDo(t, "h", Action{Kind: ActUndo}, at(11))
	f.mustDo(t, "b", Action{Kind: ActUndo}, at(12))

	checkIntegrity(t, f.g.Table)
	checkHistory(t, f.g)
	checkReplay(t, f)
}

func TestSideDeckRoutes(t *testing.T) {
	t.Run("an Invocation card is discarded to the Invocation discard pile", func(t *testing.T) {
		f := sideDeckFixture(t)
		id := drawSide(t, f, "h", invocationDeck, 1)
		f.mustDo(t, "h", Action{Kind: ActDiscard, Card: id}, at(2))
		if c := f.g.Table.Cards[id]; c.Pile != invocationDiscard {
			t.Errorf("discarded card in %q, want %s", c.Pile, invocationDiscard)
		}
	})
	t.Run("a Sense card has no discard pile", func(t *testing.T) {
		f := sideDeckFixture(t)
		id := drawSide(t, f, "b", senseDeck, 1)
		if err := f.do("b", Action{Kind: ActDiscard, Card: id}, at(2)); !errors.Is(err, ErrInvalid) {
			t.Errorf("discard = %v, want ErrInvalid", err)
		}
		if err := f.do("b", Action{Kind: ActDiscardTop, Pile: senseDeck, N: 1}, at(3)); !errors.Is(err, ErrInvalid) {
			t.Errorf("discard top = %v, want ErrInvalid", err)
		}
	})
	t.Run("a Sense card goes under the Sense deck", func(t *testing.T) {
		f := sideDeckFixture(t)
		id := drawSide(t, f, "b", senseDeck, 1)
		f.mustDo(t, "b", Action{Kind: ActToDeck, Card: id, Where: whereBottom}, at(2))
		if bottom := f.g.Table.Piles[senseDeck].Cards[0]; bottom != id {
			t.Errorf("bottom of the Sense deck = %s, want %s", bottom, id)
		}
		// The card leaves a hand for a face-down deck: nobody else saw it.
		if got, want := f.lastLog().Text, "put a card at the bottom of their Sense deck"; got != want {
			t.Errorf("line = %q, want %q", got, want)
		}
	})
	t.Run("a group of side cards goes under their deck", func(t *testing.T) {
		f := sideDeckFixture(t)
		first := drawSide(t, f, "b", senseDeck, 1)
		second := drawSide(t, f, "b", senseDeck, 2)
		f.mustDo(t, "b", Action{Kind: ActGroup, Actions: []Action{
			{Kind: ActToDeck, Card: first, Where: whereBottom},
			{Kind: ActToDeck, Card: second, Where: whereBottom},
		}}, at(3))
		if got := f.g.Table.Piles[senseDeck].Cards[:2]; !slices.Equal(got, []string{second, first}) {
			t.Errorf("bottom of the Sense deck = %v, want [%s %s]", got, second, first)
		}
	})
	t.Run("the Invocation discard pile shuffles back into its deck", func(t *testing.T) {
		f := sideDeckFixture(t)
		f.mustDo(t, "h", Action{Kind: ActDiscardTop, Pile: invocationDeck, N: 2}, at(1))
		if got := len(f.g.Table.Piles[invocationDiscard].Cards); got != 2 {
			t.Fatalf("Invocation discard holds %d cards, want 2", got)
		}
		f.mustDo(t, "h", Action{Kind: ActShuffleBack, Pile: invocationDiscard}, at(2))
		if got := len(f.g.Table.Piles[invocationDeck].Cards); got != 5 {
			t.Errorf("Invocation deck holds %d cards, want 5", got)
		}
		if got, want := f.lastLog().Text, "shuffled their Invocation discard pile into their Invocation deck"; got != want {
			t.Errorf("line = %q, want %q", got, want)
		}
		checkIntegrity(t, f.g.Table)
	})
	t.Run("a side card goes to the victory display, not to a regular pile", func(t *testing.T) {
		f := sideDeckFixture(t)
		id := drawSide(t, f, "b", senseDeck, 1)
		for i, target := range []string{"disc:p1", "deck:p1"} {
			if err := f.do("b", Action{Kind: ActToPile, Card: id, Target: target}, at(2+i)); !errors.Is(err, ErrInvalid) {
				t.Errorf("to %s = %v, want ErrInvalid", target, err)
			}
		}
		f.mustDo(t, "b", Action{Kind: ActToPile, Card: id, Target: PileVictory}, at(5))
		if c := f.g.Table.Cards[id]; c.Pile != PileVictory {
			t.Errorf("card in %q, want %s", c.Pile, PileVictory)
		}
	})
	t.Run("the top card of the own side deck is played", func(t *testing.T) {
		f := sideDeckFixture(t)
		top := topCards(f.g.Table.Piles[invocationDeck], 1)[0]
		f.mustDo(t, "h", Action{Kind: ActPlay, Pile: invocationDeck, X: 800, Y: 500}, at(1))
		if c := f.g.Table.Cards[top]; c.Zone != ZoneTable || c.X != 800 || c.Y != 500 {
			t.Errorf("played card = %+v, want on the table at (800, 500)", c)
		}
		if got, want := f.lastLog().Text, "played "+f.nameOf(t, top); got != want {
			t.Errorf("line = %q, want %q", got, want)
		}
	})
	t.Run("a card of the own side discard pile goes to the hand", func(t *testing.T) {
		f := sideDeckFixture(t)
		f.mustDo(t, "h", Action{Kind: ActDiscardTop, Pile: invocationDeck, N: 1}, at(1))
		id := f.g.Table.Piles[invocationDiscard].Cards[0]
		f.mustDo(t, "h", Action{Kind: ActToHand, Card: id}, at(2))
		if !slices.Contains(f.g.Table.Hands["p0"], id) {
			t.Errorf("hand = %v, want %s in it", f.g.Table.Hands["p0"], id)
		}
	})
}

func TestDrawFromSideDeck(t *testing.T) {
	f := sideDeckFixture(t)
	deckBefore := len(f.g.Table.Piles["deck:p0"].Cards)
	id := drawSide(t, f, "h", invocationDeck, 1)

	if c := f.g.Table.Cards[id]; c.Zone != ZoneHand || !slices.Equal(f.g.Table.Hands["p0"], []string{id}) {
		t.Errorf("drawn card = %+v, hand = %v, want it alone in p0's hand", c, f.g.Table.Hands["p0"])
	}
	if got := len(f.g.Table.Piles["deck:p0"].Cards); got != deckBefore {
		t.Errorf("the deck holds %d cards, want %d", got, deckBefore)
	}
	if got, want := f.lastLog().Text, "drew 1 card from their Invocation deck"; got != want {
		t.Errorf("line = %q, want %q", got, want)
	}

	// A draw without a pile keeps drawing from the deck.
	f.mustDo(t, "h", Action{Kind: ActDraw, N: 1}, at(2))
	if got := len(f.g.Table.Piles["deck:p0"].Cards); got != deckBefore-1 {
		t.Errorf("the deck holds %d cards, want %d", got, deckBefore-1)
	}
	if got := f.lastLog().Text; got != "drew 1 card" {
		t.Errorf("line = %q, want %q", got, "drew 1 card")
	}
}

func TestAnotherPlayersSideDeckIsPrivate(t *testing.T) {
	f := sideDeckFixture(t)
	for _, a := range []Action{
		{Kind: ActDraw, N: 1, Pile: invocationDeck},
		{Kind: ActSearch, Pile: invocationDeck},
		{Kind: ActLook, Pile: invocationDeck, N: 1},
		{Kind: ActShuffle, Pile: invocationDeck},
		{Kind: ActDiscardTop, Pile: invocationDeck, N: 1},
		{Kind: ActPlay, Pile: invocationDeck, X: 800, Y: 500},
	} {
		if err := f.do("b", a, at(1)); !errors.Is(err, ErrForbidden) {
			t.Errorf("Bob's %s of the Invocation deck = %v, want ErrForbidden", a.Kind, err)
		}
	}
	f.mustDo(t, "h", Action{Kind: ActSearch, Pile: invocationDeck}, at(2))
	if got := f.g.Table.Views["p0"]; got == nil || len(got.Cards) != 5 {
		t.Errorf("Host's search = %+v, want the 5 Invocation cards", got)
	}
}

func TestSideDeckViews(t *testing.T) {
	f := sideDeckFixture(t)
	table := f.g.Table
	invocationTop := topCards(table.Piles[invocationDeck], 1)[0]
	invocationUnder := table.Piles[invocationDeck].Cards[0]
	senseTop := topCards(table.Piles[senseDeck], 1)[0]
	senseUnder := table.Piles[senseDeck].Cards[0]

	for _, token := range []string{"h", "b", "nobody"} {
		tv := f.g.ViewFor(token).Table
		piles := map[string]PileView{}
		for _, pv := range tv.Piles {
			piles[pv.ID] = pv
		}
		cards := map[string]CardView{}
		for _, cv := range tv.Cards {
			cards[cv.ID] = cv
		}

		invocation := piles[invocationDeck]
		if invocation.Count != 5 || !slices.Equal(invocation.Cards, []string{invocationTop}) ||
			invocation.Label != "Invocation" || !invocation.TopFaceUp {
			t.Errorf("%s sees the Invocation deck as %+v, want 5 cards, its top one shown", token, invocation)
		}
		top, ok := cards[invocationTop]
		if !ok || top.Code == "" || top.Home != invocationDeck || top.Zone != ZonePile {
			t.Errorf("%s sees the Invocation top card as %+v, want its code and home", token, top)
		}
		if _, ok := cards[invocationUnder]; ok {
			t.Errorf("%s sees a card under the Invocation top card", token)
		}
		if discard := piles[invocationDiscard]; discard.Kind != KindSideDiscard || discard.Label != "Invocation" {
			t.Errorf("%s sees the Invocation discard as %+v", token, discard)
		}
		sense := piles[senseDeck]
		if sense.Count != 5 || !slices.Equal(sense.Cards, []string{senseTop}) || sense.Label != "Sense" ||
			!sense.TopFaceUp {
			t.Errorf("%s sees the Sense deck as %+v, want 5 cards, its top one shown", token, sense)
		}
		if _, ok := cards[senseUnder]; ok {
			t.Errorf("%s sees a card under the Sense top card", token)
		}
	}

	// A side card the viewer sees carries its home; other cards do not.
	sense := drawSide(t, f, "b", senseDeck, 1)
	f.mustDo(t, "b", Action{Kind: ActDraw, N: 1}, at(2))
	plain := f.g.Table.Hands["p1"][1]
	cards := map[string]CardView{}
	for _, cv := range f.g.ViewFor("b").Table.Cards {
		cards[cv.ID] = cv
	}
	if got := cards[sense].Home; got != senseDeck {
		t.Errorf("Sense card in hand has home %q, want %s", got, senseDeck)
	}
	if got := cards[plain].Home; got != "" {
		t.Errorf("deck card in hand has home %q, want none", got)
	}

	// A face-down side card on the table hides its code, not its home: every
	// viewer, its owner or not, sees which deck it came from.
	f.mustDo(t, "b", Action{Kind: ActPlay, Card: sense, X: 800, Y: 830}, at(3))
	f.g.Table.Cards[sense].FaceDown = true
	for _, token := range []string{"h", "b", "nobody"} {
		for _, cv := range f.g.ViewFor(token).Table.Cards {
			if cv.ID == sense && (cv.Code != "" || cv.Home != senseDeck) {
				t.Errorf("%s sees the face-down Sense card as %+v, want its home only", token, cv)
			}
		}
	}
}

// tuckedSenseFixture returns a game of Daredevil alone (p0, Sense deck
// "side:p0:0" without a discard pile) and a Sense card drawn into his hand.
func tuckedSenseFixture(t *testing.T) (f *doFixture, sense string) {
	t.Helper()
	f = heroGame(t, heroDeck(t, newCatalog(t), daredevilIdentity, "Daredevil"))
	return f, drawSide(t, f, "h", "side:p0:0", 1)
}

func TestTuckedSideCardWithoutDiscardGoesUnderItsDeck(t *testing.T) {
	f, sense := tuckedSenseFixture(t)
	f.mustDo(t, "h", Action{Kind: ActReveal}, at(2))
	enemy := f.g.Table.revealed()[0].ID
	f.mustDo(t, "h", Action{Kind: ActPlay, Card: sense, Target: enemy}, at(3))

	f.mustDo(t, "h", Action{Kind: ActDiscard, Card: enemy}, at(4))

	if c := f.g.Table.Cards[enemy]; c.Pile != PileEncounterDiscard {
		t.Errorf("enemy in %q, want %s", c.Pile, PileEncounterDiscard)
	}
	if bottom := f.g.Table.Piles["side:p0:0"].Cards[0]; bottom != sense {
		t.Errorf("bottom of the Sense deck = %s, want %s", bottom, sense)
	}
	checkIntegrity(t, f.g.Table)
	checkHistory(t, f.g)
	checkReplay(t, f)
}

func TestTuckedSideCardWithoutDiscardGoesUnderItsDeckInAGroup(t *testing.T) {
	f, sense := tuckedSenseFixture(t)
	hosts := topCards(f.g.Table.Piles["deck:p0"], 2)
	f.mustDo(t, "h", Action{Kind: ActPlay, Pile: "deck:p0", X: 800, Y: 500}, at(2))
	f.mustDo(t, "h", Action{Kind: ActPlay, Pile: "deck:p0", X: 1000, Y: 500}, at(3))
	f.mustDo(t, "h", Action{Kind: ActPlay, Card: sense, Target: hosts[1]}, at(4))

	f.mustDo(t, "h", Action{Kind: ActGroup, Actions: []Action{
		{Kind: ActDiscard, Card: hosts[0]},
		{Kind: ActDiscard, Card: hosts[1]},
	}}, at(5))

	if got := f.g.Table.Piles["disc:p0"].Cards; !slices.Equal(got, hosts) {
		t.Errorf("discard pile = %v, want %v", got, hosts)
	}
	if bottom := f.g.Table.Piles["side:p0:0"].Cards[0]; bottom != sense {
		t.Errorf("bottom of the Sense deck = %s, want %s", bottom, sense)
	}
	checkIntegrity(t, f.g.Table)
	checkHistory(t, f.g)
	checkReplay(t, f)
}

func TestShuffleIntoSideDeckTakesTheTuckedSideCards(t *testing.T) {
	for _, where := range []string{whereTop, whereBottom, whereShuffle} {
		t.Run(where, func(t *testing.T) {
			f, host := tuckedSenseFixture(t)
			tucked := drawSide(t, f, "h", "side:p0:0", 2)
			f.mustDo(t, "h", Action{Kind: ActPlay, Card: host, X: 800, Y: 500}, at(3))
			f.mustDo(t, "h", Action{Kind: ActPlay, Card: tucked, Target: host}, at(4))

			f.mustDo(t, "h", Action{Kind: ActToDeck, Card: host, Where: where}, at(5))

			deck := f.g.Table.Piles["side:p0:0"]
			if len(deck.Cards) != 5 {
				t.Fatalf("Sense deck holds %d cards, want 5", len(deck.Cards))
			}
			// The tucked card goes under the deck first, then its host.
			bottom, top := deck.Cards[0], deck.Cards[len(deck.Cards)-1]
			switch where {
			case whereTop:
				if bottom != tucked || top != host {
					t.Errorf("Sense deck = %v, want %s at the bottom and %s on top", deck.Cards, tucked, host)
				}
			case whereBottom:
				if got := deck.Cards[:2]; !slices.Equal(got, []string{host, tucked}) {
					t.Errorf("Sense deck = %v, want it to start with [%s %s]", deck.Cards, host, tucked)
				}
			}
			checkIntegrity(t, f.g.Table)
			checkHistory(t, f.g)
			checkReplay(t, f)
		})
	}
}

func TestDeckListSideCardsStayInTheirSideDeck(t *testing.T) {
	cat := newCatalog(t)
	f := heroGame(t, heroDeck(t, cat, doctorStrangeIdentity, "Doctor Strange", DeckEntry{Code: "09032", Qty: 1}))
	table := f.g.Table
	if slices.Contains(codesOf(table, table.Piles["deck:p0"].Cards), "09032") {
		t.Error("an Invocation card is in the deck")
	}
	if got := len(table.Piles[invocationDeck].Cards); got != 5 {
		t.Errorf("Invocation deck holds %d cards, want 5", got)
	}
}

func TestFaceDownSideDeckShowsItsCountOnly(t *testing.T) {
	f := heroGame(t, heroDeck(t, newCatalog(t), herculesIdentity, "Hercules"))
	pile := f.g.Table.Piles[sideDeckID(0, 0)]
	for _, token := range []string{"h", "nobody"} {
		tv := f.g.ViewFor(token).Table
		for _, pv := range tv.Piles {
			if pv.ID == pile.ID && (pv.Count != 3 || len(pv.Cards) != 0 || pv.TopFaceUp) {
				t.Errorf("%s sees the %s deck as %+v, want its count only", token, pile.Label, pv)
			}
		}
		for _, cv := range tv.Cards {
			if slices.Contains(pile.Cards, cv.ID) {
				t.Errorf("%s sees card %s of the %s deck", token, cv.ID, pile.Label)
			}
		}
	}
}

func TestSideDeckSharedBacks(t *testing.T) {
	f := heroGame(t, heroDeck(t, newCatalog(t), herculesIdentity, "Hercules"))
	table := f.g.Table
	wantBacks := map[string]pack.Back{"Labor": pack.BackPlayer, "Gift": pack.BackEncounter}

	var labor *Pile
	for i := range 2 {
		pile := table.Piles[sideDeckID(0, i)]
		want := wantBacks[pile.Label]
		if pile.Back != want {
			t.Errorf("%s deck back = %q, want %q", pile.Label, pile.Back, want)
		}
		for _, id := range pile.Cards {
			if c := table.Cards[id]; c.Back != want {
				t.Errorf("%s card %s has back %q, want %q", pile.Label, c.Code, c.Back, want)
			}
		}
		if pile.Label == "Labor" {
			labor = pile
		}
	}
	sideDecks := 0
	for _, pv := range f.g.ViewFor("nobody").Table.Piles {
		if !strings.HasPrefix(pv.ID, sideDeckPrefix) {
			continue
		}
		sideDecks++
		if pv.Back != wantBacks[pv.Label] {
			t.Errorf("a spectator sees %s with back %q, want %q", pv.ID, pv.Back, wantBacks[pv.Label])
		}
	}
	if sideDecks != 2 {
		t.Errorf("a spectator sees %d side decks, want 2", sideDecks)
	}

	// A Labor card is played and goes to the victory display like any card.
	id := topCards(labor, 1)[0]
	f.mustDo(t, "h", Action{Kind: ActPlay, Pile: labor.ID, X: 800, Y: 500}, at(1))
	f.mustDo(t, "h", Action{Kind: ActToPile, Card: id, Target: PileVictory}, at(2))
	if c := table.Cards[id]; c.Pile != PileVictory || c.Back != pack.BackPlayer {
		t.Errorf("Labor card = %+v, want on the victory display with a player back", c)
	}
	checkIntegrity(t, table)

	// The Invocation deck has no shared back: its cards keep their own.
	strange := sideDeckFixture(t)
	if pile := strange.g.Table.Piles[invocationDeck]; pile.Back != "" {
		t.Errorf("Invocation deck = %+v, want no shared back", pile)
	}
}
