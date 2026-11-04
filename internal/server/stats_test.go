package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"regexp"
	"slices"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"

	"github.com/alexandreroman/intothefray/internal/game"
	"github.com/alexandreroman/intothefray/internal/pack"
)

// newStatsServer starts a server whose clock only moves when the returned
// function advances it, and which loads the Black Panther deck from deckLink.
func newStatsServer(t *testing.T) (ts *httptest.Server, mr *miniredis.Miniredis, advance func(time.Duration)) {
	t.Helper()

	start := time.Date(2026, 11, 4, 12, 0, 0, 0, time.UTC)
	var elapsed atomic.Int64
	ts, mr = newTestServerWith(t, func(s *Server) {
		s.deps.Decks = stubMarvelcdb(t, blackPantherDeck)
		s.deps.Now = func() time.Time { return start.Add(time.Duration(elapsed.Load())) }
	})
	advance = func(d time.Duration) { elapsed.Add(int64(d)) }
	return ts, mr, advance
}

func getStats(t *testing.T, ts *httptest.Server) reply {
	t.Helper()

	req, err := http.NewRequestWithContext(t.Context(), http.MethodGet, ts.URL+"/api/stats", http.NoBody)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Origin", allowedOrigin)
	return send(t, req)
}

// statsIn decodes a successful stats reply.
func statsIn(t *testing.T, resp reply) statsResponse {
	t.Helper()

	if resp.status != http.StatusOK {
		t.Fatalf("status = %d, want %d (body %s)", resp.status, http.StatusOK, resp.body)
	}
	var body statsResponse
	if err := json.Unmarshal(resp.body, &body); err != nil {
		t.Fatal(err)
	}
	return body
}

// gamesIn decodes the count of games from a successful stats reply, and
// checks that it is the length of the list.
func gamesIn(t *testing.T, resp reply) int {
	t.Helper()

	stats := statsIn(t, resp)
	if stats.Games != len(stats.Playing) {
		t.Errorf("games = %d, want %d, the length of the list", stats.Games, len(stats.Playing))
	}
	return stats.Games
}

// startGame creates a game hosted by hostName and starts it solo, then
// returns it with the host's connection.
func startGame(t *testing.T, ts *httptest.Server, hostName string) (createGameResponse, *testClient) {
	t.Helper()

	created := createGame(t, ts, hostName)
	host := connect(t, ts, created.ID)
	host.hello(created.Token, hostName)
	startSolo(t, host)
	return created, host
}

func TestStats(t *testing.T) {
	ts, _, _ := newStatsServer(t)
	startGame(t, ts, "Alex")
	startGame(t, ts, "Sam")

	resp := getStats(t, ts)

	if got := gamesIn(t, resp); got != 2 {
		t.Errorf("games = %d, want 2", got)
	}
	if got := resp.header.Get("Content-Type"); got != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", got)
	}
	if got := resp.header.Get("Cache-Control"); got != "public, max-age=60" {
		t.Errorf("Cache-Control = %q, want public, max-age=60", got)
	}
	if got := resp.header.Get("Access-Control-Allow-Origin"); got != allowedOrigin {
		t.Errorf("Access-Control-Allow-Origin = %q, want %q", got, allowedOrigin)
	}
}

func TestStatsWithoutGamesBeingPlayed(t *testing.T) {
	ts, _, _ := newStatsServer(t)
	createGame(t, ts, "Alex") // stays in the lobby

	resp := getStats(t, ts)

	if got := gamesIn(t, resp); got != 0 {
		t.Errorf("games = %d, want 0", got)
	}
	// The list is an array even when empty.
	if want := `"playing":[]`; !strings.Contains(string(resp.body), want) {
		t.Errorf("body = %s, want it to hold %s", resp.body, want)
	}
}

func TestStatsCachesTheReplyForAMinute(t *testing.T) {
	ts, _, advance := newStatsServer(t)
	startGame(t, ts, "Alex")

	if got := gamesIn(t, getStats(t, ts)); got != 1 {
		t.Fatalf("first games = %d, want 1", got)
	}

	startGame(t, ts, "Sam")
	advance(59 * time.Second)
	if got := gamesIn(t, getStats(t, ts)); got != 1 {
		t.Errorf("games within a minute = %d, want the cached 1", got)
	}

	advance(time.Second)
	if got := gamesIn(t, getStats(t, ts)); got != 2 {
		t.Errorf("games after a minute = %d, want 2", got)
	}
}

func TestStatsStoreFailure(t *testing.T) {
	ts, mr, _ := newStatsServer(t)
	startGame(t, ts, "Alex")

	mr.SetError("ERR redis is down")
	resp := getStats(t, ts)

	if resp.status != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d", resp.status, http.StatusServiceUnavailable)
	}
	var body errorResponse
	if err := json.Unmarshal(resp.body, &body); err != nil {
		t.Fatal(err)
	}
	if body.Error == "" {
		t.Errorf("body = %s, want an error message", resp.body)
	}
	if got := resp.header.Get("Cache-Control"); got != "no-store" {
		t.Errorf("Cache-Control = %q, want no-store", got)
	}

	// The failure is not cached: the next request reads Redis again.
	mr.SetError("")
	if got := gamesIn(t, getStats(t, ts)); got != 1 {
		t.Errorf("games after recovery = %d, want 1", got)
	}
}

