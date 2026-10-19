package game

import (
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/alexandreroman/intothefray/internal/pack"
)

// doFixture is a started game of two Spider-Man players: "h" (Host, p0) and
// "b" (Bob, p1).
type doFixture struct {
	g   *Game
	cat *pack.Catalog
}

func newDoFixture(t *testing.T) *doFixture {
	t.Helper()
	return &doFixture{g: startedGame(t, rhinoConfig()), cat: newCatalog(t)}
}

// klawFixture is a started Klaw game of two Spider-Man players: its villain
// and main scheme both have several stages.
func klawFixture(t *testing.T) *doFixture {
	t.Helper()
	cat := newCatalog(t)
	return &doFixture{g: startedGame(t, DefaultConfig(cat, "klaw")), cat: cat}
}

func (f *doFixture) do(token string, a Action, at time.Time) error {
	return f.g.Do(token, -1, a, f.cat, at)
}

func (f *doFixture) mustDo(t *testing.T, token string, a Action, at time.Time) {
	t.Helper()
	if err := f.do(token, a, at); err != nil {
		t.Fatalf("Do(%s, %+v) = %v", token, a, err)
	}
}

// villain returns the id of the villain card on the table.
func (f *doFixture) villain() string {
	return f.g.Table.stage(pileKeyVillain).Current
}

// identity returns the id of p0's identity card.
func (f *doFixture) identity(t *testing.T) string {
	t.Helper()
	for id, c := range f.g.Table.Cards {
		if c.Zone == ZoneTable && c.Owner == 0 {
			return id
		}
	}
	t.Fatal("p0 has no identity on the table")
	return ""
}

// nameOf returns the name of the face 0 of card id.
func (f *doFixture) nameOf(t *testing.T, id string) string {
	t.Helper()
	def, _, err := f.cat.Card(f.g.Table.Cards[id].Code)
	if err != nil {
		t.Fatal(err)
	}
	return def.Faces[0].Name
}

func (f *doFixture) lastLog() LogEntry {
	return f.g.Log[len(f.g.Log)-1]
}

func (f *doFixture) logTexts() []string {
	texts := make([]string, 0, len(f.g.Log))
	for _, entry := range f.g.Log {
		texts = append(texts, entry.Text)
	}
	return texts
}

func at(seconds int) time.Time {
	return testNow.Add(time.Duration(seconds) * time.Second)
}

func TestUndoKeepsOthersChanges(t *testing.T) {
	f := newDoFixture(t)
	rhino := f.villain()

	f.mustDo(t, "h", Action{Kind: ActExhaust, Card: rhino}, at(1))
	f.mustDo(t, "b", Action{Kind: ActDraw, N: 1}, at(2))
	drawn := f.g.Table.Hands["p1"]
	f.mustDo(t, "h", Action{Kind: ActUndo}, at(3))

	if f.g.Table.Cards[rhino].Exhausted {
		t.Error("Rhino is still exhausted after undo")
	}
	if got := f.g.Table.Hands["p1"]; len(got) != 1 || !slices.Equal(got, drawn) {
		t.Errorf("p1 hand = %v, want the drawn card %v", got, drawn)
	}
	if got, want := f.lastLog().Text, "undid “exhausted Rhino”"; got != want {
		t.Errorf("last line = %q, want %q", got, want)
	}
	if got := f.lastLog(); got.Who != "Host" || got.Color != 0 {
		t.Errorf("undo line by %q colour %d, want Host colour 0", got.Who, got.Color)
	}
	if !f.g.Log[1].Undone {
		t.Errorf("line %q is not marked undone", f.g.Log[1].Text)
	}
	if f.g.Log[2].Undone {
		t.Errorf("Bob's line %q is marked undone", f.g.Log[2].Text)
	}
}

func TestTokenBurstMergesWithin15s(t *testing.T) {
	f := newDoFixture(t)
	rhino := f.villain()
	plusOne := Action{Kind: ActToken, Card: rhino, Name: "dmg", Delta: 1}
	lines := len(f.g.Log)

	f.mustDo(t, "h", plusOne, at(0))
	if got, want := f.lastLog().Text, "added 1 damage to Rhino"; got != want {
		t.Errorf("first line = %q, want %q", got, want)
	}
	f.mustDo(t, "h", plusOne, at(5))
	f.mustDo(t, "h", plusOne, at(10))

	if got := len(f.g.Log); got != lines+1 {
		t.Fatalf("burst wrote %d lines, want 1: %q", got-lines, f.logTexts())
	}
	if got, want := f.lastLog().Text, "set damage on Rhino to 3"; got != want {
		t.Errorf("merged line = %q, want %q", got, want)
	}
	burst := f.g.History.lastUndoable(0)
	if len(burst) != 3 || f.g.History.Events[burst[0]].Burst == 0 {
		t.Errorf("burst events = %v, want 3 events sharing a burst id", burst)
	}

	f.mustDo(t, "h", plusOne, at(30))
	if got := len(f.g.Log); got != lines+2 {
		t.Errorf("a change after 15 s did not start a new line: %q", f.logTexts())
	}

	f.mustDo(t, "h", Action{Kind: ActUndo}, at(31))
	if got := f.g.Table.Cards[rhino].Tokens["dmg"]; got != 3 {
		t.Errorf("dmg after the first undo = %d, want 3", got)
	}
	f.mustDo(t, "h", Action{Kind: ActUndo}, at(32))
	if got := f.g.Table.Cards[rhino].Tokens["dmg"]; got != 0 {
		t.Errorf("dmg after undoing the burst = %d, want 0", got)
	}
}

func TestMergeNeedsTheLastLine(t *testing.T) {
	f := newDoFixture(t)
	rhino := f.villain()
	plusOne := Action{Kind: ActToken, Card: rhino, Name: "dmg", Delta: 1}
	lines := len(f.g.Log)

	f.mustDo(t, "h", plusOne, at(0))
	f.mustDo(t, "b", plusOne, at(1))
	f.mustDo(t, "h", plusOne, at(2))

	if got := len(f.g.Log); got != lines+3 {
		t.Errorf("wrote %d lines, want 3 (another player's line breaks the burst): %q", got-lines, f.logTexts())
	}
}

func TestFlipBackRemovesLine(t *testing.T) {
	f := newDoFixture(t)
	identity := f.identity(t)
	lines := len(f.g.Log)

	f.mustDo(t, "h", Action{Kind: ActFlip, Card: identity}, at(0))
	if got, want := f.lastLog().Text, "flipped Peter Parker to Spider-Man"; got != want {
		t.Errorf("flip line = %q, want %q", got, want)
	}
	f.mustDo(t, "h", Action{Kind: ActFlip, Card: identity}, at(2))

	if got := len(f.g.Log); got != lines {
		t.Errorf("flipping back left lines %q", f.logTexts()[lines:])
	}
	if burst := f.g.History.lastUndoable(0); burst != nil {
		t.Errorf("flipping back left the burst %v undoable", burst)
	}
	if got := f.g.Table.Cards[identity].Face; got != 1 {
		t.Errorf("identity face = %d, want 1 (alter ego)", got)
	}
	checkHistory(t, f.g)
}

func TestMoveIsUntracked(t *testing.T) {
	f := newDoFixture(t)
	lines := len(f.g.Log)

	f.mustDo(t, "h", Action{Kind: ActMove, Card: f.villain(), X: 500, Y: 300}, at(1))

	if got := len(f.g.Log); got != lines {
		t.Errorf("move wrote lines %q", f.logTexts()[lines:])
	}
	if err := f.do("h", Action{Kind: ActUndo}, at(2)); !errors.Is(err, ErrInvalid) {
		t.Errorf("undo with nothing to undo = %v, want ErrInvalid", err)
	}
}

func TestSpectatorCannotAct(t *testing.T) {
	f := newDoFixture(t)
	if role, err := f.g.Join("s", "Sam"); err != nil || role != RoleSpectator {
		t.Fatalf("Join = %v, %v; want a spectator", role, err)
	}

	for _, token := range []string{"s", "unknown"} {
		err := f.do(token, Action{Kind: ActExhaust, Card: f.villain()}, at(1))
		if !errors.Is(err, ErrForbidden) {
			t.Errorf("Do(%q) = %v, want ErrForbidden", token, err)
		}
	}
}

