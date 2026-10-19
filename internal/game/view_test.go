package game

import (
	"cmp"
	"encoding/json"
	"fmt"
	"regexp"
	"slices"
	"strings"
	"testing"

	"github.com/alexandreroman/intothefray/internal/pack"
)

const (
	hostToken = "token-host-secret" //nolint:gosec // test fixture
	bobToken  = "token-bob-secret"
	specToken = "token-spectator-secret"
)

// uniqueBasics returns n basic player cards that the Spider-Man deck lacks,
// so that giving one to a single player makes its code unique in the game.
func uniqueBasics(t *testing.T, cat *pack.Catalog, deck DeckChoice, n int) []string {
	t.Helper()
	var found []string
	for number := 1050; len(found) < n && number < 1400; number++ {
		code := fmt.Sprintf("%05d", number)
		card, _, err := cat.Card(code)
		if err != nil || card.Back != pack.BackPlayer || card.Set != "" {
			continue
		}
		if slices.ContainsFunc(deck.Cards, func(e DeckEntry) bool { return e.Code == code }) {
			continue
		}
		found = append(found, code)
	}
	if len(found) < n {
		t.Fatalf("found only %d unused basic cards", len(found))
	}
	return found
}

// viewFixture is a started game whose players hold one unique code each in
// their decks, with a spectator watching.
type viewFixture struct {
	*doFixture
	hostCode, bobCode string // unique codes of each player's deck
	hostCard, bobCard string // matching card ids
}

func newViewFixture(t *testing.T) *viewFixture {
	t.Helper()
	cat := newCatalog(t)
	g := mustNewGame(t, "g1", hostToken, "Host", testNow)
	if _, err := g.Join(bobToken, "Bob"); err != nil {
		t.Fatal(err)
	}
	if err := g.Configure(hostToken, rhinoConfig(), cat); err != nil {
		t.Fatal(err)
	}
	base := spiderManDeck(t, cat)
	extra := uniqueBasics(t, cat, base, 2)
	for i, token := range []string{hostToken, bobToken} {
		deck := base
		deck.Cards = append(slices.Clone(base.Cards), DeckEntry{Code: extra[i], Qty: 1})
		if err := g.SetDeck(token, 0, deck, cat); err != nil {
			t.Fatal(err)
		}
	}
	if err := g.Start(hostToken, cat, testSeed, testNow); err != nil {
		t.Fatal(err)
	}
	if _, err := g.Join(specToken, "Sam"); err != nil {
		t.Fatal(err)
	}

	f := &viewFixture{
		doFixture: &doFixture{g: g, cat: cat},
		hostCode:  extra[0],
		bobCode:   extra[1],
	}
	f.hostCard = cardWithCode(t, g.Table, f.hostCode).ID
	f.bobCard = cardWithCode(t, g.Table, f.bobCode).ID
	// Keep the host's unique card at the bottom of its deck so that drawing a
	// few cards never takes it.
	deck := g.Table.Piles["deck:p0"]
	deck.Cards = append([]string{f.hostCard}, without(deck.Cards, f.hostCard)...)
	// The history starts from the table as the fixture leaves it.
	g.History.Initial = withoutViews(g.Table)
	return f
}

// codeCounts returns how many cards of the table carry each code.
func codeCounts(table *Table) map[string]int {
	counts := map[string]int{}
	for _, c := range table.Cards {
		counts[c.Code]++
	}
	return counts
}

// uniqueEncounterCards returns the ids of encounter deck cards whose code
// occurs once in the whole game.
func uniqueEncounterCards(table *Table) []string {
	counts := codeCounts(table)
	var ids []string
	for _, id := range table.Piles[PileEncounter].Cards {
		if counts[table.Cards[id].Code] == 1 {
			ids = append(ids, id)
		}
	}
	return ids
}

func viewJSON(t *testing.T, g *Game, token string) string {
	t.Helper()
	return mustJSON(t, g.ViewFor(token))
}

