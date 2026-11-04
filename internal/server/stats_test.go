package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
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

// gamesIn decodes the count of games from a successful stats reply.
func gamesIn(t *testing.T, resp reply) int {
	t.Helper()
	return statsIn(t, resp).Games
}

func TestStats(t *testing.T) {
	ts, _, _ := newStatsServer(t)
	createGame(t, ts, "Alex")
	createGame(t, ts, "Sam")

	resp := getStats(t, ts)

	if got := gamesIn(t, resp); got != 2 {
		t.Errorf("games = %d, want 2", got)
	}
	// Lobbies are counted, not listed, and the list is an array even when
	// empty.
	if want := `"playing":[]`; !strings.Contains(string(resp.body), want) {
		t.Errorf("body = %s, want it to hold %s", resp.body, want)
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

func TestStatsCachesTheReplyForAMinute(t *testing.T) {
	ts, _, advance := newStatsServer(t)
	createGame(t, ts, "Alex")

	if got := gamesIn(t, getStats(t, ts)); got != 1 {
		t.Fatalf("first games = %d, want 1", got)
	}

	createGame(t, ts, "Sam")
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
	createGame(t, ts, "Alex")

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
	ts, _, _ := newStatsServer(t)
	createGame(t, ts, "Sam") // stays in the lobby
	created := createGame(t, ts, "Alex")
	host := connect(t, ts, created.ID)
	host.hello(created.Token, "Alex")
	startSolo(t, host)

	resp := getStats(t, ts)

	got := statsIn(t, resp)
	want := statsResponse{
		Games: 2,
		Playing: []playedGame{{
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
		{Phase: game.PhasePlaying, Scenario: "rhino", Heroes: []string{"01001a", "99999"}},
		{Phase: game.PhaseLobby},
	}

	got := s.statsOf(summaries)

	spiderMan := playedHero{Hero: "Spider-Man", AlterEgo: "Peter Parker"}
	blackPanther := playedHero{Hero: "Black Panther", AlterEgo: "T'Challa"}
	want := statsResponse{
		Games: 5,
		// Sorted by scenario, then heroes; unknown codes are left out.
		Playing: []playedGame{
			{Heroes: []playedHero{}, Scenario: "Klaw", Modulars: []string{"Masters of Evil"}},
			{Heroes: []playedHero{blackPanther, spiderMan}, Scenario: "Rhino", Modulars: []string{}},
			{Heroes: []playedHero{spiderMan}, Scenario: "Rhino", Modulars: []string{}},
		},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("statsOf = %+v, want %+v", got, want)
	}
}