func TestDoRequiresPlaying(t *testing.T) {
	g := mustNewGame(t, "g1", "h", "Host", testNow)

	err := g.Do("h", -1, Action{Kind: ActDraw, N: 1}, newCatalog(t), testNow)
	if !errors.Is(err, ErrPhase) {
		t.Errorf("Do in the lobby = %v, want ErrPhase", err)
	}
}

func TestUndoDepthCapped(t *testing.T) {
	f := newDoFixture(t)
	for i := range maxUndoDepth + 1 {
		f.mustDo(t, "h", Action{Kind: ActExhaust, Card: f.villain()}, at(i))
	}

	bursts := f.g.History.undoableBursts(0)
	if got := len(bursts); got != maxUndoDepth {
		t.Fatalf("%d undoable bursts, want %d", got, maxUndoDepth)
	}
	// The oldest burst, the first exhaust, is the one out of reach.
	if got := f.g.History.Events[bursts[len(bursts)-1][0]].Log; got != 2 {
		t.Errorf("oldest undoable burst owns line %d, want 2", got)
	}
	for i := range maxUndoDepth {
		f.mustDo(t, "h", Action{Kind: ActUndo}, at(20+i))
	}
	if err := f.do("h", Action{Kind: ActUndo}, at(40)); !errors.Is(err, ErrInvalid) {
		t.Errorf("undo beyond the depth = %v, want ErrInvalid", err)
	}
	if !f.g.Table.Cards[f.villain()].Exhausted {
		t.Error("the exhaust beyond the depth was undone")
	}
}

func TestLogTexts(t *testing.T) {
	tests := []struct {
		name string
		// run performs the actions and returns the expected last line.
		run func(t *testing.T, f *doFixture) string
	}{
		{"exhaust", func(t *testing.T, f *doFixture) string {
			f.mustDo(t, "h", Action{Kind: ActExhaust, Card: f.villain()}, at(1))
			return "exhausted Rhino"
		}},
		{"ready", func(t *testing.T, f *doFixture) string {
			f.mustDo(t, "h", Action{Kind: ActExhaust, Card: f.villain()}, at(1))
			f.mustDo(t, "h", Action{Kind: ActExhaust, Card: f.villain()}, at(2))
			return "readied Rhino"
		}},
		{"draw one", func(t *testing.T, f *doFixture) string {
			f.mustDo(t, "h", Action{Kind: ActDraw, N: 1}, at(1))
			return "drew 1 card"
		}},
		{"draw several", func(t *testing.T, f *doFixture) string {
			f.mustDo(t, "h", Action{Kind: ActDraw, N: 3}, at(1))
			return "drew 3 cards"
		}},
		{"replace the villain", func(t *testing.T, f *doFixture) string {
			stage := f.g.Table.stage(pileKeyVillain)
			f.mustDo(t, "h", Action{Kind: ActChooseStage, Stage: stage.Key, Card: stage.Cards[1]}, at(1))
			return "replaced the villain Rhino (stage I) with Rhino (stage II)"
		}},
		{"turn the main scheme", func(t *testing.T, f *doFixture) string {
			stage := f.g.Table.stage(pileKeyScheme)
			f.mustDo(t, "h", Action{Kind: ActChooseStage, Stage: stage.Key, Card: stage.Current, Face: 0}, at(1))
			return "turned the main scheme to The Break-In! (1A)"
		}},
		{"flip the main scheme", func(t *testing.T, f *doFixture) string {
			f.mustDo(t, "h", Action{Kind: ActFlip, Card: f.g.Table.stage(pileKeyScheme).Current}, at(1))
			return "flipped The Break-In! (1B) to The Break-In! (1A)"
		}},
		{"discard from hand", func(t *testing.T, f *doFixture) string {
			f.mustDo(t, "h", Action{Kind: ActDraw, N: 1}, at(1))
			card := f.g.Table.Hands["p0"][0]
			f.mustDo(t, "h", Action{Kind: ActDiscard, Card: card}, at(2))
			return "discarded " + f.nameOf(t, card) + " from hand"
		}},
		{"play", func(t *testing.T, f *doFixture) string {
			f.mustDo(t, "h", Action{Kind: ActDraw, N: 1}, at(1))
			card := f.g.Table.Hands["p0"][0]
			f.mustDo(t, "h", Action{Kind: ActPlay, Card: card, X: 400, Y: 200}, at(2))
			return "played " + f.nameOf(t, card)
		}},
		{"hand card to deck", func(t *testing.T, f *doFixture) string {
			f.mustDo(t, "h", Action{Kind: ActDraw, N: 1}, at(1))
			card := f.g.Table.Hands["p0"][0]
			f.mustDo(t, "h", Action{Kind: ActToDeck, Card: card, Where: "top"}, at(2))
			return "put a card on top of their deck"
		}},
		{"discard the encounter deck top", func(t *testing.T, f *doFixture) string {
			f.mustDo(t, "h", Action{Kind: ActDiscardTop, Pile: PileEncounter, N: 2}, at(1))
			return "discarded the top 2 cards of the encounter deck"
		}},
		{"deal", func(t *testing.T, f *doFixture) string {
			f.mustDo(t, "h", Action{Kind: ActDeal, Area: "p1", X: 400, Y: 200}, at(1))
			return "dealt an encounter card face down to Bob"
		}},
		{"shuffle back", func(t *testing.T, f *doFixture) string {
			f.mustDo(t, "b", Action{Kind: ActDiscardTop, Pile: "deck:p1", N: 1}, at(1))
			f.mustDo(t, "b", Action{Kind: ActShuffleBack, Pile: "disc:p1"}, at(2))
			return "shuffled their discard pile into their deck"
		}},
		{"undo", func(t *testing.T, f *doFixture) string {
			f.mustDo(t, "h", Action{Kind: ActDraw, N: 2}, at(1))
			f.mustDo(t, "h", Action{Kind: ActUndo}, at(2))
			return "undid “drew 2 cards”"
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := newDoFixture(t)
			want := tt.run(t, f)
			if got := f.lastLog().Text; got != want {
				t.Errorf("last line = %q, want %q", got, want)
			}
		})
	}
}

func TestLogNeverShowsHiddenCards(t *testing.T) {
	f := newDoFixture(t)

	f.mustDo(t, "h", Action{Kind: ActDraw, N: 2}, at(1))
	hand := slices.Clone(f.g.Table.Hands["p0"])
	if got := f.lastLog().Cards; len(got) != 0 {
		t.Errorf("draw line shows cards %v", got)
	}
	f.mustDo(t, "h", Action{Kind: ActToDeck, Card: hand[0], Where: "bottom"}, at(2))
	if got := f.lastLog(); len(got.Cards) != 0 || got.Text != "put a card at the bottom of their deck" {
		t.Errorf("toDeck line = %q with cards %v", got.Text, got.Cards)
	}
	f.mustDo(t, "h", Action{Kind: ActPlay, Card: hand[1], X: 400, Y: 200}, at(3))
	if got := f.lastLog().Cards; !slices.Equal(got, []string{hand[1]}) {
		t.Errorf("play line cards = %v, want %v", got, []string{hand[1]})
	}

	dealt := topCards(f.g.Table.Piles[PileEncounter], 1)[0]
	f.mustDo(t, "h", Action{Kind: ActDeal, Area: "p0", X: 600, Y: 200}, at(4))
	f.mustDo(t, "h", Action{Kind: ActToken, Card: dealt, Name: "dmg", Delta: 1}, at(5))
	if got := f.lastLog(); len(got.Cards) != 0 || got.Text != "added 1 damage to a card" {
		t.Errorf("token on a face-down card: line %q with cards %v", got.Text, got.Cards)
	}
	f.mustDo(t, "h", Action{Kind: ActExhaust, Card: dealt}, at(6))
	if got := f.lastLog(); len(got.Cards) != 0 || got.Text != "exhausted a card" {
		t.Errorf("exhaust of a face-down card: line %q with cards %v", got.Text, got.Cards)
	}

	fromDeck := topCards(f.g.Table.Piles["deck:p0"], 1)[0]
	f.mustDo(t, "h", Action{Kind: ActToHand, Card: fromDeck}, at(7))
	if got := f.lastLog(); len(got.Cards) != 0 || got.Text != "took a card from their deck into hand" {
		t.Errorf("toHand from the deck: line %q with cards %v", got.Text, got.Cards)
	}
}