func hasCode(doc, code string) bool {
	return strings.Contains(doc, `"`+code+`"`)
}

func TestViewNeverLeaksHiddenCodes(t *testing.T) {
	f := newViewFixture(t)
	table := f.g.Table

	unique := uniqueEncounterCards(table)
	if len(unique) < 2 {
		t.Fatalf("need 2 encounter cards with a unique code, got %d", len(unique))
	}
	dealtID, deckID := unique[0], unique[1]
	// Put the first unique card on top so that the deal picks it.
	enc := table.Piles[PileEncounter]
	enc.Cards = slices.DeleteFunc(enc.Cards, func(id string) bool { return id == dealtID })
	enc.Cards = append(enc.Cards, dealtID)
	dealtCode, deckCode := table.Cards[dealtID].Code, table.Cards[deckID].Code

	f.mustDo(t, hostToken, Action{Kind: ActDeal, Area: "p0", X: 600, Y: 200}, at(1))
	f.mustDo(t, bobToken, Action{Kind: ActToHand, Card: f.bobCard}, at(2))
	f.mustDo(t, hostToken, Action{Kind: ActDraw, N: 1}, at(3))

	if !table.Cards[dealtID].FaceDown || table.Cards[dealtID].Zone != ZoneTable {
		t.Fatal("the dealt card must lie face down on the table")
	}
	if table.Cards[deckID].Zone != ZonePile || table.Cards[deckID].Pile != PileEncounter {
		t.Fatal("the other unique encounter card must stay in the deck")
	}

	tests := []struct {
		name   string
		token  string
		hidden []string // codes that must not appear
	}{
		{"host", hostToken, []string{f.bobCode, f.hostCode, deckCode, dealtCode}},
		{"bob", bobToken, []string{f.hostCode, deckCode, dealtCode}},
		{"spectator", specToken, []string{f.hostCode, f.bobCode, deckCode, dealtCode}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			doc := viewJSON(t, f.g, tt.token)
			for _, secret := range []string{hostToken, bobToken, specToken, `"before"`, `"undo"`} {
				if strings.Contains(doc, secret) {
					t.Errorf("view contains %s", secret)
				}
			}
			for _, code := range tt.hidden {
				if hasCode(doc, code) {
					t.Errorf("view leaks code %s", code)
				}
			}
		})
	}
	// Positive side: each player reads their own hand.
	if !hasCode(viewJSON(t, f.g, bobToken), f.bobCode) {
		t.Error("bob does not see the card in his own hand")
	}
	host := f.g.ViewFor(hostToken)
	if len(host.Table.Hands["p0"]) != 1 {
		t.Fatalf("host hand = %v, want 1 card", host.Table.Hands["p0"])
	}
	handCode := table.Cards[host.Table.Hands["p0"][0]].Code
	if !hasCode(mustJSON(t, host), handCode) {
		t.Error("host does not see the code of the card in its own hand")
	}
}

func TestOwnHandAndPrivateViewVisible(t *testing.T) {
	f := newViewFixture(t)
	f.mustDo(t, hostToken, Action{Kind: ActDraw, N: 2}, at(1))
	f.mustDo(t, hostToken, Action{Kind: ActLook, Pile: "deck:p0", N: 3}, at(2))

	deck := f.g.Table.Piles["deck:p0"]
	top3 := topCards(deck, 3)
	hand := f.g.Table.Hands["p0"]

	host := f.g.ViewFor(hostToken)
	if host.Table == nil || host.Table.Private == nil {
		t.Fatal("host has no private view")
	}
	if !slices.Equal(host.Table.Private.Cards, top3) {
		t.Errorf("private cards = %v, want %v", host.Table.Private.Cards, top3)
	}
	if !slices.Equal(host.Table.Hands["p0"], hand) {
		t.Errorf("hand = %v, want %v", host.Table.Hands["p0"], hand)
	}
	hostDoc := mustJSON(t, host)
	for _, id := range append(slices.Clone(top3), hand...) {
		if !hasCode(hostDoc, f.g.Table.Cards[id].Code) {
			t.Errorf("host does not see the code of %s", id)
		}
	}

	for _, token := range []string{bobToken, specToken} {
		v := f.g.ViewFor(token)
		if _, ok := v.Table.Hands["p0"]; v.Table.Private != nil || ok {
			t.Errorf("%s sees a private view or the host's hand", token)
		}
		for _, id := range append(slices.Clone(top3), hand...) {
			if slices.ContainsFunc(v.Table.Cards, func(c CardView) bool { return c.ID == id }) {
				t.Errorf("%s sees card %s", token, id)
			}
		}
	}
	if got := f.g.ViewFor(bobToken).Players[0].Decks[0].HandCount; got != 2 {
		t.Errorf("host hand count seen by bob = %d, want 2", got)
	}
}

