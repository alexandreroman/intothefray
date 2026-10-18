package server

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/coder/websocket"

	"github.com/alexandreroman/intothefray/internal/decks"
	"github.com/alexandreroman/intothefray/internal/game"
)

const (
	// spiderManDeckLink is the second marvelcdb deck of the stub.
	spiderManDeckLink = "https://marvelcdb.com/decklist/view/2"
	// spiderManDeck is a Spider-Man deck that shares no card with
	// blackPantherDeck, so that a leaked hand card is told apart from a
	// card of the viewer's own deck.
	spiderManDeck = `{"name":"Spider-Man - Justice","hero_code":"01001a","hero_name":"Spider-Man",
		"slots":{"01002":1,"01003":2,"01004":2,"01005":3,"01006":1,"01007":2,"01008":2,"01009":2,
		"01058":1,"01059":1,"01060":3,"01061":3,"01062":2,"01063":3,"01064":3,"01065":3}}`
	// waitTimeout bounds every wait for a condition outside the messages.
	waitTimeout = 5 * time.Second
)

// stubDecklists serves blackPantherDeck as decklist 1 and spiderManDeck as
// decklist 2.
func stubDecklists(t *testing.T) *decks.Importer {
	t.Helper()

	stub := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/api/public/decklist/1":
			_, _ = io.WriteString(w, blackPantherDeck)
		case "/api/public/decklist/2":
			_, _ = io.WriteString(w, spiderManDeck)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(stub.Close)
	return &decks.Importer{BaseURL: stub.URL}
}

// startInstance starts a server instance backed by mr, with its background
// work running, and returns its HTTP test server. configure, when not nil,
// adjusts the server before it starts.
func startInstance(t *testing.T, mr *miniredis.Miniredis, configure func(*Server)) *httptest.Server {
	t.Helper()

	srv := newServerOn(t, mr)
	srv.deps.Decks = stubDecklists(t)
	if configure != nil {
		configure(srv)
	}
	ts := httptest.NewServer(srv.Handler())
	t.Cleanup(ts.Close)
	runInBackground(t, srv, mr)
	return ts
}

// runInBackground runs srv.Run until it is stopped by the returned function,
// or by the end of the test. It returns once the server is subscribed to the
// game events. Stopping waits for Run and returns its error.
func runInBackground(t *testing.T, srv *Server, mr *miniredis.Miniredis) func() error {
	t.Helper()

	subscriptions := mr.PubSubNumPat()
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- srv.Run(ctx) }()

	var result error
	stopped := false
	stop := func() error {
		if !stopped {
			cancel()
			result = <-done
			stopped = true
		}
		return result
	}
	t.Cleanup(func() { _ = stop() })

	waitFor(t, "the server subscribes to game events", func() bool {
		return mr.PubSubNumPat() > subscriptions
	})
	return stop
}