func TestLookAndSearchOpenViews(t *testing.T) {
	f := newDoFixture(t)
	deck := f.g.Table.Piles["deck:p0"]
	enc := f.g.Table.Piles[PileEncounter]

	f.mustDo(t, "h", Action{Kind: ActLook, Pile: "deck:p0", N: 3}, at(1))
	view := f.g.Table.Views["p0"]
	if view == nil || view.Mode != viewModeTop || !slices.Equal(view.Cards, topCards(deck, 3)) {
		t.Errorf("look view = %+v, want the top 3 of deck:p0", view)
	}
	if got, want := f.lastLog().Text, "is looking at the top 3 cards of their deck"; got != want {
		t.Errorf("look line = %q, want %q", got, want)
	}

	f.mustDo(t, "b", Action{Kind: ActSearch, Pile: PileEncounter}, at(2))
	view = f.g.Table.Views["p1"]
	if view == nil || view.Mode != viewModeSearch || !slices.Equal(view.Cards, topCards(enc, len(enc.Cards))) {
		t.Errorf("search view = %+v, want the whole encounter deck top first", view)
	}
	if got, want := f.lastLog().Text, "is searching the encounter deck"; got != want {
		t.Errorf("search line = %q, want %q", got, want)
	}
	if got := f.lastLog().Cards; len(got) != 0 {
		t.Errorf("search line shows cards %v", got)
	}

	if err := f.do("h", Action{Kind: ActUndo}, at(3)); !errors.Is(err, ErrInvalid) {
		t.Errorf("undo after a look = %v, want ErrInvalid", err)
	}
	if err := f.do("b", Action{Kind: ActSearch, Pile: "deck:p0"}, at(4)); !errors.Is(err, ErrForbidden) {
		t.Errorf("search of another player's deck = %v, want ErrForbidden", err)
	}
	if err := f.do("h", Action{Kind: ActLook, Pile: "deck:p0", N: 0}, at(5)); !errors.Is(err, ErrInvalid) {
		t.Errorf("look at 0 cards = %v, want ErrInvalid", err)
	}
}

func TestCloseView(t *testing.T) {
	f := newDoFixture(t)
	f.mustDo(t, "h", Action{Kind: ActSearch, Pile: "deck:p0"}, at(1))
	lines := len(f.g.Log)

	f.mustDo(t, "h", Action{Kind: ActCloseView}, at(2))
	if f.g.Table.Views["p0"] != nil {
		t.Error("the view is still open")
	}
	if got := len(f.g.Log); got != lines {
		t.Errorf("closing without shuffling wrote lines %q", f.logTexts()[lines:])
	}
	if err := f.do("h", Action{Kind: ActCloseView}, at(3)); !errors.Is(err, ErrInvalid) {
		t.Errorf("closing a closed view = %v, want ErrInvalid", err)
	}
}

func TestCloseViewWithShuffleIsLoggedNotUndoable(t *testing.T) {
	f := newDoFixture(t)
	order := slices.Clone(f.g.Table.Piles["deck:p0"].Cards)
	f.mustDo(t, "h", Action{Kind: ActSearch, Pile: "deck:p0"}, at(1))

	f.mustDo(t, "h", Action{Kind: ActCloseView, Where: whereShuffle}, at(2))

	if f.g.Table.Views["p0"] != nil {
		t.Error("the view is still open")
	}
	shuffledOrder := f.g.Table.Piles["deck:p0"].Cards
	if len(shuffledOrder) != len(order) || slices.ContainsFunc(shuffledOrder, func(id string) bool { return slices.Contains(order, id) }) {
		t.Errorf("deck %v keeps ids of %v", shuffledOrder, order)
	}
	if got, want := f.lastLog().Text, "shuffled their deck"; got != want {
		t.Errorf("shuffle line = %q, want %q", got, want)
	}

	if err := f.do("h", Action{Kind: ActUndo}, at(3)); !errors.Is(err, ErrInvalid) {
		t.Errorf("undo of a shuffle = %v, want ErrInvalid (nothing to undo)", err)
	}
}

func TestUndoKeepsOpenViews(t *testing.T) {
	f := newDoFixture(t)
	f.mustDo(t, "h", Action{Kind: ActExhaust, Card: f.villain()}, at(1))
	f.mustDo(t, "b", Action{Kind: ActSearch, Pile: "deck:p1"}, at(2))

	f.mustDo(t, "h", Action{Kind: ActUndo}, at(3))

	if f.g.Table.Views["p1"] == nil {
		t.Error("Host's undo closed Bob's search")
	}
}

func TestDoLeavesGameUnchangedOnError(t *testing.T) {
	f := newDoFixture(t)
	f.mustDo(t, "h", Action{Kind: ActExhaust, Card: f.villain()}, at(1))

	tests := []struct {
		name  string
		token string
		a     Action
	}{
		{"draw too many", "h", Action{Kind: ActDraw, N: 99}},
		{"unknown card", "h", Action{Kind: ActExhaust, Card: "c9999"}},
		{"another player's deck", "b", Action{Kind: ActShuffle, Pile: "deck:p0"}},
		{"look at another player's deck", "h", Action{Kind: ActLook, Pile: "deck:p1", N: 1}},
		{"undo with an empty stack", "b", Action{Kind: ActUndo}},
		{"close a view that is not open", "h", Action{Kind: ActCloseView, Where: whereShuffle}},
		{"unknown kind", "h", Action{Kind: "teleport"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			before := mustJSON(t, f.g)
			if err := f.do(tt.token, tt.a, at(2)); err == nil {
				t.Fatal("Do succeeded, want an error")
			}
			if after := mustJSON(t, f.g); after != before {
				t.Error("the failed action changed the game")
			}
		})
	}
}

func mustJSON(t *testing.T, v any) string {
	t.Helper()
	data, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return string(data)
}

// TestRebuildRevealsTheRecordedCard undoes a discard that took the card above
// the one Bob revealed since: the rebuild reveals Bob's card again, from under
// the card Host put back, and never the card now on top.
func TestRebuildRevealsTheRecordedCard(t *testing.T) {
	f := newDoFixture(t)
	discarded := topCards(f.g.Table.Piles[PileEncounter], 1)[0]
	f.mustDo(t, "h", Action{Kind: ActDiscardTop, Pile: PileEncounter, N: 1}, at(1))
	revealed := topCards(f.g.Table.Piles[PileEncounter], 1)[0]
	f.mustDo(t, "b", Action{Kind: ActReveal}, at(2))

	f.mustDo(t, "h", Action{Kind: ActUndo}, at(3))

	if got := f.g.Table.revealed(); len(got) != 1 || got[0].ID != revealed {
		t.Errorf("revealed after undo = %v, want Bob's card %s", got, revealed)
	}
	if got := topCards(f.g.Table.Piles[PileEncounter], 1)[0]; got != discarded {
		t.Errorf("encounter top after undo = %s, want the card put back (%s)", got, discarded)
	}
	checkIntegrity(t, f.g.Table)
	checkHistory(t, f.g)
}