func TestPrivateViewDropsCardsThatLeftThePile(t *testing.T) {
	f := newViewFixture(t)
	f.mustDo(t, hostToken, Action{Kind: ActLook, Pile: "deck:p0", N: 3}, at(1))
	top3 := topCards(f.g.Table.Piles["deck:p0"], 3)
	f.mustDo(t, hostToken, Action{Kind: ActToHand, Card: top3[1]}, at(2))

	got := f.g.ViewFor(hostToken).Table.Private.Cards
	if want := []string{top3[0], top3[2]}; !slices.Equal(got, want) {
		t.Errorf("private cards = %v, want %v", got, want)
	}
}

func TestPrivateViewFollowsReorderTop(t *testing.T) {
	f := newViewFixture(t)
	f.mustDo(t, hostToken, Action{Kind: ActLook, Pile: "deck:p0", N: 3}, at(1))
	top3 := topCards(f.g.Table.Piles["deck:p0"], 3)
	reordered := []string{top3[2], top3[0], top3[1]}
	f.mustDo(t, hostToken, Action{Kind: ActReorderTop, Pile: "deck:p0", Cards: reordered}, at(2))

	got := f.g.ViewFor(hostToken).Table.Private.Cards
	if !slices.Equal(got, reordered) {
		t.Errorf("private cards = %v, want %v", got, reordered)
	}
}

func TestPublicPilesListed(t *testing.T) {
	f := newViewFixture(t)
	f.mustDo(t, hostToken, Action{Kind: ActDraw, N: 1}, at(1))
	id := f.g.Table.Hands["p0"][0]
	code := f.g.Table.Cards[id].Code
	f.mustDo(t, hostToken, Action{Kind: ActDiscard, Card: id}, at(2))

	for _, token := range []string{hostToken, bobToken, specToken, "unknown"} {
		v := f.g.ViewFor(token)
		var found bool
		for _, c := range v.Table.Cards {
			found = found || (c.ID == id && c.Code == code)
		}
		if !found {
			t.Errorf("%s does not see the discarded card with its code", token)
		}
		for _, p := range v.Table.Piles {
			switch p.ID {
			case "disc:p0":
				if !slices.Equal(p.Cards, []string{id}) || p.Count != 1 {
					t.Errorf("disc:p0 = %+v", p)
				}
			case "deck:p0", PileEncounter:
				if len(p.Cards) != 0 || p.Count == 0 {
					t.Errorf("%s exposes cards or no count: %+v", p.ID, p)
				}
			}
		}
	}
}

func TestFaceDownCardHasNoCodeKey(t *testing.T) {
	f := newViewFixture(t)
	f.mustDo(t, hostToken, Action{Kind: ActDeal, Area: "p0", X: 600, Y: 200}, at(1))
	var dealt string
	for id, c := range f.g.Table.Cards {
		if c.FaceDown && c.Zone == ZoneTable {
			dealt = id
		}
	}
	if dealt == "" {
		t.Fatal("no face-down card")
	}
	for _, c := range f.g.ViewFor(bobToken).Table.Cards {
		if c.ID != dealt {
			continue
		}
		raw, err := json.Marshal(c)
		if err != nil {
			t.Fatal(err)
		}
		if strings.Contains(string(raw), `"code"`) {
			t.Errorf("face-down card has a code key: %s", raw)
		}
		return
	}
	t.Error("the face-down card is not listed")
}

