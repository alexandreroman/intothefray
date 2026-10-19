package game

import (
	"encoding/json"
	"flag"
	"fmt"
	"math/rand/v2"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"
)

var (
	updateGolden = flag.Bool("update", false, "rewrite the golden files of the replay tests from their replays")
	recordGames  = flag.Bool("record", false, "record the games of the replay tests again, from random play")
)

// randomPlay drives a game with random actions, mostly legal ones, and undos.
// Its own seed makes every run the same.
type randomPlay struct {
	f     *doFixture
	r     *rand.Rand
	now   time.Time
	last  map[int]Action // each seat's last action
	trace []string
}

func newRandomPlay(f *doFixture, seed uint64) *randomPlay {
	return &randomPlay{f: f, r: rand.New(rand.NewPCG(seed, 99)), now: testNow, last: map[int]Action{}} //nolint:gosec // deterministic test
}

// step performs one random action for a random player, and reports whether
// the game accepted it.
func (p *randomPlay) step() bool {
	seat := p.r.IntN(len(p.f.g.Players))
	a := randomAction(p.r, p.f.g.Table, seat)
	// Repeating a counter change or a flip makes bursts; moving the same
	// card again replaces the last move.
	if last := p.last[seat]; (mergeKey(last) != "" || last.Kind == ActMove) && p.r.IntN(2) == 0 {
		a = last
		if a.Kind == ActMove {
			a.X, a.Y = 10*p.r.IntN(100), 10*p.r.IntN(40)
		}
	}
	p.last[seat] = a
	// Short gaps let counters and flips merge, long ones break the bursts.
	p.now = p.now.Add(time.Duration(1+p.r.IntN(12)) * time.Second)
	err := p.f.do(p.f.g.Players[seat].Token, a, p.now)
	p.trace = append(p.trace, fmt.Sprintf("seat %d %+v: %v", seat, a, err))
	return err == nil
}

// lastSteps returns the last n lines of the trace.
func (p *randomPlay) lastSteps(n int) string {
	return strings.Join(p.trace[max(0, len(p.trace)-n):], "\n")
}

// randomAction picks an action for seat from what lies on table. Some of
// them are bound to fail (a reveal while a card is revealed, for instance):
// the game must refuse those without changing.
func randomAction(r *rand.Rand, t *Table, seat int) Action {
	area := PlayerArea(seat)
	deck := "deck:" + string(area)
	hand := t.Hands[area]
	var onTable []string
	for id, c := range t.Cards {
		if c.Zone == ZoneTable {
			onTable = append(onTable, id)
		}
	}
	slices.Sort(onTable)
	pick := func(ids []string) string {
		if len(ids) == 0 {
			return ""
		}
		return ids[r.IntN(len(ids))]
	}
	oneOf := func(values ...string) string { return values[r.IntN(len(values))] }
	x, y := 10*r.IntN(100), 10*r.IntN(40)

	switch r.IntN(30) {
	case 0, 1:
		return Action{Kind: ActDraw, N: 1 + r.IntN(3)}
	case 2:
		return Action{Kind: ActPlay, Card: pick(hand), X: x, Y: y}
	case 3:
		return Action{Kind: ActPlay, Card: pick(hand), Target: pick(onTable), X: x, Y: y, Placed: r.IntN(2) == 0}
	case 4:
		return Action{Kind: ActDiscard, Card: pick(slices.Concat(onTable, hand))}
	case 5:
		if r.IntN(4) == 0 {
			return Action{Kind: ActReadyAll}
		}
		return Action{Kind: ActExhaust, Card: pick(onTable)}
	case 6:
		return Action{Kind: ActFlip, Card: pick(onTable)}
	case 7:
		return Action{Kind: ActToken, Card: pick(onTable), Name: oneOf("dmg", "thr"), Delta: 1 - 2*r.IntN(2)}
	case 8:
		return Action{Kind: ActStatus, Card: pick(onTable), Name: oneOf("tough", statusLocked), Delta: 1 - 2*r.IntN(2)}
	case 9:
		return Action{Kind: ActReveal}
	case 10:
		return Action{Kind: ActDeal, Area: area, X: x, Y: y}
	case 11:
		return Action{Kind: ActDiscardTop, Pile: oneOf(PileEncounter, deck), N: 1 + r.IntN(2)}
	case 12, 13:
		return Action{Kind: ActMove, Card: pick(onTable), X: x, Y: y}
	case 14:
		return Action{Kind: ActAttach, Card: pick(onTable), Target: pick(onTable), X: x, Y: y, Placed: r.IntN(2) == 0}
	case 15:
		return Action{Kind: ActToHand, Card: pick(onTable)}
	case 16:
		return Action{Kind: ActToDeck, Card: pick(hand), Where: oneOf(whereTop, whereBottom, whereShuffle)}
	case 17:
		return Action{Kind: ActToPile, Card: pick(onTable), Target: oneOf(PileVictory, PileScenarioAside, "aside:"+string(area))}
	case 18:
		stage := t.Stages[r.IntN(len(t.Stages))]
		return Action{Kind: ActChooseStage, Stage: stage.Key, Card: pick(stage.Cards), Face: r.IntN(2)}
	case 19:
		return Action{Kind: ActShuffle, Pile: oneOf(deck, PileEncounter)}
	case 20:
		return Action{Kind: ActShuffleBack, Pile: oneOf("disc:"+string(area), PileEncounterDiscard)}
	case 21:
		return Action{Kind: ActShuffleIn, Pile: PileScenarioAside}
	case 22:
		top := topCards(t.Piles[deck], min(2, len(t.Piles[deck].Cards)))
		slices.Reverse(top)
		return Action{Kind: ActReorderTop, Pile: deck, Cards: top}
	case 23:
		order := slices.Clone(hand)
		slices.Reverse(order)
		return Action{Kind: ActHandOrder, Area: area, Cards: order}
	case 24:
		switch r.IntN(3) {
		case 0:
			return Action{Kind: ActArrowAdd, Card: pick(onTable), Target: pick(onTable)}
		case 1:
			return Action{Kind: ActArrowClear}
		default:
			return Action{Kind: ActFirstPlayer, X: x, Y: y}
		}
	case 25:
		if t.Views[area] != nil {
			return Action{Kind: ActCloseView, Where: oneOf("", whereShuffle)}
		}
		return Action{Kind: Kind(oneOf(string(ActLook), string(ActSearch))), Pile: oneOf(deck, PileEncounter, PileEncounterDiscard), N: 3}
	default:
		return Action{Kind: ActUndo}
	}
}