func TestOlderUndoReshufflesPilesShuffledSince(t *testing.T) {
	f := newDoFixture(t)
	f.mustDo(t, "h", Action{Kind: ActExhaust, Card: f.villain()}, at(1))
	f.mustDo(t, "h", Action{Kind: ActSearch, Pile: "deck:p0"}, at(2))
	seen := slices.Clone(f.g.Table.Piles["deck:p0"].Cards)
	f.mustDo(t, "h", Action{Kind: ActCloseView, Where: whereShuffle}, at(3))

	f.mustDo(t, "h", Action{Kind: ActUndo}, at(4))

	if f.g.Table.Cards[f.villain()].Exhausted {
		t.Error("the exhaust was not undone")
	}
	got := f.g.Table.Piles["deck:p0"].Cards
	if len(got) != len(seen) || slices.ContainsFunc(got, func(id string) bool { return slices.Contains(seen, id) }) {
		t.Errorf("deck after undo = %v, want new ids for %v", got, seen)
	}
}

// TestOlderUndoReshufflesPileChangedBeforeShuffle undoes a card put on top of
// the deck before a shuffle: the recorded shuffle no longer fits, so the deck
// is shuffled again, with ids that neither the deck before the shuffle nor the
// shuffled deck had.
func TestOlderUndoReshufflesPileChangedBeforeShuffle(t *testing.T) {
	f := newDoFixture(t)
	f.mustDo(t, "h", Action{Kind: ActDraw, N: 1}, at(1))
	card := f.g.Table.Hands["p0"][0]
	f.mustDo(t, "h", Action{Kind: ActToDeck, Card: card, Where: whereTop}, at(2))
	seen := slices.Clone(f.g.Table.Piles["deck:p0"].Cards)
	f.mustDo(t, "h", Action{Kind: ActShuffle, Pile: "deck:p0"}, at(3))
	shuffled := slices.Clone(f.g.Table.Piles["deck:p0"].Cards)

	f.mustDo(t, "h", Action{Kind: ActUndo}, at(4))

	got := f.g.Table.Piles["deck:p0"].Cards
	if len(got) != len(seen)-1 {
		t.Errorf("deck holds %d cards, want %d", len(got), len(seen)-1)
	}
	for _, id := range got {
		if slices.Contains(seen, id) || slices.Contains(shuffled, id) {
			t.Errorf("deck card %s keeps an id from before the undo", id)
		}
	}
	if hand := f.g.Table.Hands["p0"]; !slices.Equal(hand, []string{card}) {
		t.Errorf("hand = %v, want the card back [%s]", hand, card)
	}
	checkIntegrity(t, f.g.Table)
	checkHistory(t, f.g)
}

func TestUndoKeepsOwnUntrackedActions(t *testing.T) {
	f := newDoFixture(t)
	rhino := f.villain()
	f.mustDo(t, "h", Action{Kind: ActExhaust, Card: rhino}, at(1))
	f.mustDo(t, "h", Action{Kind: ActMove, Card: rhino, X: 500, Y: 300}, at(2))

	f.mustDo(t, "h", Action{Kind: ActUndo}, at(3))

	c := f.g.Table.Cards[rhino]
	if c.Exhausted {
		t.Error("the exhaust was not undone")
	}
	if c.X != 500 || c.Y != 300 {
		t.Errorf("Rhino at (%d,%d) after undo, want the moved position (500,300)", c.X, c.Y)
	}
}

// TestUndoOfDealPutsTheRevealedCardBack undoes a deal of a revealed card:
// the deal moved it, so it goes back where it was, even though it lies on the
// table both before and after.
func TestUndoOfDealPutsTheRevealedCardBack(t *testing.T) {
	f := newDoFixture(t)
	f.mustDo(t, "h", Action{Kind: ActReveal}, at(1))
	revealed := *f.g.Table.revealed()[0]
	f.mustDo(t, "b", Action{Kind: ActDeal, Area: "p1", X: 400, Y: 200}, at(2))

	f.mustDo(t, "b", Action{Kind: ActUndo}, at(3))

	c := f.g.Table.Cards[revealed.ID]
	if c.X != revealed.X || c.Y != revealed.Y || c.OnPile != PileEncounter || c.FaceDown {
		t.Errorf("card = %+v, want it revealed again on the encounter deck at (%d,%d)", c, revealed.X, revealed.Y)
	}
	checkIntegrity(t, f.g.Table)
}

// TestUndoOnSharedPileLosesNoCard is the repro of a card lost by patching a
// snapshot whose pile differs from the live one: Bob discards the encounter
// top, Host reveals the next card, then both undo.
func TestUndoOnSharedPileLosesNoCard(t *testing.T) {
	f := newDoFixture(t)
	order := slices.Clone(f.g.Table.Piles[PileEncounter].Cards)

	f.mustDo(t, "b", Action{Kind: ActDiscardTop, Pile: PileEncounter, N: 1}, at(1))
	f.mustDo(t, "h", Action{Kind: ActReveal}, at(2))
	f.mustDo(t, "h", Action{Kind: ActUndo}, at(3))
	checkHistory(t, f.g)
	f.mustDo(t, "b", Action{Kind: ActUndo}, at(4))

	checkIntegrity(t, f.g.Table)
	if got := f.g.Table.Piles[PileEncounter].Cards; !slices.Equal(got, order) {
		t.Errorf("encounter deck = %v, want it back as it started: %v", got, order)
	}
	if got := f.g.Table.Piles[PileEncounterDiscard].Cards; len(got) != 0 {
		t.Errorf("encounter discard = %v, want empty", got)
	}
	if got := f.g.Table.revealed(); len(got) != 0 {
		t.Errorf("revealed = %v, want none", got)
	}
}

func TestTwoUndosEachRevertTheirOwn(t *testing.T) {
	f := newDoFixture(t)
	rhino := f.villain()
	deck := slices.Clone(f.g.Table.Piles["deck:p1"].Cards)

	f.mustDo(t, "b", Action{Kind: ActDraw, N: 2}, at(1))
	f.mustDo(t, "h", Action{Kind: ActExhaust, Card: rhino}, at(2))
	f.mustDo(t, "h", Action{Kind: ActUndo}, at(3))
	f.mustDo(t, "b", Action{Kind: ActUndo}, at(4))

	if f.g.Table.Cards[rhino].Exhausted {
		t.Error("Bob's undo brought back Host's undone exhaust")
	}
	if got := f.g.Table.Hands["p1"]; len(got) != 0 {
		t.Errorf("p1 hand = %v, want empty", got)
	}
	if got := f.g.Table.Piles["deck:p1"].Cards; !slices.Equal(got, deck) {
		t.Errorf("deck:p1 = %v, want the drawn cards back on top: %v", got, deck)
	}
	checkIntegrity(t, f.g.Table)
	checkHistory(t, f.g)
}

// TestUndoKeepsOthersChangesToTheSameCard has Bob and Host change the same
// card: Host's undo must not hide Bob's change from Bob's own undo.
func TestUndoKeepsOthersChangesToTheSameCard(t *testing.T) {
	f := newDoFixture(t)
	rhino := f.villain()

	f.mustDo(t, "b", Action{Kind: ActToken, Card: rhino, Name: "dmg", Delta: 1}, at(1))
	f.mustDo(t, "h", Action{Kind: ActExhaust, Card: rhino}, at(2))
	f.mustDo(t, "h", Action{Kind: ActUndo}, at(3))
	f.mustDo(t, "b", Action{Kind: ActUndo}, at(4))

	c := f.g.Table.Cards[rhino]
	if c.Tokens["dmg"] != 0 || c.Exhausted {
		t.Errorf("Rhino has %d damage, exhausted %t; want no damage and ready", c.Tokens["dmg"], c.Exhausted)
	}
	checkIntegrity(t, f.g.Table)
}

