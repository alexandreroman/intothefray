package game

import (
	"reflect"
	"slices"
	"strings"
	"testing"
)

// ironheartIdentity is the first version of Ironheart, whose set puts her
// other versions aside.
const ironheartIdentity = "29001"

// Ironheart's other versions, set aside at setup.
const (
	ironheartSecondVersion = "29002"
	ironheartThirdVersion  = "29003"
)

// asideCard returns the id of the first card with the given code on seat's
// set-aside pile.
func asideCard(t *testing.T, table *Table, seat int, code string) string {
	t.Helper()
	pileID := "aside:" + string(PlayerArea(seat))
	for _, id := range table.Piles[pileID].Cards {
		if table.Cards[id].Code == code {
			return id
		}
	}
	t.Fatalf("no card %s on %s", code, pileID)
	return ""
}

// ironheartFixture is a started game where Host plays Ironheart at p0. It
// returns the ids of her identity on the table and of her second version,
// set aside.
func ironheartFixture(t *testing.T) (f *doFixture, identity, version string) {
	t.Helper()
	f = heroGame(t, heroDeck(t, newCatalog(t), ironheartIdentity, "Ironheart"))
	identity = identityOf(t, f.g, 0)
	version = asideCard(t, f.g.Table, 0, ironheartSecondVersion)
	return f, identity, version
}

// playOnTable has Host play card id, from a hand or a pile, onto the table.
func (f *doFixture) playOnTable(t *testing.T, id string, seconds int) {
	t.Helper()
	f.mustDo(t, "h", Action{Kind: ActPlay, Card: id, X: 1200, Y: 400}, at(seconds))
}

func TestSetupMarksIdentityVersions(t *testing.T) {
	cat := newCatalog(t)
	tests := []struct {
		name string
		deck DeckChoice
		// versions are the codes of the set-aside cards that are identity
		// versions; every other set-aside card is not one.
		versions []string
	}{
		{
			"Ironheart's other versions",
			heroDeck(t, cat, ironheartIdentity, "Ironheart"),
			[]string{ironheartSecondVersion, ironheartThirdVersion},
		},
		{"Valkyrie's Death-Glow", heroDeck(t, cat, valkyrieIdentity, "Valkyrie"), nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := heroGame(t, tt.deck)
			table := f.g.Table

			found := 0
			for _, id := range table.Piles["aside:p0"].Cards {
				c := table.Cards[id]
				want := slices.Contains(tt.versions, c.Code)
				if c.IdentityVersion != want {
					t.Errorf("set-aside %s identity version = %t, want %t", c.Code, c.IdentityVersion, want)
				}
				if c.Identity {
					t.Errorf("set-aside %s is an identity", c.Code)
				}
				if want {
					found++
				}
			}
			if found != len(tt.versions) {
				t.Errorf("found %d identity versions, want %d", found, len(tt.versions))
			}
			identity := table.Cards[identityOf(t, f.g, 0)]
			if !identity.Identity || identity.IdentityVersion {
				t.Errorf("identity %+v, want an identity and not a version", identity)
			}
		})
	}
}

func TestPlayedVersionTakesOverIdentity(t *testing.T) {
	f, identity, version := ironheartFixture(t)

	f.playOnTable(t, version, 1)

	table := f.g.Table
	if c := table.Cards[version]; c.Zone != ZoneTable || !c.Identity {
		t.Errorf("played version %+v, want the identity on the table", c)
	}
	if c := table.Cards[identity]; c.Identity || !c.IdentityVersion {
		t.Errorf("replaced identity %+v, want a version and no identity", c)
	}
	checkIntegrity(t, table)
	checkReplay(t, f)
}

func TestPlayedVersionStaysOnTheTable(t *testing.T) {
	tests := []struct {
		name string
		a    Action
	}{
		{"discard", Action{Kind: ActDiscard}},
		{"to hand", Action{Kind: ActToHand}},
		{"to deck", Action{Kind: ActToDeck, Where: whereTop}},
		{"set aside", Action{Kind: ActToPile, Target: "aside:p0"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f, _, version := ironheartFixture(t)
			f.playOnTable(t, version, 1)
			a := tt.a
			a.Card = version

			err := f.do("h", a, at(2))

			if err == nil || !strings.Contains(err.Error(), "the identity card stays on the table") {
				t.Errorf("err = %v, want the identity card to stay on the table", err)
			}
		})
	}
}