// checkReplay verifies that replaying the setup and events of g, as stored
// in JSON, gives g back: the same table, log and history.
func checkReplay(t *testing.T, f *doFixture) {
	t.Helper()
	setup, err := f.g.ReplaySetup()
	if err != nil {
		t.Fatal(err)
	}
	var stored recordedGame
	if err := json.Unmarshal([]byte(mustJSON(t, recordedGame{Setup: setup, Events: f.g.History.Events})), &stored); err != nil {
		t.Fatal(err)
	}
	replayed, err := Replay(f.cat, stored.Setup, stored.Events)
	if err != nil {
		t.Errorf("replay: %v", err)
		return
	}
	for _, part := range []struct {
		name         string
		live, replay any
	}{
		{"table", f.g.Table, replayed.Table},
		{"log", f.g.Log, replayed.Log},
		{"history", f.g.History, replayed.History},
	} {
		if mustJSON(t, part.live) != mustJSON(t, part.replay) {
			t.Errorf("the replayed %s differs from the live one", part.name)
		}
	}
}

// TestRandomPlayKeepsTheHistoryRight plays random two-player games and
// checks after every step that the table is whole, that it equals its
// events, and, for a few seeds, that a replay gives the same game.
func TestRandomPlayKeepsTheHistoryRight(t *testing.T) {
	const seeds, steps, replayedSeeds = 40, 150, 5
	scenarios := []struct {
		name    string
		fixture func(*testing.T) *doFixture
	}{
		{"rhino", newDoFixture},
		{"klaw", klawFixture},
	}
	for _, scenario := range scenarios {
		t.Run(scenario.name, func(t *testing.T) {
			t.Parallel()
			stats := make([]map[string]int, seeds)
			// The seeds run in parallel; this group waits for all of them.
			t.Run("seeds", func(t *testing.T) {
				for seed := range uint64(seeds) {
					t.Run(fmt.Sprint(seed), func(t *testing.T) {
						t.Parallel()
						f := scenario.fixture(t)
						play := newRandomPlay(f, seed)
						for step := range steps {
							play.step()
							checkIntegrity(t, f.g.Table)
							checkHistory(t, f.g)
							if seed < replayedSeeds {
								checkReplay(t, f)
							}
							if t.Failed() {
								t.Fatalf("step %d; last steps:\n%s", step, play.lastSteps(8))
							}
						}
						stats[seed] = countEvents(f.g.History)
					})
				}
			})
			total := map[string]int{}
			for _, counts := range stats {
				for name, n := range counts {
					total[name] += n
				}
			}
			t.Logf("%d seeds × %d steps: %v", seeds, steps, total)
		})
	}
}

// countEvents counts the events of h, with the undos, merged, dropped and
// undone ones apart.
func countEvents(h *History) map[string]int {
	stats := map[string]int{}
	for _, e := range h.Events {
		stats["events"]++
		if e.Action.Kind == ActUndo {
			stats["undos"]++
		}
		if e.Burst > 0 {
			stats["in bursts"]++
		}
		if e.Undone {
			stats["undone"]++
		}
		if e.Dropped {
			stats["dropped"]++
		}
	}
	return stats
}

func TestSameSeedSameGame(t *testing.T) {
	for _, fixture := range []func(*testing.T) *doFixture{newDoFixture, klawFixture} {
		for seed := range uint64(5) {
			var games []string
			for range 2 {
				f := fixture(t)
				play := newRandomPlay(f, seed)
				for range 150 {
					play.step()
				}
				games = append(games, mustJSON(t, f.g))
			}
			if games[0] != games[1] {
				t.Errorf("seed %d: two runs give different games", seed)
			}
		}
	}
}