func TestUndoKeepsLiveArrangement(t *testing.T) {
	f := newDoFixture(t)
	rhino := f.villain()
	bobIdentity := ""
	for id, c := range f.g.Table.Cards {
		if c.Zone == ZoneTable && c.Owner == 1 {
			bobIdentity = id
		}
	}
	f.mustDo(t, "b", Action{Kind: ActDraw, N: 3}, at(1))
	f.mustDo(t, "h", Action{Kind: ActExhaust, Card: rhino}, at(2))
	f.mustDo(t, "b", Action{Kind: ActMove, Card: bobIdentity, X: 700, Y: 400}, at(3))
	order := slices.Clone(f.g.Table.Hands["p1"])
	slices.Reverse(order)
	f.mustDo(t, "b", Action{Kind: ActHandOrder, Area: "p1", Cards: order}, at(4))

	f.mustDo(t, "h", Action{Kind: ActUndo}, at(5))

	if f.g.Table.Cards[rhino].Exhausted {
		t.Error("Rhino is still exhausted")
	}
	if c := f.g.Table.Cards[bobIdentity]; c.X != 700 || c.Y != 400 {
		t.Errorf("Bob's identity at (%d,%d), want where Bob put it (700,400)", c.X, c.Y)
	}
	if got := f.g.Table.Hands["p1"]; !slices.Equal(got, order) {
		t.Errorf("p1 hand = %v, want Bob's order %v", got, order)
	}
	checkIntegrity(t, f.g.Table)
	checkHistory(t, f.g)
}

func TestUndoKeepsReorderedPile(t *testing.T) {
	f := newDoFixture(t)
	f.mustDo(t, "h", Action{Kind: ActExhaust, Card: f.villain()}, at(1))
	top := topCards(f.g.Table.Piles["deck:p0"], 3)
	slices.Reverse(top)
	f.mustDo(t, "h", Action{Kind: ActReorderTop, Pile: "deck:p0", Cards: top}, at(2))
	reordered := slices.Clone(f.g.Table.Piles["deck:p0"].Cards)

	f.mustDo(t, "h", Action{Kind: ActUndo}, at(3))

	if got := f.g.Table.Piles["deck:p0"].Cards; !slices.Equal(got, reordered) {
		t.Errorf("deck:p0 = %v, want the reordered %v", got, reordered)
	}
}

// TestUndoOfStageChangeKeepsAttachmentsRight replaces the villain carrying an
// attachment, then undoes: the attachment goes back under the first villain.
func TestUndoOfStageChangeKeepsAttachmentsRight(t *testing.T) {
	f := newDoFixture(t)
	stage := f.g.Table.stage(pileKeyVillain)
	rhino, identity := stage.Current, f.identity(t)
	f.mustDo(t, "h", Action{Kind: ActAttach, Card: identity, Target: rhino}, at(1))
	f.mustDo(t, "h", Action{Kind: ActChooseStage, Stage: stage.Key, Card: stage.Cards[1]}, at(2))

	f.mustDo(t, "h", Action{Kind: ActUndo}, at(3))

	if got := f.g.Table.Cards[identity].Parent; got != rhino {
		t.Errorf("identity parent = %q, want the first villain %q", got, rhino)
	}
	checkIntegrity(t, f.g.Table)
}

func TestNoOpActionsAreNotTracked(t *testing.T) {
	tests := []struct {
		name string
		a    func(f *doFixture) Action
	}{
		{"remove a missing token", func(f *doFixture) Action {
			return Action{Kind: ActToken, Card: f.villain(), Name: "dmg", Delta: -1}
		}},
		{"remove a missing status", func(f *doFixture) Action {
			return Action{Kind: ActStatus, Card: f.villain(), Name: "tough", Delta: -2}
		}},
		{"flip a single-faced card", func(f *doFixture) Action {
			return Action{Kind: ActFlip, Card: f.villain()}
		}},
		{"choose the stage already shown", func(f *doFixture) Action {
			stage := f.g.Table.stage(pileKeyScheme)
			return Action{Kind: ActChooseStage, Stage: stage.Key, Card: stage.Current, Face: 1}
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := newDoFixture(t)
			lines := len(f.g.Log)
			f.mustDo(t, "h", tt.a(f), at(1))
			if got := len(f.g.Log); got != lines {
				t.Errorf("a no-op wrote lines %q", f.logTexts()[lines:])
			}
			if got := len(f.g.History.Events); got != 0 {
				t.Errorf("a no-op recorded %d events", got)
			}
		})
	}
}

func TestSearchPublicPiles(t *testing.T) {
	f := newDoFixture(t)
	f.mustDo(t, "h", Action{Kind: ActDiscardTop, Pile: "deck:p0", N: 1}, at(1))

	for _, pile := range []string{"disc:p0", "aside:p0"} {
		if err := f.do("b", Action{Kind: ActSearch, Pile: pile}, at(2)); err != nil {
			t.Errorf("Bob searching %s = %v, want allowed", pile, err)
		}
	}
	if got, want := f.lastLog().Text, "is searching Host's set-aside cards"; got != want {
		t.Errorf("search line = %q, want %q", got, want)
	}
	for _, a := range []Action{{Kind: ActSearch, Pile: "deck:p0"}, {Kind: ActLook, Pile: "deck:p0", N: 1}} {
		if err := f.do("b", a, at(3)); !errors.Is(err, ErrForbidden) {
			t.Errorf("Bob doing %s on deck:p0 = %v, want ErrForbidden", a.Kind, err)
		}
	}
}

// TestShuffleActionsThroughDo runs every shuffle-producing action end to end:
// each must be logged as a shuffle and leave no old id behind.
func TestShuffleActionsThroughDo(t *testing.T) {
	tests := []struct {
		name  string
		setup func(t *testing.T, f *doFixture) (pile string, old []string)
		act   Action
	}{
		{
			"shuffle",
			func(_ *testing.T, _ *doFixture) (string, []string) { return "deck:p0", nil },
			Action{Kind: ActShuffle, Pile: "deck:p0"},
		},
		{
			"shuffleBack",
			func(t *testing.T, f *doFixture) (string, []string) {
				f.mustDo(t, "h", Action{Kind: ActDraw, N: 1}, at(1))
				f.mustDo(t, "h", Action{Kind: ActDiscard, Card: f.g.Table.Hands["p0"][0]}, at(2))
				return "deck:p0", slices.Clone(f.g.Table.Piles["disc:p0"].Cards)
			},
			Action{Kind: ActShuffleBack, Pile: "disc:p0"},
		},
		{
			"shuffleIn",
			func(t *testing.T, f *doFixture) (string, []string) {
				f.mustDo(t, "h", Action{Kind: ActReveal}, at(1))
				id := f.g.Table.revealed()[0].ID
				f.mustDo(t, "h", Action{Kind: ActToPile, Card: id, Target: PileScenarioAside}, at(2))
				return PileEncounter, []string{id}
			},
			Action{Kind: ActShuffleIn, Pile: PileScenarioAside},
		},
		{
			"toDeck shuffle",
			func(t *testing.T, f *doFixture) (string, []string) {
				f.mustDo(t, "h", Action{Kind: ActDraw, N: 1}, at(1))
				id := f.g.Table.Hands["p0"][0]
				return "deck:p0", []string{id}
			},
			Action{Kind: ActToDeck, Where: whereShuffle},
		},
		{
			"closeView shuffle",
			func(t *testing.T, f *doFixture) (string, []string) {
				f.mustDo(t, "h", Action{Kind: ActSearch, Pile: "deck:p0"}, at(1))
				return "deck:p0", nil
			},
			Action{Kind: ActCloseView, Where: whereShuffle},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := newDoFixture(t)
			pile, extra := tt.setup(t, f)
			if tt.act.Kind == ActToDeck {
				tt.act.Card = extra[0]
			}
			old := append(slices.Clone(f.g.Table.Piles[pile].Cards), extra...)

			f.mustDo(t, "h", tt.act, at(10))

			if got := f.lastLog().Text; !strings.HasPrefix(got, "shuffled ") {
				t.Errorf("log line = %q, want a shuffle", got)
			}
			for _, id := range old {
				if _, ok := f.g.Table.Cards[id]; ok {
					t.Errorf("old id %s still exists", id)
				}
			}
			if got, want := len(f.g.Table.Piles[pile].Cards), len(old); got < want-len(extra) || got > want {
				t.Errorf("pile %s has %d cards, from %d", pile, got, want)
			}
		})
	}
}

