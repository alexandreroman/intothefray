package server

import (
	"bytes"
	"encoding/json"
	"maps"
	"net/http"
	"net/http/httptest"
	"regexp"
	"slices"
	"strconv"
	"testing"
	"time"

	"github.com/alexandreroman/intothefray/internal/game"
)

const cardsHostToken = "host-token" //nolint:gosec // test fixture

// newCardsServer starts a server holding a started game and a game still in
// its lobby, and returns it with the started game.
func newCardsServer(t *testing.T) (ts *httptest.Server, started *game.Game, lobbyID string) {
	t.Helper()

	srv, _ := newServer(t)
	ts = httptest.NewServer(srv.Handler())
	t.Cleanup(ts.Close)

	started = newCardsGame(t, "started")
	if err := started.Start(cardsHostToken, srv.deps.Catalog, 42, time.Now()); err != nil {
		t.Fatal(err)
	}
	lobby := newCardsGame(t, "lobby")
	for _, g := range []*game.Game{started, lobby} {
		if err := srv.deps.Store.Create(t.Context(), g); err != nil {
			t.Fatal(err)
		}
	}
	return ts, started, lobby.ID
}

// newCardsGame returns a game in its lobby, ready to start: Rhino and a
// single Spider-Man player.
func newCardsGame(t *testing.T, id string) *game.Game {
	t.Helper()

	cat, err := testCatalog()
	if err != nil {
		t.Fatal(err)
	}
	g, err := game.NewGame(id, cardsHostToken, "Alex", time.Now())
	if err != nil {
		t.Fatal(err)
	}
	if err := g.Configure(cardsHostToken, game.DefaultConfig(cat, "rhino"), cat); err != nil {
		t.Fatal(err)
	}

	hero, ok := cat.HeroByIdentity("01001a")
	if !ok {
		t.Fatal("no spider-man hero")
	}
	set, ok := cat.Set("spider_man")
	if !ok {
		t.Fatal("no spider_man set")
	}
	deck := game.DeckChoice{Name: "Spidey", Hero: "01001a", HeroName: "Spider-Man"}
	for _, code := range set.Cards {
		if code != hero.Identity && code != hero.Obligation {
			deck.Cards = append(deck.Cards, game.DeckEntry{Code: code, Qty: 1})
		}
	}
	if err := g.SetDeck(cardsHostToken, 0, deck, cat); err != nil {
		t.Fatal(err)
	}
	return g
}

// getCards fetches the card pool of a game with the given request headers.
func getCards(t *testing.T, ts *httptest.Server, id string, header map[string]string) reply {
	t.Helper()

	req, err := http.NewRequestWithContext(t.Context(), http.MethodGet, ts.URL+"/api/games/"+id+"/cards", http.NoBody)
	if err != nil {
		t.Fatal(err)
	}
	for name, value := range header {
		req.Header.Set(name, value)
	}
	return send(t, req)
}

func TestGameCards(t *testing.T) {
	ts, started, _ := newCardsServer(t)

	resp := getCards(t, ts, started.ID, map[string]string{"Origin": allowedOrigin})

	if resp.status != http.StatusOK {
		t.Fatalf("status = %d, want %d: %s", resp.status, http.StatusOK, resp.body)
	}
	wantHeaders := map[string]string{
		"Content-Type":                "application/json",
		"Cache-Control":               "max-age=86400, immutable",
		"Access-Control-Allow-Origin": allowedOrigin,
		"Content-Length":              strconv.Itoa(len(resp.body)),
	}
	for name, want := range wantHeaders {
		if got := resp.header.Get(name); got != want {
			t.Errorf("%s = %q, want %q", name, got, want)
		}
	}

	var body map[string]json.RawMessage
	if err := json.Unmarshal(resp.body, &body); err != nil {
		t.Fatal(err)
	}
	if len(body) != 2 || string(body["version"]) != "1" {
		t.Errorf("body keys = %v, version = %s; want only version 1 and cards",
			slices.Sorted(maps.Keys(body)), body["version"])
	}
	var cards []map[string]any
	if err := json.Unmarshal(body["cards"], &cards); err != nil {
		t.Fatal(err)
	}

	var codes []string
	for _, card := range cards {
		codes = append(codes, card["code"].(string))
		if _, ok := card["id"]; ok {
			t.Errorf("card %s has an id", card["code"])
		}
	}
	if want := started.Table.CardCodes(); !slices.Equal(codes, want) {
		t.Errorf("codes = %v, want the sorted distinct codes of the table %v", codes, want)
	}

	identity := cards[slices.Index(codes, "01001")]
	if aliases, _ := identity["aliases"].([]any); !slices.Contains(aliases, any("01001b")) {
		t.Errorf("identity aliases = %v, want 01001b among them", identity["aliases"])
	}
	for id := range started.Table.Cards {
		if bytes.Contains(resp.body, []byte(`"`+id+`"`)) {
			t.Errorf("body holds card id %s", id)
		}
	}
}