// waitFor polls cond until it holds, and fails the test after waitTimeout.
func waitFor(t *testing.T, what string, cond func() bool) {
	t.Helper()

	deadline := time.Now().Add(waitTimeout)
	for !cond() {
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting until %s", what)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

// awaitView reads views until one satisfies done, and returns it. Views are
// coalesced, so the intermediate ones may or may not arrive.
func (c *testClient) awaitView(done func(game.View) bool) received {
	c.t.Helper()
	for {
		msg := c.expect("view")
		if done(msg.View) {
			return msg
		}
	}
}

// twoPlayerGame is a game between Alex, the host on one instance, and Bob on
// another instance.
type twoPlayerGame struct {
	alex, bob           *testClient
	alexToken, bobToken string
	// alexView and bobView are the last views each player received.
	alexView, bobView received
}

// startTwoPlayerGame sets up and starts a game played by Alex with the
// Black Panther deck on one instance and by Bob with the Spider-Man deck on
// another.
func startTwoPlayerGame(t *testing.T) *twoPlayerGame {
	t.Helper()

	cat, err := testCatalog()
	if err != nil {
		t.Fatal(err)
	}
	mr := miniredis.RunT(t)
	first := startInstance(t, mr, nil)
	second := startInstance(t, mr, nil)

	created := createGame(t, first, "Alex")
	alex := connect(t, first, created.ID)
	alex.hello(created.Token, "Alex")
	bob := connect(t, second, created.ID)
	bobWelcome, _ := bob.hello("", "Bob")
	alex.awaitView(func(v game.View) bool { return len(v.Players) == 2 })

	alex.lobby("setDeck", map[string]any{"url": deckLink})
	bob.lobby("setDeck", map[string]any{"url": spiderManDeckLink})
	bothReady := func(v game.View) bool {
		return len(v.Players) == 2 && v.Players[0].Ready && v.Players[1].Ready
	}
	alex.awaitView(bothReady)

	alex.lobby("configure", map[string]any{"config": game.DefaultConfig(cat, "rhino")})
	alex.lobby("start", nil)
	playing := func(v game.View) bool { return v.Phase == game.PhasePlaying }
	return &twoPlayerGame{
		alex:      alex,
		bob:       bob,
		alexToken: created.Token,
		bobToken:  bobWelcome.Token,
		alexView:  alex.awaitView(playing),
		bobView:   bob.awaitView(playing),
	}
}

func TestTwoInstancesSeeEachOther(t *testing.T) {
	const draws = 5

	g := startTwoPlayerGame(t)
	card := readyCardIn(t, g.bobView.View, g.bobView.View.You.Area)

	g.bob.send(map[string]any{"type": "action", "id": 1, "action": map[string]any{"kind": "exhaust", "card": card}})

	exhausted := g.alex.awaitView(func(v game.View) bool { return cardOf(v, card).Exhausted })

	// Both players draw at the same time, each on their own instance.
	for i := range draws {
		draw := map[string]any{"type": "action", "id": 2 + i, "action": map[string]any{"kind": "draw", "n": 1}}
		g.alex.send(draw)
		g.bob.send(draw)
	}
	before := handCounts(exhausted.View)
	allDrawn := func(v game.View) bool {
		counts := handCounts(v)
		return counts[0] == before[0]+draws && counts[1] == before[1]+draws
	}
	g.alex.awaitView(allDrawn)
	g.bob.awaitView(allDrawn)
}

func TestFanOutUsesEachViewersToken(t *testing.T) {
	const draws = 6

	g := startTwoPlayerGame(t)
	g.alex.send(map[string]any{"type": "action", "id": 1, "action": map[string]any{"kind": "draw", "n": draws}})
	g.bob.send(map[string]any{"type": "action", "id": 1, "action": map[string]any{"kind": "draw", "n": draws}})
	allDrawn := func(v game.View) bool {
		counts := handCounts(v)
		return counts[0] == draws && counts[1] == draws
	}
	alexView := g.alex.awaitView(allDrawn)
	bobView := g.bob.awaitView(allDrawn)

	tests := []struct {
		name         string
		view, others received
		otherToken   string
	}{
		{"alex", alexView, bobView, g.bobToken},
		{"bob", bobView, alexView, g.alexToken},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			doc := string(tt.view.raw)
			own := handCodes(tt.view.View)
			if len(own) != draws {
				t.Fatalf("the view lists %d hand codes, want %d", len(own), draws)
			}
			for _, code := range own {
				if !strings.Contains(doc, `"`+code+`"`) {
					t.Errorf("the view lacks the code %s of the viewer's own hand", code)
				}
			}
			secrets := hiddenHandCodes(tt.others.View)
			if len(secrets) == 0 {
				t.Fatal("the other hand has no code hidden from the table")
			}
			for _, code := range secrets {
				if strings.Contains(doc, `"`+code+`"`) {
					t.Errorf("the view leaks the code %s of the other player's hand", code)
				}
			}
			for _, secret := range []string{tt.otherToken, `"history"`, `"seed"`} {
				if strings.Contains(doc, secret) {
					t.Errorf("the view contains %s", secret)
				}
			}
		})
	}
}

func TestPresenceRelayed(t *testing.T) {
	mr := miniredis.RunT(t)
	first := startInstance(t, mr, nil)
	second := startInstance(t, mr, nil)
	created := createGame(t, first, "Alex")
	alex := connect(t, first, created.ID)
	_, alexView := alex.hello(created.Token, "Alex")
	bob := connect(t, second, created.ID)
	bob.hello("", "Bob")
	alex.awaitView(func(v game.View) bool { return len(v.Players) == 2 })

	alex.send(map[string]any{"type": "presence", "cursor": map[string]any{"area": "p0", "x": 120, "y": 340}})

	got := bob.expect("presence")
	if got.Color == nil || *got.Color != alexView.View.You.Color || got.Name != "Alex" {
		t.Errorf("presence = %s, want Alex's name and colour %d", got.raw, alexView.View.You.Color)
	}
	if want := (presencePoint{Area: "p0", X: 120, Y: 340}); got.Cursor == nil || *got.Cursor != want {
		t.Errorf("cursor = %s, want %+v", got.raw, want)
	}
	for _, secret := range []string{created.Token, `"from"`, `"kind"`} {
		if strings.Contains(string(got.raw), secret) {
			t.Errorf("presence %s contains %s", got.raw, secret)
		}
	}
	// Bob answers after receiving Alex's cursor, so on Alex's instance his
	// presence comes after Alex's: the first presence Alex gets must be his.
	bob.send(map[string]any{"type": "presence", "preview": "c1"})
	if back := alex.expect("presence"); back.Name != "Bob" {
		t.Errorf("Alex got presence %s, want Bob's and never his own", back.raw)
	}
}