func TestPlayFromPileThroughDo(t *testing.T) {
	tests := []struct {
		name  string
		token string
		// card prepares the table and returns the card to play.
		card func(t *testing.T, f *doFixture) string
		want error // nil = allowed
	}{
		{"own set-aside pile", "h", func(t *testing.T, f *doFixture) string {
			id := topCards(f.g.Table.Piles["deck:p0"], 1)[0]
			f.mustDo(t, "h", Action{Kind: ActToPile, Card: id, Target: "aside:p0"}, at(1))
			return id
		}, nil},
		{"encounter discard pile", "b", func(t *testing.T, f *doFixture) string {
			f.mustDo(t, "h", Action{Kind: ActDiscardTop, Pile: PileEncounter, N: 1}, at(1))
			return topCards(f.g.Table.Piles[PileEncounterDiscard], 1)[0]
		}, nil},
		{"own deck", "h", func(_ *testing.T, f *doFixture) string {
			return f.g.Table.Piles["deck:p0"].Cards[3]
		}, nil},
		{"another player's deck", "b", func(_ *testing.T, f *doFixture) string {
			return f.g.Table.Piles["deck:p0"].Cards[3]
		}, ErrForbidden},
		{"another player's set-aside pile", "b", func(t *testing.T, f *doFixture) string {
			id := topCards(f.g.Table.Piles["deck:p0"], 1)[0]
			f.mustDo(t, "h", Action{Kind: ActToPile, Card: id, Target: "aside:p0"}, at(1))
			return id
		}, ErrForbidden},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := newDoFixture(t)
			id := tt.card(t, f)
			lines := len(f.g.Log)

			err := f.do(tt.token, Action{Kind: ActPlay, Card: id, X: 400, Y: 200}, at(5))

			if tt.want != nil {
				if !errors.Is(err, tt.want) {
					t.Errorf("play = %v, want %v", err, tt.want)
				}
				return
			}
			if err != nil {
				t.Fatalf("play = %v, want allowed", err)
			}
			c := f.g.Table.Cards[id]
			if c.Zone != ZoneTable || c.FaceDown || c.X != 400 || c.Y != 200 {
				t.Errorf("played card = %+v, want face up on the table at (400,200)", c)
			}
			if got := len(f.g.Log); got != lines+1 {
				t.Fatalf("play wrote %d lines, want 1", got-lines)
			}
			if got, want := f.lastLog().Text, "played "+f.nameOf(t, id); got != want {
				t.Errorf("line = %q, want %q", got, want)
			}
			if got := f.lastLog().Cards; !slices.Equal(got, []string{id}) {
				t.Errorf("line cards = %v, want [%s]", got, id)
			}
			checkIntegrity(t, f.g.Table)
		})
	}
}

func TestPlayUnderACardIsOneUndoableStep(t *testing.T) {
	f := newDoFixture(t)
	hero := f.identity(t)
	f.mustDo(t, "h", Action{Kind: ActDraw, N: 1}, at(1))
	card := f.g.Table.Hands["p0"][0]
	lines := len(f.g.Log)

	f.mustDo(t, "h", Action{Kind: ActPlay, Card: card, Target: hero}, at(5))

	c := f.g.Table.Cards[card]
	if c.Zone != ZoneTable || c.Parent != hero {
		t.Fatalf("played card = %+v, want tucked under %s", c, hero)
	}
	if got := len(f.g.Log); got != lines+1 {
		t.Fatalf("play wrote %d lines, want 1", got-lines)
	}
	// The hero is named by the face it shows.
	def, _, err := f.cat.Card(f.g.Table.Cards[hero].Code)
	if err != nil {
		t.Fatal(err)
	}
	heroName := def.Faces[f.g.Table.Cards[hero].Face].Name
	want := fmt.Sprintf("played %s under %s", f.nameOf(t, card), heroName)
	if got := f.lastLog().Text; got != want {
		t.Errorf("line = %q, want %q", got, want)
	}
	if got := f.lastLog().Cards; !slices.Equal(got, []string{card, hero}) {
		t.Errorf("line cards = %v, want [%s %s]", got, card, hero)
	}
	checkIntegrity(t, f.g.Table)

	f.mustDo(t, "h", Action{Kind: ActUndo}, at(6))

	c = f.g.Table.Cards[card]
	if c.Zone != ZoneHand || c.Parent != "" || !slices.Contains(f.g.Table.Hands["p0"], card) {
		t.Errorf("after undo = %+v, want back in the hand, tucked under nothing", c)
	}
	checkIntegrity(t, f.g.Table)
}

func TestPlayUnderACardReplays(t *testing.T) {
	f := newDoFixture(t)
	hero := f.identity(t)
	f.mustDo(t, "h", Action{Kind: ActDraw, N: 2}, at(1))
	hand := slices.Clone(f.g.Table.Hands["p0"])
	f.mustDo(t, "h", Action{Kind: ActPlay, Card: hand[0], Target: hero}, at(2))
	f.mustDo(t, "h", Action{Kind: ActPlay, Card: hand[1], Target: hand[0]}, at(3))
	setup, err := f.g.ReplaySetup()
	if err != nil {
		t.Fatal(err)
	}

	replayed, err := Replay(f.cat, setup, f.g.History.Events)
	if err != nil {
		t.Fatal(err)
	}

	if got, want := mustJSON(t, replayed.Table), mustJSON(t, f.g.Table); got != want {
		t.Errorf("replayed table differs:\n got %s\nwant %s", got, want)
	}
}

func TestPlayUnderAnotherPlayersHandCardIsForbidden(t *testing.T) {
	f := newDoFixture(t)
	f.mustDo(t, "h", Action{Kind: ActDraw, N: 1}, at(1))
	f.mustDo(t, "b", Action{Kind: ActDraw, N: 1}, at(2))
	theirs := f.g.Table.Hands["p0"][0]

	err := f.do("b", Action{Kind: ActPlay, Card: f.g.Table.Hands["p1"][0], Target: theirs}, at(3))

	if !errors.Is(err, ErrForbidden) {
		t.Errorf("play = %v, want ErrForbidden", err)
	}
}

// TestAttachThenDiscardSurvivesAnotherUndo is a reviewer repro: Host tucks a
// card under another and discards the pair after Bob's exhaust; Bob's undo
// must leave both cards discarded.
func TestAttachThenDiscardSurvivesAnotherUndo(t *testing.T) {
	f := newDoFixture(t)
	f.mustDo(t, "h", Action{Kind: ActDraw, N: 2}, at(1))
	hand := slices.Clone(f.g.Table.Hands["p0"])
	parent, child := hand[0], hand[1]
	f.mustDo(t, "h", Action{Kind: ActPlay, Card: parent, X: 400, Y: 200}, at(30))
	f.mustDo(t, "h", Action{Kind: ActPlay, Card: child, X: 500, Y: 200}, at(60))
	f.mustDo(t, "b", Action{Kind: ActExhaust, Card: f.villain()}, at(90))
	f.mustDo(t, "h", Action{Kind: ActAttach, Card: child, Target: parent}, at(91))
	f.mustDo(t, "h", Action{Kind: ActDiscard, Card: parent}, at(92))

	f.mustDo(t, "b", Action{Kind: ActUndo}, at(93))

	for _, id := range []string{parent, child} {
		if c := f.g.Table.Cards[id]; c.Zone != ZonePile || c.Pile != "disc:p0" {
			t.Errorf("card %s is in %s %s after Bob's undo, want disc:p0", id, c.Zone, c.Pile)
		}
	}
	if f.g.Table.Cards[f.villain()].Exhausted {
		t.Error("Bob's exhaust was not undone")
	}
	checkIntegrity(t, f.g.Table)
	checkHistory(t, f.g)
}