func TestGameCardsErrors(t *testing.T) {
	ts, _, lobbyID := newCardsServer(t)

	tests := []struct {
		name       string
		id         string
		wantStatus int
		wantError  string
	}{
		{"unknown game", "nosuchgame", http.StatusNotFound, "game not found"},
		{"game in its lobby", lobbyID, http.StatusConflict, "the game has not started"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			resp := getCards(t, ts, tt.id, nil)

			if resp.status != tt.wantStatus {
				t.Errorf("status = %d, want %d", resp.status, tt.wantStatus)
			}
			if got := resp.header.Get("Cache-Control"); got != "no-store" {
				t.Errorf("Cache-Control = %q, want no-store", got)
			}
			var body errorResponse
			if err := json.Unmarshal(resp.body, &body); err != nil || body.Error != tt.wantError {
				t.Errorf("body = %s, want error %q", resp.body, tt.wantError)
			}
		})
	}
}

func TestGameCardsNotModified(t *testing.T) {
	ts, started, _ := newCardsServer(t)

	etag := getCards(t, ts, started.ID, nil).header.Get("ETag")
	if !regexp.MustCompile(`^"[0-9a-f]{32}"$`).MatchString(etag) {
		t.Fatalf("ETag = %q, want a quoted hex hash", etag)
	}

	tests := []struct {
		name        string
		ifNoneMatch string
		wantStatus  int
	}{
		{"same ETag", etag, http.StatusNotModified},
		{"in a list", `"other", ` + etag, http.StatusNotModified},
		{"weak form", "W/" + etag, http.StatusNotModified},
		{"wildcard", "*", http.StatusNotModified},
		{"other ETag", `"other"`, http.StatusOK},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			resp := getCards(t, ts, started.ID, map[string]string{"If-None-Match": tt.ifNoneMatch})

			if resp.status != tt.wantStatus {
				t.Fatalf("status = %d, want %d", resp.status, tt.wantStatus)
			}
			if got := resp.header.Get("ETag"); got != etag {
				t.Errorf("ETag = %q, want %q", got, etag)
			}
			if got := resp.header.Get("Cache-Control"); got != "max-age=86400, immutable" {
				t.Errorf("Cache-Control = %q", got)
			}
			if tt.wantStatus == http.StatusNotModified && len(resp.body) != 0 {
				t.Errorf("304 body = %q, want none", resp.body)
			}
		})
	}
}

func TestGameCardsUncompressed(t *testing.T) {
	ts, started, _ := newCardsServer(t)

	resp := getCards(t, ts, started.ID, map[string]string{"Accept-Encoding": "gzip"})

	if resp.status != http.StatusOK {
		t.Fatalf("status = %d, want %d: %s", resp.status, http.StatusOK, resp.body)
	}
	if got := resp.header.Get("Content-Encoding"); got != "" {
		t.Errorf("Content-Encoding = %q, want none: compression is the reverse proxy's job", got)
	}
	if !json.Valid(resp.body) {
		t.Errorf("body is not plain JSON: %.100q", resp.body)
	}
}

func TestGameCardsVaryOrigin(t *testing.T) {
	ts, started, _ := newCardsServer(t)
	etag := getCards(t, ts, started.ID, nil).header.Get("ETag")

	origins := []struct {
		name   string
		origin string
	}{
		{"no origin", ""},
		{"refused origin", "http://evil.test"},
		{"allowed origin", allowedOrigin},
	}
	replies := []struct {
		name        string
		ifNoneMatch string
		wantStatus  int
	}{
		{"full reply", "", http.StatusOK},
		{"not modified", etag, http.StatusNotModified},
	}
	for _, o := range origins {
		for _, r := range replies {
			t.Run(o.name+"/"+r.name, func(t *testing.T) {
				header := map[string]string{}
				if o.origin != "" {
					header["Origin"] = o.origin
				}
				if r.ifNoneMatch != "" {
					header["If-None-Match"] = r.ifNoneMatch
				}

				resp := getCards(t, ts, started.ID, header)

				if resp.status != r.wantStatus {
					t.Fatalf("status = %d, want %d", resp.status, r.wantStatus)
				}
				// A shared cache must not serve a reply stored for one origin
				// to another: the CORS headers differ between them.
				if got := resp.header.Values("Vary"); !slices.Contains(got, "Origin") {
					t.Errorf("Vary = %q, want Origin among them", got)
				}
			})
		}
	}
}