func TestStageCardsAreListedWithTheirKey(t *testing.T) {
	f := newViewFixture(t)
	view := f.g.ViewFor(specToken)
	stageOf := map[string]string{}
	for _, c := range view.Table.Cards {
		stageOf[c.ID] = c.Stage
	}
	for _, stage := range f.g.Table.Stages {
		for _, id := range append([]string{stage.Current}, stage.Cards...) {
			if got, ok := stageOf[id]; !ok || got != stage.Key {
				t.Errorf("card %s: stage = %q (listed %v), want %q", id, got, ok, stage.Key)
			}
		}
	}
}

func TestViewIdentity(t *testing.T) {
	f := newViewFixture(t)

	host := f.g.ViewFor(hostToken)
	if host.You.Role != RolePlayer || !host.You.Host || !slices.Equal(host.You.Areas, []Area{"p0"}) ||
		host.You.Name != "Host" {
		t.Errorf("host You = %+v", host.You)
	}
	bob := f.g.ViewFor(bobToken)
	if !slices.Equal(bob.You.Areas, []Area{"p1"}) || bob.You.Host {
		t.Errorf("bob You = %+v", bob.You)
	}
	if got := f.g.ViewFor(specToken).You; got.Role != RoleSpectator || len(got.Areas) != 0 {
		t.Errorf("spectator You = %+v", got)
	}
	unknown := f.g.ViewFor("nobody")
	if unknown.You.Role != "" || unknown.Table.Private != nil || len(unknown.Table.Hands) != 0 || unknown.CanUndo {
		t.Errorf("unknown viewer = %+v", unknown.You)
	}
	if host.Spectators != 0 || len(host.Players) != 2 {
		t.Errorf("spectators = %d, players = %d; want 0, filled by the server, and 2", host.Spectators, len(host.Players))
	}
	p := host.Players[1]
	if p.Name != "Bob" || !p.Ready || len(p.Decks) != 1 {
		t.Fatalf("player view = %+v", p)
	}
	d := p.Decks[0]
	if d.Area != "p1" || !d.Ready || d.HeroName != "Spider-Man" || d.DeckName != "Spidey" || d.Hero == "" {
		t.Errorf("deck view = %+v", d)
	}
	if want := f.g.Players[1].Decks[0].HeroImage; want == "" || d.HeroImage != want {
		t.Errorf("deck hero image = %q, want %q", d.HeroImage, want)
	}
}