// TestReorderThenDrawSurvivesAnotherUndo is a reviewer repro: Host reorders
// the top of his deck and draws after Bob's exhaust; Bob's undo must leave the
// drawn card in Host's hand.
func TestReorderThenDrawSurvivesAnotherUndo(t *testing.T) {
	f := newDoFixture(t)
	f.mustDo(t, "b", Action{Kind: ActExhaust, Card: f.villain()}, at(1))
	top := topCards(f.g.Table.Piles["deck:p0"], 3)
	slices.Reverse(top)
	f.mustDo(t, "h", Action{Kind: ActReorderTop, Pile: "deck:p0", Cards: top}, at(2))
	f.mustDo(t, "h", Action{Kind: ActDraw, N: 1}, at(3))
	drawn := slices.Clone(f.g.Table.Hands["p0"])
	deck := slices.Clone(f.g.Table.Piles["deck:p0"].Cards)

	f.mustDo(t, "b", Action{Kind: ActUndo}, at(4))

	if got := f.g.Table.Hands["p0"]; !slices.Equal(got, drawn) {
		t.Errorf("Host's hand = %v after Bob's undo, want the drawn %v", got, drawn)
	}
	if got := f.g.Table.Piles["deck:p0"].Cards; !slices.Equal(got, deck) {
		t.Errorf("Host's deck = %v, want the reordered rest %v", got, deck)
	}
	checkIntegrity(t, f.g.Table)
	checkHistory(t, f.g)
}

func TestPlayFromDeckIsNarratedAndSurvivesAnotherUndo(t *testing.T) {
	f := newDoFixture(t)
	top := topCards(f.g.Table.Piles["deck:p0"], 1)[0]
	f.mustDo(t, "b", Action{Kind: ActExhaust, Card: f.villain()}, at(1))
	f.mustDo(t, "h", Action{Kind: ActPlay, Pile: "deck:p0", X: 400, Y: 200}, at(2))

	if got, want := f.lastLog().Text, "played "+f.nameOf(t, top); got != want {
		t.Errorf("last line = %q, want %q", got, want)
	}
	if got := f.lastLog().Cards; !slices.Equal(got, []string{top}) {
		t.Errorf("play line cards = %v, want %v", got, []string{top})
	}

	f.mustDo(t, "b", Action{Kind: ActUndo}, at(3))

	if c := f.g.Table.Cards[top]; c.Zone != ZoneTable || c.FaceDown || c.X != 400 || c.Y != 200 {
		t.Errorf("played card = %+v after Bob's undo, want it face up at 400, 200", c)
	}
	checkIntegrity(t, f.g.Table)
	checkHistory(t, f.g)
}

// TestTwoRevealsSurviveAnotherUndo is a reviewer repro: Host reveals, moves
// the revealed card away and reveals again after Bob's exhaust; Bob's undo
// must leave both revealed cards on the table.
func TestTwoRevealsSurviveAnotherUndo(t *testing.T) {
	f := newDoFixture(t)
	f.mustDo(t, "b", Action{Kind: ActExhaust, Card: f.villain()}, at(1))
	f.mustDo(t, "h", Action{Kind: ActReveal}, at(2))
	first := f.g.Table.revealed()[0].ID
	f.mustDo(t, "h", Action{Kind: ActMove, Card: first, X: 600, Y: 300}, at(3))
	f.mustDo(t, "h", Action{Kind: ActReveal}, at(4))
	second := f.g.Table.revealed()[0].ID

	f.mustDo(t, "b", Action{Kind: ActUndo}, at(5))

	if c := f.g.Table.Cards[first]; c.Zone != ZoneTable || c.X != 600 || c.Y != 300 {
		t.Errorf("first revealed card = %+v, want it where Host moved it", c)
	}
	if got := f.g.Table.revealed(); len(got) != 1 || got[0].ID != second {
		t.Errorf("revealed = %v, want the second card %s", got, second)
	}
	checkIntegrity(t, f.g.Table)
	checkHistory(t, f.g)
}

// TestStagesEndWhereTheirOwnersLeftThem is the Klaw repro: Host changes the
// villain stage, Bob the main scheme stage, then each undoes.
func TestStagesEndWhereTheirOwnersLeftThem(t *testing.T) {
	f := klawFixture(t)
	villain, scheme := f.g.Table.stage(pileKeyVillain), f.g.Table.stage(pileKeyScheme)
	if len(villain.Cards) < 2 || len(scheme.Cards) < 2 {
		t.Fatalf("Klaw stages hold %d and %d cards, want several", len(villain.Cards), len(scheme.Cards))
	}
	firstVillain, firstScheme := villain.Current, scheme.Current
	nextVillain, nextScheme := villain.Cards[1], scheme.Cards[1]
	f.mustDo(t, "h", Action{Kind: ActChooseStage, Stage: villain.Key, Card: nextVillain}, at(1))
	f.mustDo(t, "b", Action{Kind: ActChooseStage, Stage: scheme.Key, Card: nextScheme}, at(2))

	f.mustDo(t, "h", Action{Kind: ActUndo}, at(3))
	if got := f.g.Table.stage(pileKeyVillain).Current; got != firstVillain {
		t.Errorf("villain after Host's undo = %s, want %s", got, firstVillain)
	}
	if got := f.g.Table.stage(pileKeyScheme).Current; got != nextScheme {
		t.Errorf("scheme after Host's undo = %s, want Bob's %s", got, nextScheme)
	}
	checkIntegrity(t, f.g.Table)

	f.mustDo(t, "b", Action{Kind: ActUndo}, at(4))
	if got := f.g.Table.stage(pileKeyScheme).Current; got != firstScheme {
		t.Errorf("scheme after Bob's undo = %s, want %s", got, firstScheme)
	}
	if got := f.g.Table.stage(pileKeyVillain).Current; got != firstVillain {
		t.Errorf("villain after Bob's undo = %s, want %s", got, firstVillain)
	}
	checkIntegrity(t, f.g.Table)
	checkHistory(t, f.g)
}

// TestUndoAfterReshuffleKeepsLaterActions undoes twice around a shuffle, with
// Bob revealing in between: his reveal must survive Host's second undo.
func TestUndoAfterReshuffleKeepsLaterActions(t *testing.T) {
	f := newDoFixture(t)
	f.mustDo(t, "h", Action{Kind: ActExhaust, Card: f.villain()}, at(1))
	f.mustDo(t, "h", Action{Kind: ActExhaust, Card: f.identity(t)}, at(20))
	f.mustDo(t, "h", Action{Kind: ActShuffle, Pile: PileEncounter}, at(40))
	f.mustDo(t, "h", Action{Kind: ActUndo}, at(41))
	f.mustDo(t, "b", Action{Kind: ActReveal}, at(42))
	revealed := f.g.Table.revealed()[0].ID

	f.mustDo(t, "h", Action{Kind: ActUndo}, at(43))

	if f.g.Table.Cards[f.villain()].Exhausted {
		t.Error("the villain is still exhausted")
	}
	if got := f.g.Table.revealed(); len(got) != 1 || got[0].ID != revealed {
		t.Errorf("revealed = %v, want Bob's card %s", got, revealed)
	}
	checkIntegrity(t, f.g.Table)
	checkHistory(t, f.g)
}

// TestUndoDropsWhatNoLongerApplies undoes the play of a card that Bob has
// exhausted since: Bob's exhaust cannot apply any more, so it is dropped, and
// Bob has nothing left to undo.
func TestUndoDropsWhatNoLongerApplies(t *testing.T) {
	f := newDoFixture(t)
	f.mustDo(t, "h", Action{Kind: ActDraw, N: 1}, at(1))
	card := f.g.Table.Hands["p0"][0]
	f.mustDo(t, "h", Action{Kind: ActPlay, Card: card, X: 400, Y: 200}, at(30))
	f.mustDo(t, "b", Action{Kind: ActExhaust, Card: card}, at(31))

	f.mustDo(t, "h", Action{Kind: ActUndo}, at(32))

	if c := f.g.Table.Cards[card]; c.Zone != ZoneHand || c.Exhausted {
		t.Errorf("card = %+v, want it back in hand, ready", c)
	}
	exhaust := f.g.History.Events[2]
	if exhaust.Action.Kind != ActExhaust || !exhaust.Dropped {
		t.Errorf("event 2 = %+v, want Bob's exhaust, dropped", exhaust)
	}
	if line := f.g.Log[exhaust.Log]; !line.Undone {
		t.Errorf("Bob's line %q is not struck, though its action was dropped", line.Text)
	}
	if err := f.do("b", Action{Kind: ActUndo}, at(33)); !errors.Is(err, ErrInvalid) {
		t.Errorf("Bob's undo = %v, want ErrInvalid: his only action was dropped", err)
	}
	checkIntegrity(t, f.g.Table)
	checkHistory(t, f.g)
}