func TestSpectatorPresence(t *testing.T) {
	mr := miniredis.RunT(t)
	ts := startInstance(t, mr, nil)
	created := createGame(t, ts, "Alex")
	host := connect(t, ts, created.ID)
	host.hello(created.Token, "Alex")
	guest := connect(t, ts, created.ID)
	_, guestView := guest.hello("", "Bob")
	host.expect("view")
	host.lobby("removePlayer", map[string]any{"color": guestView.View.You.Color})
	host.expect("view")
	guest.awaitView(func(v game.View) bool { return v.You.Role == game.RoleSpectator })

	for _, field := range []string{"ping", "drag"} {
		value := map[string]any{"area": "p0", "x": 1, "y": 2}
		if field == "drag" {
			value["cards"] = []string{"c1"}
		}
		guest.send(map[string]any{"type": "presence", field: value})
		if reply := guest.expect("error"); reply.Code != "forbidden" {
			t.Errorf("spectator %s: error = %s, want code forbidden", field, reply.raw)
		}
	}
	guest.send(map[string]any{"type": "presence", "cursor": map[string]any{"area": "p0", "x": 1, "y": 2}})

	got := host.expect("presence")
	if got.Color == nil || *got.Color != -1 || got.Name != "Bob" {
		t.Errorf("presence = %s, want Bob's name and colour -1", got.raw)
	}
}

func TestPresenceValidation(t *testing.T) {
	long := strings.Repeat("a", maxPresenceText+1)
	tooManyCards := make([]string, maxDragCards+1)
	for i := range tooManyCards {
		tooManyCards[i] = "c1"
	}
	point := map[string]any{"area": "p0", "x": 1, "y": 2}
	drag := func(cards []string) map[string]any {
		return map[string]any{"cards": cards, "area": "p0", "x": 1, "y": 2}
	}

	tests := []struct {
		name  string
		msg   map[string]any
		valid bool
	}{
		{"cursor", map[string]any{"cursor": point}, true},
		{"preview", map[string]any{"preview": "c1"}, true},
		{"cleared preview", map[string]any{"preview": ""}, true},
		{"drag", map[string]any{"drag": drag([]string{"c1", "c2"})}, true},
		{"ended drag", map[string]any{"drag": nil}, true},
		{"ping", map[string]any{"ping": point}, true},
		{"nothing", map[string]any{}, false},
		{"cursor without area", map[string]any{"cursor": map[string]any{"x": 1, "y": 2}}, false},
		{"cursor with a long area", map[string]any{"cursor": map[string]any{"area": long, "x": 1, "y": 2}}, false},
		{"cursor with a text x", map[string]any{"cursor": map[string]any{"area": "p0", "x": "1", "y": 2}}, false},
		{"long preview", map[string]any{"preview": long}, false},
		{"drag without cards", map[string]any{"drag": drag([]string{})}, false},
		{"drag of too many cards", map[string]any{"drag": drag(tooManyCards)}, false},
		{"drag with a long card id", map[string]any{"drag": drag([]string{long})}, false},
		{"drag with an empty card id", map[string]any{"drag": drag([]string{""})}, false},
		{"drag as text", map[string]any{"drag": "c1"}, false},
		{"ping without area", map[string]any{"ping": map[string]any{"x": 1}}, false},
	}

	mr := miniredis.RunT(t)
	ts := startInstance(t, mr, nil)
	created := createGame(t, ts, "Alex")
	host := connect(t, ts, created.ID)
	host.hello(created.Token, "Alex")
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			msg := map[string]any{"type": "presence"}
			for k, v := range tt.msg {
				msg[k] = v
			}
			host.send(msg)
			// A draw in the lobby is answered with a phase error: when it
			// comes first, the presence message got no answer.
			host.send(map[string]any{"type": "action", "id": 1, "action": map[string]any{"kind": "draw", "n": 1}})

			reply := host.expect("error")
			if tt.valid && reply.Code != "phase" {
				t.Errorf("got %s, want the presence message accepted", reply.raw)
			}
			if !tt.valid {
				if reply.Code != "invalid" {
					t.Errorf("got %s, want code invalid", reply.raw)
				}
				host.expect("error") // the phase error
			}
		})
	}
}

func TestPresenceRateLimit(t *testing.T) {
	start := time.Now()
	limiter := rateLimiter{limit: maxPresencePerSecond}

	for i := range maxPresencePerSecond {
		if !limiter.allow(start.Add(time.Duration(i) * time.Millisecond)) {
			t.Fatalf("message %d refused, want %d allowed per second", i+1, maxPresencePerSecond)
		}
	}
	if limiter.allow(start.Add(500 * time.Millisecond)) {
		t.Errorf("message %d allowed within the same second", maxPresencePerSecond+1)
	}
	if !limiter.allow(start.Add(time.Second)) {
		t.Error("message refused once the second is over")
	}
}