func TestViewHandsOfOwnSeats(t *testing.T) {
	cat := newCatalog(t)
	g := twoDeckGame(t)
	// Alex draws into the hand of his first deck, Sam into his only one.
	if err := g.Do("a", Action{Kind: ActDraw, N: 1}, cat, at(1)); err != nil {
		t.Fatal(err)
	}
	if err := g.Do("s", Action{Kind: ActDraw, N: 2}, cat, at(2)); err != nil {
		t.Fatal(err)
	}
	// A card goes straight into the hand of Alex's second deck.
	deck := g.Table.Piles["deck:p1"]
	moved := deck.Cards[len(deck.Cards)-1]
	deck.Cards = deck.Cards[:len(deck.Cards)-1]
	g.Table.Hands["p1"] = append(g.Table.Hands["p1"], moved)
	g.Table.Cards[moved].Zone = ZoneHand

	alex := g.ViewFor("a")
	if len(alex.Table.Hands) != 2 || !slices.Equal(alex.Table.Hands["p0"], g.Table.Hands["p0"]) ||
		!slices.Equal(alex.Table.Hands["p1"], g.Table.Hands["p1"]) {
		t.Errorf("Alex's hands = %v, want p0 and p1", alex.Table.Hands)
	}
	if !slices.ContainsFunc(alex.Table.Cards, func(c CardView) bool { return c.ID == moved }) {
		t.Error("Alex does not see the card in the hand of his second deck")
	}
	for _, id := range g.Table.Hands["p2"] {
		if slices.ContainsFunc(alex.Table.Cards, func(c CardView) bool { return c.ID == id }) {
			t.Errorf("Alex sees card %s of Sam's hand", id)
		}
	}

	sam := g.ViewFor("s")
	if len(sam.Table.Hands) != 1 || !slices.Equal(sam.Table.Hands["p2"], g.Table.Hands["p2"]) {
		t.Errorf("Sam's hands = %v, want p2 only", sam.Table.Hands)
	}

	decks := sam.Players[0].Decks
	if len(decks) != 2 {
		t.Fatalf("Alex's decks seen by Sam = %+v, want 2", decks)
	}
	for i, want := range []struct {
		area  Area
		count int
	}{{"p0", 1}, {"p1", 1}} {
		if decks[i].Area != want.area || decks[i].HandCount != want.count {
			t.Errorf("deck %d = %+v, want area %s with %d cards in hand", i, decks[i], want.area, want.count)
		}
	}
	if got := sam.Players[1].Decks[0]; got.Area != "p2" || got.HandCount != 2 {
		t.Errorf("Sam's deck = %+v, want p2 with 2 cards in hand", got)
	}
}

func TestPlayerReadyNeedsEverySlot(t *testing.T) {
	cat := newCatalog(t)
	g := twoSlotLobby(t)
	if err := g.SetDeck("a", 0, spiderManDeck(t, cat), cat); err != nil {
		t.Fatal(err)
	}

	p := g.ViewFor("s").Players[0]
	if p.Ready || len(p.Decks) != 2 || !p.Decks[0].Ready || p.Decks[1].Ready {
		t.Errorf("Alex with one deck of two = %+v, want not ready, slot 0 ready only", p)
	}
	if err := g.SetDeck("a", 1, spiderManDeck(t, cat), cat); err != nil {
		t.Fatal(err)
	}
	if p := g.ViewFor("s").Players[0]; !p.Ready {
		t.Errorf("Alex with both decks = %+v, want ready", p)
	}
}

func TestYouAreas(t *testing.T) {
	g := twoDeckGame(t)

	if got := g.ViewFor("a").You.Areas; !slices.Equal(got, []Area{"p0", "p1"}) {
		t.Errorf("Alex's areas = %v, want [p0 p1]", got)
	}
	if got := g.ViewFor("s").You.Areas; !slices.Equal(got, []Area{"p2"}) {
		t.Errorf("Sam's areas = %v, want [p2]", got)
	}
}

func TestSpectatorNoHands(t *testing.T) {
	g := twoDeckGame(t)
	if _, err := g.Join("w", "Watcher"); err != nil {
		t.Fatal(err)
	}

	for _, token := range []string{"w", "nobody"} {
		v := g.ViewFor(token)
		if v.Table.Hands != nil || len(v.You.Areas) != 0 {
			t.Errorf("%s: hands = %v, areas = %v; want none", token, v.Table.Hands, v.You.Areas)
		}
		if doc := mustJSON(t, v); strings.Contains(doc, `"hands"`) || strings.Contains(doc, `"areas"`) {
			t.Errorf("%s: view has a hands or areas key", token)
		}
	}
}

func TestOnlineSpectators(t *testing.T) {
	g := lobbyOfFour(t)
	for _, token := range []string{"e", "f", "g"} {
		if _, err := g.Join(token, "Spectator "+token); err != nil {
			t.Fatal(err)
		}
	}

	tests := []struct {
		name   string
		online map[string]bool
		want   int
	}{
		{"nobody online", nil, 0},
		{"players only", map[string]bool{"h": true, "b": true}, 0},
		{"some spectators", map[string]bool{"h": true, "e": true, "g": true}, 2},
		{"unknown tokens", map[string]bool{"e": true, "stranger": true}, 1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := g.OnlineSpectators(tt.online); got != tt.want {
				t.Errorf("OnlineSpectators = %d, want %d", got, tt.want)
			}
		})
	}
}