func TestStatsListsGamesInPlay(t *testing.T) {
	ts, mr, _ := newStatsServer(t)
	createGame(t, ts, "Sam") // stays in the lobby
	_, ender := startGame(t, ts, "Bo")
	ender.lobby("end", nil)
	if ended := ender.expect("view"); ended.View.Phase != game.PhaseEnded {
		t.Fatalf("view after the end = %s, want an ended game", ended.raw)
	}
	created, _ := startGame(t, ts, "Alex")

	resp := getStats(t, ts)

	// The lobby and the ended game are neither counted nor listed.
	got := statsIn(t, resp)
	want := statsResponse{
		Games: 1,
		Playing: []playedGame{{
			Ref:      storedStatsRef(t, mr, created.ID),
			Heroes:   []playedHero{{Hero: "Black Panther", AlterEgo: "T'Challa"}},
			Scenario: "Rhino",
			Modulars: []string{"Bomb Scare"},
		}},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("stats = %+v, want %+v", got, want)
	}
	for _, secret := range []string{created.ID, created.Token, "Alex", "Starter", "marvelcdb"} {
		if strings.Contains(string(resp.body), secret) {
			t.Errorf("body = %s, want no %q in it", resp.body, secret)
		}
	}
}

// statsRefPattern is the format of the statistics reference of a game.
var statsRefPattern = regexp.MustCompile(`^[0-9a-f]{16}$`)

func TestStatsRefs(t *testing.T) {
	ts, _, advance := newStatsServer(t)
	alex, alexHost := startGame(t, ts, "Alex")
	sam, _ := startGame(t, ts, "Sam")

	first := refsIn(t, getStats(t, ts))

	if len(first) != 2 || first[0] == first[1] {
		t.Fatalf("refs = %q, want two distinct ones", first)
	}
	for _, ref := range first {
		if !statsRefPattern.MatchString(ref) {
			t.Errorf("ref %q, want 16 lowercase hex characters", ref)
		}
		for _, id := range []string{alex.ID, sam.ID} {
			if strings.Contains(ref, id) {
				t.Errorf("ref %q holds game id %q", ref, id)
			}
		}
	}

	// An action rewrites the game; the next scan reads it again.
	alexHost.send(map[string]any{"type": "action", "id": 1, "action": map[string]any{"kind": "draw", "n": 1}})
	alexHost.expect("view")
	advance(statsCacheTTL)

	if again := refsIn(t, getStats(t, ts)); !slices.Equal(again, first) {
		t.Errorf("refs after an action and a minute = %q, want %q", again, first)
	}
}

// refsIn returns the refs of the games listed in a successful stats reply,
// sorted.
func refsIn(t *testing.T, resp reply) []string {
	t.Helper()

	var refs []string
	for _, played := range statsIn(t, resp).Playing {
		refs = append(refs, played.Ref)
	}
	slices.Sort(refs)
	return refs
}

// storedStatsRef returns the statistics reference stored with game id.
func storedStatsRef(t *testing.T, mr *miniredis.Miniredis, id string) string {
	t.Helper()

	data, err := mr.Get("game:" + id + ":info")
	if err != nil {
		t.Fatalf("read summary of %s: %v", id, err)
	}
	var summary game.Summary
	if err := json.Unmarshal([]byte(data), &summary); err != nil {
		t.Fatalf("decode summary of %s: %v", id, err)
	}
	if !statsRefPattern.MatchString(summary.Ref) {
		t.Fatalf("stored ref = %q, want 16 lowercase hex characters", summary.Ref)
	}
	return summary.Ref
}

func TestHeroOf(t *testing.T) {
	card := pack.Card{Code: "99001", Faces: []pack.Face{
		{Name: "Plain Side", Type: "upgrade"},
		{Name: "Mighty Side", Type: pack.FaceTypeHero},
	}}

	got := heroOf(card)

	// No alter-ego face: the field is still there, empty, like on every hero.
	if want := (playedHero{Hero: "Mighty Side"}); got != want {
		t.Errorf("heroOf = %+v, want %+v", got, want)
	}
	data, err := json.Marshal(got)
	if err != nil {
		t.Fatal(err)
	}
	if want := `{"hero":"Mighty Side","alterEgo":""}`; string(data) != want {
		t.Errorf("JSON = %s, want %s", data, want)
	}
}

func TestStatsOf(t *testing.T) {
	s := &Server{deps: Deps{Catalog: testCatalog(t)}}
	summaries := []game.Summary{
		{Phase: game.PhasePlaying, Scenario: "rhino", Heroes: []string{"01040a", "01001b"}},
		{Phase: game.PhaseEnded, Scenario: "rhino", Heroes: []string{"01001a"}},
		{Phase: game.PhasePlaying, Scenario: "klaw", Modulars: []string{"masters_of_evil", "unknown"}},
		{Ref: "bbbb", Phase: game.PhasePlaying, Scenario: "rhino", Heroes: []string{"01001a", "99999"}},
		{Ref: "aaaa", Phase: game.PhasePlaying, Scenario: "rhino", Heroes: []string{"01001a"}},
		{Phase: game.PhaseLobby},
	}

	got := s.statsOf(summaries)

	spiderMan := playedHero{Hero: "Spider-Man", AlterEgo: "Peter Parker"}
	blackPanther := playedHero{Hero: "Black Panther", AlterEgo: "T'Challa"}
	want := statsResponse{
		Games: 4, // the games being played only
		// Sorted by scenario, then heroes, then ref; unknown codes are left out.
		Playing: []playedGame{
			{Heroes: []playedHero{}, Scenario: "Klaw", Modulars: []string{"Masters of Evil"}},
			{Heroes: []playedHero{blackPanther, spiderMan}, Scenario: "Rhino", Modulars: []string{}},
			{Ref: "aaaa", Heroes: []playedHero{spiderMan}, Scenario: "Rhino", Modulars: []string{}},
			{Ref: "bbbb", Heroes: []playedHero{spiderMan}, Scenario: "Rhino", Modulars: []string{}},
		},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("statsOf = %+v, want %+v", got, want)
	}
}