// fourPlayerGame returns a started game of four Spider-Man players, "h"
// (Host), "b", "c" and "d", whose deck lists hold 39 cards, identity
// included: their ten basic cards come three times each.
func fourPlayerGame(t *testing.T) *doFixture {
	t.Helper()
	cat := newCatalog(t)
	deck := spiderManDeck(t, cat)
	basics := deck.Cards[len(deck.Cards)-10:] // spiderManDeck lists them last
	for i := range basics {
		basics[i].Qty = 3
	}
	size := 0
	for _, entry := range deck.Cards {
		size += entry.Qty
	}
	if size != 39 {
		t.Fatalf("deck lists %d cards, want 39", size)
	}

	g := lobbyOfFour(t)
	if err := g.Configure("h", rhinoConfig(), cat); err != nil {
		t.Fatal(err)
	}
	for _, p := range g.Players {
		if err := g.SetDeck(p.Token, 0, deck, cat); err != nil {
			t.Fatal(err)
		}
	}
	if err := g.Start("h", cat, testSeed, testNow); err != nil {
		t.Fatal(err)
	}
	return &doFixture{g: g, cat: cat}
}

// maxGameJSON bounds the JSON form of a long four-player game, history
// included.
const maxGameJSON = 512 << 10

// TestGameSizeAfterALongGame plays 300 accepted random actions, undos
// included, in a four-player game.
func TestGameSizeAfterALongGame(t *testing.T) {
	const actions = 300
	f := fourPlayerGame(t)
	play := newRandomPlay(f, 1)
	for accepted := 0; accepted < actions; {
		if play.step() {
			accepted++
		}
	}

	size := len(mustJSON(t, f.g))
	h := f.g.History
	t.Logf("4 players, %d accepted actions out of %d tried, %d events, %d snapshots: %d bytes (%d KiB)",
		actions, len(play.trace), len(h.Events), len(h.Snapshots), size, size>>10)
	t.Logf("table %d, initial %d, snapshots %d, events %d, log %d bytes",
		len(mustJSON(t, f.g.Table)), len(mustJSON(t, h.Initial)), len(mustJSON(t, h.Snapshots)),
		len(mustJSON(t, h.Events)), len(mustJSON(t, f.g.Log)))
	if size > maxGameJSON {
		t.Errorf("game JSON is %d bytes, want at most %d", size, maxGameJSON)
	}
	checkHistory(t, f.g)
}

// recordedGame is a game stored for the replay tests.
type recordedGame struct {
	Setup  ReplaySetup `json:"setup"`
	Events []Event     `json:"events"`
}

// TestReplayRecordedGame replays a stored two-player Rhino game and compares
// the table it ends with to the golden one, byte for byte. Run with -record
// to record the game again from random play (its golden file is then the live
// table), and with -update to rewrite the golden file from the replay. The
// recording predates plays under a card: its last event, one such play, was
// appended to it from a replay of the earlier events.
func TestReplayRecordedGame(t *testing.T) {
	recording := filepath.Join("testdata", "replays", "rhino-2p.json")
	golden := filepath.Join("testdata", "replays", "rhino-2p.table.golden.json")
	cat := newCatalog(t)
	if *recordGames {
		recordRandomGame(t, recording, golden)
	}

	var game recordedGame
	if err := json.Unmarshal(readFile(t, recording), &game); err != nil {
		t.Fatal(err)
	}
	replayed, err := Replay(cat, game.Setup, game.Events)
	if err != nil {
		t.Fatal(err)
	}
	if mustJSON(t, replayed.History.Events) != mustJSON(t, game.Events) {
		t.Error("the replay records other events than the recorded ones")
	}
	got := indentedJSON(t, replayed.Table)
	if *updateGolden {
		writeFile(t, golden, got)
	}
	if want := readFile(t, golden); string(got) != string(want) {
		t.Errorf("the replayed table differs from %s", golden)
	}
}

// recordRandomGame plays a random Rhino game and stores its setup and events
// at recording, and its live table at golden. Seed 13 gives a varied game:
// bursts, replaced moves, dropped events, looks and most action kinds.
func recordRandomGame(t *testing.T, recording, golden string) {
	t.Helper()
	f := newDoFixture(t)
	play := newRandomPlay(f, 13)
	for range 120 {
		play.step()
	}
	setup, err := f.g.ReplaySetup()
	if err != nil {
		t.Fatal(err)
	}
	writeFile(t, recording, indentedJSON(t, recordedGame{Setup: setup, Events: f.g.History.Events}))
	writeFile(t, golden, indentedJSON(t, f.g.Table))
}

func indentedJSON(t *testing.T, v any) []byte {
	t.Helper()
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	return append(data, '\n')
}

func readFile(t *testing.T, path string) []byte {
	t.Helper()
	data, err := os.ReadFile(path) //nolint:gosec // test data paths
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func writeFile(t *testing.T, path string, data []byte) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatal(err)
	}
}