func TestLobbyView(t *testing.T) {
	g := mustNewGame(t, "g1", hostToken, "Host", testNow)
	v := g.ViewFor(hostToken)
	if v.Table != nil || v.Phase != PhaseLobby {
		t.Errorf("lobby view = phase %s, table %v", v.Phase, v.Table)
	}
	p := v.Players[0]
	if p.Ready || len(p.Decks) != 1 {
		t.Fatalf("lobby player = %+v", p)
	}
	if d := p.Decks[0]; d.Ready || d.Area != "" || d.HandCount != 0 || d.Hero != "" {
		t.Errorf("lobby deck = %+v", d)
	}
	if strings.Contains(mustJSON(t, v), `"table"`) {
		t.Error("lobby view has a table key")
	}
}

func TestCanUndoFollowsOwnStack(t *testing.T) {
	f := newViewFixture(t)
	id := f.identity(t)
	f.mustDo(t, hostToken, Action{Kind: ActExhaust, Card: id}, at(1))

	host := f.g.ViewFor(hostToken)
	if !host.CanUndo {
		t.Error("host CanUndo = false, want true")
	}
	if bob := f.g.ViewFor(bobToken); bob.CanUndo {
		t.Error("bob CanUndo = true, want false")
	}
}

func TestLogCardsFilteredToTheView(t *testing.T) {
	f := newViewFixture(t)
	f.mustDo(t, hostToken, Action{Kind: ActDraw, N: 1}, at(1))
	id := f.g.Table.Hands["p0"][0]
	f.mustDo(t, hostToken, Action{Kind: ActPlay, Card: id, X: 400, Y: 200}, at(2))
	// Back into the hand: the log line still names the card.
	f.mustDo(t, hostToken, Action{Kind: ActToHand, Card: id}, at(3))

	last := func(v View) LogView { return v.Log[len(v.Log)-2] }
	if got := last(f.g.ViewFor(hostToken)).Cards; !slices.Equal(got, []string{id}) {
		t.Errorf("host sees log cards %v, want [%s]", got, id)
	}
	if got := last(f.g.ViewFor(bobToken)).Cards; len(got) != 0 {
		t.Errorf("bob sees log cards %v", got)
	}
}

func TestViewIsDeterministic(t *testing.T) {
	f := newViewFixture(t)
	first := viewJSON(t, f.g, hostToken)
	for range 5 {
		if got := viewJSON(t, f.g, hostToken); got != first {
			t.Fatal("two views of the same game differ")
		}
	}
	cards := f.g.ViewFor(hostToken).Table.Cards
	if !slices.IsSortedFunc(cards, func(a, b CardView) int { return cmp.Compare(a.ID, b.ID) }) {
		t.Error("cards are not sorted by id")
	}
}

func TestViewDoesNotAliasTheGame(t *testing.T) {
	f := newViewFixture(t)
	v := f.g.ViewFor(hostToken)
	v.Table.Stages[0].Cards = append(v.Table.Stages[0].Cards, "x")
	v.Table.Cards[0].Tokens = map[string]int{"dmg": 9}
	if slices.Contains(f.g.Table.Stages[0].Cards, "x") {
		t.Error("the view shares stage cards with the game")
	}
	for _, c := range f.g.Table.Cards {
		if c.Tokens["dmg"] == 9 {
			t.Error("the view shares token maps with the game")
		}
	}
}