func TestMoveReplacesTheSamePlayersLastMove(t *testing.T) {
	f := newDoFixture(t)
	rhino := f.villain()
	f.mustDo(t, "h", Action{Kind: ActMove, Card: rhino, X: 500, Y: 300}, at(1))
	f.mustDo(t, "h", Action{Kind: ActMove, Card: rhino, X: 700, Y: 300}, at(2))

	events := f.g.History.Events
	if len(events) != 1 || events[0].Action.X != 700 || events[0].Seq != 2 {
		t.Fatalf("events = %+v, want the second move alone, with its own number 2", events)
	}
	checkHistory(t, f.g)

	f.mustDo(t, "b", Action{Kind: ActMove, Card: rhino, X: 900, Y: 300}, at(3))
	f.mustDo(t, "h", Action{Kind: ActMove, Card: rhino, X: 100, Y: 300}, at(4))
	if got := len(f.g.History.Events); got != 3 {
		t.Errorf("%d events, want 3: a move by another player is kept apart", got)
	}
	checkHistory(t, f.g)
	checkReplay(t, f) // the replaced move leaves a gap in the numbering
}

func TestArrangingActionsAreUntrackedEvents(t *testing.T) {
	f := newDoFixture(t)
	f.mustDo(t, "h", Action{Kind: ActDraw, N: 2}, at(1))
	rhino, identity := f.villain(), f.identity(t)
	hand := slices.Clone(f.g.Table.Hands["p0"])
	slices.Reverse(hand)
	top := topCards(f.g.Table.Piles["deck:p0"], 2)
	slices.Reverse(top)

	actions := []Action{
		{Kind: ActMove, Card: rhino, X: 500, Y: 300},
		{Kind: ActAttach, Card: identity, Target: rhino},
		{Kind: ActHandOrder, Area: "p0", Cards: hand},
		{Kind: ActReorderTop, Pile: "deck:p0", Cards: top},
		{Kind: ActFirstPlayer, Area: "p1", X: 100, Y: 100},
		{Kind: ActArrowAdd, Card: rhino, Target: identity},
		{Kind: ActArrowClear},
	}
	for i, a := range actions {
		lines := len(f.g.Log)
		f.mustDo(t, "h", a, at(10+i))

		last := f.g.History.Events[len(f.g.History.Events)-1]
		if last.Action.Kind != a.Kind || last.Tracked || last.Log != -1 || len(f.g.Log) != lines {
			t.Errorf("%s recorded %+v with %d new lines, want an untracked event without a line", a.Kind, last, len(f.g.Log)-lines)
		}
	}
	checkHistory(t, f.g)
}

func TestViewNeverShowsTheHistory(t *testing.T) {
	f := newDoFixture(t)
	f.mustDo(t, "h", Action{Kind: ActExhaust, Card: f.villain()}, at(1))
	f.mustDo(t, "b", Action{Kind: ActShuffle, Pile: "deck:p1"}, at(2))

	for _, token := range []string{"h", "b", "nobody"} {
		doc := mustJSON(t, f.g.ViewFor(token))
		for _, key := range []string{`"history"`, `"initial"`, `"events"`, `"snapshots"`, `"seed"`, `"renames"`} {
			if strings.Contains(doc, key) {
				t.Errorf("the view of %q holds %s", token, key)
			}
		}
	}
}

// TestUndoKeepsAnotherPlayersReady has Bob ready the villain Host exhausted:
// Host's undo must leave it ready, as Bob left it.
func TestUndoKeepsAnotherPlayersReady(t *testing.T) {
	f := newDoFixture(t)
	rhino := f.villain()
	f.mustDo(t, "h", Action{Kind: ActExhaust, Card: rhino}, at(1))
	f.mustDo(t, "b", Action{Kind: ActExhaust, Card: rhino}, at(2))

	f.mustDo(t, "h", Action{Kind: ActUndo}, at(3))

	if f.g.Table.Cards[rhino].Exhausted {
		t.Error("Rhino is exhausted again after Host's undo, want Bob's ready kept")
	}
	if f.g.Log[len(f.g.Log)-2].Undone {
		t.Error("Bob's ready line is struck")
	}
	checkHistory(t, f.g)
}

// TestUndoKeepsAnotherPlayersFlip has Bob flip back the identity Host
// flipped: Host's undo must leave it on the side Bob chose.
func TestUndoKeepsAnotherPlayersFlip(t *testing.T) {
	f := newDoFixture(t)
	identity := f.identity(t)
	start := f.g.Table.Cards[identity].Face
	f.mustDo(t, "h", Action{Kind: ActFlip, Card: identity}, at(1))
	f.mustDo(t, "b", Action{Kind: ActFlip, Card: identity}, at(2))

	f.mustDo(t, "h", Action{Kind: ActUndo}, at(3))

	if got := f.g.Table.Cards[identity].Face; got != start {
		t.Errorf("identity face = %d after Host's undo, want %d where Bob left it", got, start)
	}
	checkHistory(t, f.g)
}

// TestOlderUndoReshufflesTheEncounterDeck undoes a reveal older than Bob's
// shuffle of the encounter deck: the revealed card goes back, the recorded
// shuffle no longer fits, and the deck is shuffled again with fresh ids.
func TestOlderUndoReshufflesTheEncounterDeck(t *testing.T) {
	f := newDoFixture(t)
	f.mustDo(t, "h", Action{Kind: ActReveal}, at(1))
	revealed := f.g.Table.revealed()[0].ID
	seen := append(slices.Clone(f.g.Table.Piles[PileEncounter].Cards), revealed)
	f.mustDo(t, "b", Action{Kind: ActShuffle, Pile: PileEncounter}, at(2))
	shuffled := slices.Clone(f.g.Table.Piles[PileEncounter].Cards)

	f.mustDo(t, "h", Action{Kind: ActUndo}, at(3))

	enc := f.g.Table.Piles[PileEncounter].Cards
	if len(enc) != len(seen) {
		t.Errorf("encounter deck holds %d cards, want %d", len(enc), len(seen))
	}
	for _, id := range enc {
		if slices.Contains(seen, id) || slices.Contains(shuffled, id) {
			t.Errorf("encounter card %s keeps an id from before the undo", id)
		}
	}
	if got := f.g.Table.revealed(); len(got) != 0 {
		t.Errorf("revealed = %v, want none", got)
	}
	checkIntegrity(t, f.g.Table)
	checkHistory(t, f.g)
	checkReplay(t, f)
}

func TestReplayChecksThePlayers(t *testing.T) {
	f := newDoFixture(t)
	setup, err := f.g.ReplaySetup()
	if err != nil {
		t.Fatal(err)
	}
	tests := map[string]func(s *ReplaySetup){
		"no player":    func(s *ReplaySetup) { s.Players = nil },
		"five players": func(s *ReplaySetup) { s.Players = slices.Repeat(s.Players[:1], 5) },
		"same colour":  func(s *ReplaySetup) { s.Players[1].Color = s.Players[0].Color },
		"bad colour":   func(s *ReplaySetup) { s.Players[1].Color = maxSeats },
		"no deck":      func(s *ReplaySetup) { s.Players[1].Decks = nil },
		"five decks":   func(s *ReplaySetup) { s.Players[0].Decks = slices.Repeat(s.Players[0].Decks, 4) },
	}
	for name, change := range tests {
		t.Run(name, func(t *testing.T) {
			s := setup
			s.Players = slices.Clone(setup.Players)
			change(&s)
			if _, err := Replay(f.cat, s, nil); !errors.Is(err, ErrInvalid) {
				t.Errorf("Replay = %v, want ErrInvalid", err)
			}
		})
	}
	if _, err := Replay(f.cat, setup, nil); err != nil {
		t.Errorf("Replay of the valid setup = %v", err)
	}
}
