package game

import (
	"encoding/json"
	"errors"
	"math/rand/v2"
	"slices"
	"testing"
	"time"

	"github.com/alexandreroman/intothefray/internal/pack"
)

// doFixture is a started game of two Spider-Man players: "h" (Host, p0) and
// "b" (Bob, p1).
type doFixture struct {
	g   *Game
	cat *pack.Catalog
	rng *rand.Rand
}

func newDoFixture(t *testing.T) *doFixture {
	t.Helper()
	return &doFixture{g: startedGame(t, rhinoConfig()), cat: newCatalog(t), rng: newTestRNG()}
}

func (f *doFixture) do(token string, a Action, at time.Time) error {
	return f.g.Do(token, a, f.cat, f.rng, at)
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
		if c.Zone == ZoneTable && c.Area == "p0" && c.Owner == 0 {
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
	if got := len(f.g.Undo["h"]); got != 1 {
		t.Errorf("burst pushed %d undo entries, want 1", got)
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
	if got := len(f.g.Undo["h"]); got != 0 {
		t.Errorf("flipping back left %d undo entries", got)
	}
	if got := f.g.Table.Cards[identity].Face; got != 1 {
		t.Errorf("identity face = %d, want 1 (alter ego)", got)
	}
}

func TestMoveIsUntracked(t *testing.T) {
	f := newDoFixture(t)
	lines := len(f.g.Log)

	f.mustDo(t, "h", Action{Kind: ActMove, Card: f.villain(), Area: AreaVillain, X: 500, Y: 300}, at(1))

	if got := len(f.g.Log); got != lines {
		t.Errorf("move wrote lines %q", f.logTexts()[lines:])
	}
	if err := f.do("h", Action{Kind: ActUndo}, at(2)); !errors.Is(err, ErrInvalid) {
		t.Errorf("undo with nothing to undo = %v, want ErrInvalid", err)
	}
}

func TestSpectatorCannotAct(t *testing.T) {
	f := newDoFixture(t)
	if role, err := f.g.Join("s", "Sam", testNow); err != nil || role != RoleSpectator {
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
	g := NewGame("g1", "h", "Host", testNow)

	err := g.Do("h", Action{Kind: ActDraw, N: 1}, newCatalog(t), newTestRNG(), testNow)
	if !errors.Is(err, ErrPhase) {
		t.Errorf("Do in the lobby = %v, want ErrPhase", err)
	}
}

func TestUndoDepthCapped(t *testing.T) {
	f := newDoFixture(t)
	for i := range maxUndoDepth + 1 {
		f.mustDo(t, "h", Action{Kind: ActExhaust, Card: f.villain()}, at(i))
	}

	if got := len(f.g.Undo["h"]); got != maxUndoDepth {
		t.Errorf("undo stack holds %d entries, want %d", got, maxUndoDepth)
	}
	// The oldest entry, the first exhaust, is the one dropped.
	if got := f.g.Undo["h"][0].LogIndex; got != 2 {
		t.Errorf("oldest kept entry points at line %d, want 2", got)
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
			return "turned the main scheme to The Break-In! (stage 1A)"
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
			f.mustDo(t, "h", Action{Kind: ActPlay, Card: card, Area: "p0", X: 400, Y: 200}, at(2))
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
	f.mustDo(t, "h", Action{Kind: ActPlay, Card: hand[1], Area: "p0", X: 400, Y: 200}, at(3))
	if got := f.lastLog().Cards; !slices.Equal(got, []string{hand[1]}) {
		t.Errorf("play line cards = %v, want %v", got, []string{hand[1]})
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

func TestCloseViewWithShuffleIsTracked(t *testing.T) {
	f := newDoFixture(t)
	order := slices.Clone(f.g.Table.Piles["deck:p0"].Cards)
	f.mustDo(t, "h", Action{Kind: ActSearch, Pile: "deck:p0"}, at(1))

	f.mustDo(t, "h", Action{Kind: ActCloseView, Where: whereShuffle}, at(2))

	if f.g.Table.Views["p0"] != nil {
		t.Error("the view is still open")
	}
	shuffledOrder := f.g.Table.Piles["deck:p0"].Cards
	if slices.Equal(shuffledOrder, order) || !samePermutation(shuffledOrder, order) {
		t.Errorf("deck order %v is not a new order of %v", shuffledOrder, order)
	}
	if got, want := f.lastLog().Text, "shuffled their deck"; got != want {
		t.Errorf("shuffle line = %q, want %q", got, want)
	}

	f.mustDo(t, "h", Action{Kind: ActUndo}, at(3))
	if got := f.g.Table.Piles["deck:p0"].Cards; !slices.Equal(got, order) {
		t.Errorf("deck order after undo = %v, want %v", got, order)
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
		{"look at another player's discard", "h", Action{Kind: ActLook, Pile: "disc:p1", N: 1}},
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