func TestIDsAreOpaque(t *testing.T) {
	table := newViewFixture(t).g.Table

	pattern := regexp.MustCompile(`^c[a-z2-9]{8}$`)
	for id := range table.Cards {
		if !pattern.MatchString(id) {
			t.Fatalf("card id %q does not look like c + 8 random characters", id)
		}
	}

	// Setup creates the encounter cards in catalog order, so ids that gave
	// the order away would sort the codes monotonically.
	ids := slices.Clone(table.Piles[PileEncounter].Cards)
	slices.Sort(ids)
	codes := make([]string, 0, len(ids))
	for _, id := range ids {
		codes = append(codes, table.Cards[id].Code)
	}
	if slices.IsSorted(codes) {
		t.Error("sorting the encounter ids sorts their codes: ids follow setup order")
	}
}

func TestShuffleRenamesCards(t *testing.T) {
	f := newViewFixture(t)
	f.mustDo(t, hostToken, Action{Kind: ActDraw, N: 1}, at(1))
	old := f.g.Table.Hands["p0"][0]
	code := f.g.Table.Cards[old].Code
	f.mustDo(t, hostToken, Action{Kind: ActDiscard, Card: old}, at(2))
	wantCodes := codesOf(f.g.Table, append(slices.Clone(f.g.Table.Piles["deck:p0"].Cards), old))

	f.mustDo(t, hostToken, Action{Kind: ActShuffleBack, Pile: "disc:p0"}, at(3))

	if _, ok := f.g.Table.Cards[old]; ok {
		t.Errorf("old id %s still exists", old)
	}
	deck := f.g.Table.Piles["deck:p0"]
	if got := codesOf(f.g.Table, deck.Cards); !slices.Equal(got, wantCodes) {
		t.Errorf("deck codes changed: %v, want %v", got, wantCodes)
	}
	if !slices.ContainsFunc(deck.Cards, func(id string) bool { return f.g.Table.Cards[id].Code == code }) {
		t.Error("the discarded card is not back in the deck")
	}
	for _, token := range []string{hostToken, bobToken, specToken} {
		if strings.Contains(viewJSON(t, f.g, token), old) {
			t.Errorf("a view still contains the old id %s", old)
		}
	}
}

func TestUndoKeepsIDsOfLaterShuffles(t *testing.T) {
	f := newViewFixture(t)
	f.mustDo(t, hostToken, Action{Kind: ActExhaust, Card: f.villain()}, at(1))
	oldDeck := slices.Clone(f.g.Table.Piles["deck:p1"].Cards)
	oldCodes := codesOf(f.g.Table, oldDeck)
	f.mustDo(t, bobToken, Action{Kind: ActShuffle, Pile: "deck:p1"}, at(2))

	f.mustDo(t, hostToken, Action{Kind: ActUndo}, at(3))

	deck := f.g.Table.Piles["deck:p1"].Cards
	if len(deck) != len(oldDeck) {
		t.Errorf("bob's deck has %d cards after the undo, want %d", len(deck), len(oldDeck))
	}
	if !slices.Equal(codesOf(f.g.Table, deck), oldCodes) {
		t.Error("bob's deck holds other codes after the undo")
	}
	for _, id := range oldDeck {
		if _, ok := f.g.Table.Cards[id]; ok {
			t.Fatalf("old id %s reappeared: %+v", id, f.g.Table.Cards[id])
		}
	}
}

func TestViewNeverEmitsNullLists(t *testing.T) {
	g := &Game{
		ID:    "g1",
		Phase: PhasePlaying,
		Table: &Table{Stages: []*Stage{{Key: "villain"}}},
	}

	data, err := json.Marshal(g.ViewFor("nobody"))
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}

	var got struct {
		Players []PlayerView `json:"players"`
		Config  struct {
			Modulars *[]string `json:"modulars"`
		} `json:"config"`
		Table struct {
			Stages []struct {
				Cards *[]string `json:"cards"`
			} `json:"stages"`
		} `json:"table"`
	}
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}
	if got.Players == nil {
		t.Errorf("players is null in %s", data)
	}
	if got.Config.Modulars == nil {
		t.Errorf("config.modulars is null in %s", data)
	}
	if len(got.Table.Stages) != 1 || got.Table.Stages[0].Cards == nil {
		t.Errorf("stage cards is null in %s", data)
	}
}