func TestPresenceNeverDropsSlowViewer(t *testing.T) {
	c := newConn(nil, "game", slog.New(slog.NewTextHandler(io.Discard, nil)))
	for range sendQueueSize/2 + 1 {
		c.send(errorMessage{Type: typeError, Code: codeInvalid})
	}

	c.sendPresence([]byte(`{"type":"presence"}`))

	if got := len(c.queue); got != sendQueueSize/2+1 {
		t.Errorf("queue holds %d messages, want the presence dropped at more than half full", got)
	}
	for range sendQueueSize {
		c.sendPresence([]byte(`{"type":"presence"}`))
	}
	select {
	case <-c.tooSlow:
		t.Error("presence marked the viewer too slow")
	default:
	}
}

func TestShutdownClosesConnections(t *testing.T) {
	mr := miniredis.RunT(t)
	srv := newServerOn(t, mr)
	ts := httptest.NewServer(srv.Handler())
	t.Cleanup(ts.Close)
	stop := runInBackground(t, srv, mr)
	created := createGame(t, ts, "Alex")
	joined := connect(t, ts, created.ID)
	joined.hello(created.Token, "Alex")
	silent := connect(t, ts, created.ID)

	if err := stop(); err != nil {
		t.Fatalf("Run = %v, want nil after the context ends", err)
	}

	late := connect(t, ts, created.ID)
	for name, c := range map[string]*testClient{"joined": joined, "before hello": silent, "after shutdown": late} {
		if _, err := drain(t, c.ws); websocket.CloseStatus(err) != websocket.StatusGoingAway {
			t.Errorf("%s: read ended with %v, want close status %v", name, err, websocket.StatusGoingAway)
		}
	}
}

func TestTouchKeepsConnectedGamesAlive(t *testing.T) {
	const (
		rounds = 2
		step   = 40 * time.Minute // GAME_TTL is 1 h in tests
	)

	mr := miniredis.RunT(t)
	ts := startInstance(t, mr, func(s *Server) { s.touchInterval = 10 * time.Millisecond })
	watched := createGame(t, ts, "Alex")
	idle := createGame(t, ts, "Bob")
	viewer := connect(t, ts, watched.ID)
	viewer.hello(watched.Token, "Alex")

	for range rounds {
		mr.FastForward(step)
		waitFor(t, "the watched game is touched", func() bool {
			return mr.TTL("game:"+watched.ID) > time.Hour-step
		})
	}

	if !mr.Exists("game:" + watched.ID) {
		t.Error("the game with a connected viewer expired")
	}
	if mr.Exists("game:" + idle.ID) {
		t.Error("the game without viewers is still stored, want it expired")
	}
}

// readyCardIn returns a card lying ready on the table in area.
func readyCardIn(t *testing.T, v game.View, area game.Area) string {
	t.Helper()
	i := slices.IndexFunc(v.Table.Cards, func(c game.CardView) bool {
		return c.Zone == game.ZoneTable && c.Area == area && !c.Exhausted
	})
	if i < 0 {
		t.Fatalf("no ready card in area %s", area)
	}
	return v.Table.Cards[i].ID
}

// cardOf returns the card with id in v, or a zero card when v does not list
// it.
func cardOf(v game.View, id string) game.CardView {
	if v.Table == nil {
		return game.CardView{}
	}
	i := slices.IndexFunc(v.Table.Cards, func(c game.CardView) bool { return c.ID == id })
	if i < 0 {
		return game.CardView{}
	}
	return v.Table.Cards[i]
}

func handCounts(v game.View) []int {
	counts := make([]int, len(v.Players))
	for i, p := range v.Players {
		counts[i] = p.HandCount
	}
	return counts
}

// handCodes returns the codes of the viewer's hand.
func handCodes(v game.View) []string {
	var codes []string
	for _, id := range v.Table.Hand {
		codes = append(codes, cardOf(v, id).Code)
	}
	return codes
}

// hiddenHandCodes returns the codes of the viewer's hand that no other card
// of the view shows, so that nobody else may know them.
func hiddenHandCodes(v game.View) []string {
	shown := map[string]bool{}
	for _, c := range v.Table.Cards {
		if !slices.Contains(v.Table.Hand, c.ID) {
			shown[c.Code] = true
		}
	}
	var hidden []string
	for _, code := range handCodes(v) {
		if !shown[code] {
			hidden = append(hidden, code)
		}
	}
	return hidden
}