func TestReplacedIdentityLeavesTheTable(t *testing.T) {
	f, identity, version := ironheartFixture(t)
	f.playOnTable(t, version, 1)

	f.mustDo(t, "h", Action{Kind: ActToPile, Card: identity, Target: "aside:p0"}, at(2))

	if c := f.g.Table.Cards[identity]; c.Zone != ZonePile || c.Pile != "aside:p0" {
		t.Errorf("replaced identity %+v, want it on aside:p0", c)
	}
	// Played back, the first version takes the identity back.
	f.playOnTable(t, identity, 3)
	table := f.g.Table
	if !table.Cards[identity].Identity || table.Cards[version].Identity {
		t.Errorf("identity marks: first %t, second %t, want the first one only",
			table.Cards[identity].Identity, table.Cards[version].Identity)
	}
	checkReplay(t, f)
}

func TestLastPlayedVersionIsTheIdentity(t *testing.T) {
	f, identity, second := ironheartFixture(t)
	third := asideCard(t, f.g.Table, 0, ironheartThirdVersion)

	f.playOnTable(t, second, 1)
	f.playOnTable(t, third, 2)

	table := f.g.Table
	for _, card := range []struct {
		name     string
		id       string
		identity bool
	}{
		{"first version", identity, false},
		{"second version", second, false},
		{"third version", third, true},
	} {
		if got := table.Cards[card.id].Identity; got != card.identity {
			t.Errorf("%s identity = %t, want %t", card.name, got, card.identity)
		}
	}
	f.mustDo(t, "h", Action{Kind: ActToPile, Card: second, Target: "aside:p0"}, at(3))
	checkReplay(t, f)
}

func TestUndoPlayedVersionRestoresIdentity(t *testing.T) {
	f, identity, version := ironheartFixture(t)
	before := f.g.Table.Clone()
	f.playOnTable(t, version, 1)

	f.mustDo(t, "h", Action{Kind: ActUndo}, at(2))

	for _, id := range []string{identity, version} {
		if got, want := f.g.Table.Cards[id], before.Cards[id]; !reflect.DeepEqual(got, want) {
			t.Errorf("card %s = %+v after the undo, want %+v", id, got, want)
		}
	}
	checkReplay(t, f)
}

func TestPlayedCardThatIsNoVersionGivesNoIdentity(t *testing.T) {
	cat := newCatalog(t)
	tests := []struct {
		name string
		deck DeckChoice
		// pick returns the card to play.
		pick func(t *testing.T, f *doFixture) string
	}{
		{
			"Valkyrie's Death-Glow",
			heroDeck(t, cat, valkyrieIdentity, "Valkyrie"),
			func(t *testing.T, f *doFixture) string { return asideCard(t, f.g.Table, 0, "25002") },
		},
		{
			"a card drawn from Ironheart's deck",
			heroDeck(t, cat, ironheartIdentity, "Ironheart"),
			func(t *testing.T, f *doFixture) string {
				f.mustDo(t, "h", Action{Kind: ActDraw, N: 1}, at(1))
				hand := f.g.Table.Hands["p0"]
				return hand[len(hand)-1]
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := heroGame(t, tt.deck)
			identity := identityOf(t, f.g, 0)
			card := tt.pick(t, f)

			f.playOnTable(t, card, 2)

			if f.g.Table.Cards[card].Identity {
				t.Errorf("played card %s is an identity", card)
			}
			if !f.g.Table.Cards[identity].Identity {
				t.Error("the hero lost her identity")
			}
		})
	}
}

func TestVersionTakesOverOnlyItsSeatIdentity(t *testing.T) {
	cat := newCatalog(t)
	g := twoSlotLobby(t)
	if err := g.Configure("a", rhinoConfig(), cat); err != nil {
		t.Fatal(err)
	}
	// Alex plays Spider-Man at seat 0 and Ironheart at seat 1, Sam Spider-Man
	// at seat 2.
	seatDeck(t, g, "a", 0, spiderManDeck(t, cat), cat)
	seatDeck(t, g, "a", 1, heroDeck(t, cat, ironheartIdentity, "Ironheart"), cat)
	seatDeck(t, g, "s", 0, spiderManDeck(t, cat), cat)
	if err := g.Start("a", cat, testSeed, testNow); err != nil {
		t.Fatal(err)
	}
	f := &doFixture{g: g, cat: cat}
	identities := []string{identityOf(t, g, 0), identityOf(t, g, 1), identityOf(t, g, 2)}
	version := asideCard(t, g.Table, 1, ironheartSecondVersion)

	// Credited to Alex's other seat, the play still changes Ironheart's seat.
	f.mustDoAs(t, "a", 0, Action{Kind: ActPlay, Card: version, X: 1200, Y: 800}, at(1))

	table := g.Table
	for seat, want := range []bool{true, false, true} {
		if got := table.Cards[identities[seat]].Identity; got != want {
			t.Errorf("seat %d setup identity = %t, want %t", seat, got, want)
		}
	}
	if !table.Cards[version].Identity {
		t.Error("the played version is not seat 1's identity")
	}
	checkReplay(t, f)
}
