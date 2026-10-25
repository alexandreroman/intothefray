package server

import (
	"context"
	"io"
	"log/slog"
	"maps"
	"net/http/httptest"
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/coder/websocket"
	"github.com/redis/go-redis/v9"

	"github.com/alexandreroman/intothefray/internal/game"
	"github.com/alexandreroman/intothefray/internal/store"
	"github.com/alexandreroman/intothefray/packs"
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

// startInstance starts a server instance backed by mr, with its background
// work running, and returns its HTTP test server. configure, when not nil,
// adjusts the server before it starts.
func startInstance(t *testing.T, mr *miniredis.Miniredis, configure func(*Server)) *httptest.Server {
	t.Helper()

	srv := newServerOn(t, mr)
	srv.deps.Decks = stubMarvelcdb(t, blackPantherDeck)
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
// coalesced, so the intermediate ones may or may not arrive. The deckSet
// acknowledgements read meanwhile are skipped.
func (c *testClient) awaitView(done func(game.View) bool) received {
	c.t.Helper()
	for {
		msg := c.read()
		if msg.Type == typeDeckSet {
			continue
		}
		if msg.Type != typeView {
			c.t.Fatalf("got message %s, want type %q", msg.raw, typeView)
		}
		if done(msg.View) {
			return msg
		}
	}
}

// playerOnline reports whether the player of v with color is online, false
// when no player holds it.
func playerOnline(v game.View, color int) bool {
	for _, p := range v.Players {
		if p.Color == color {
			return p.Online
		}
	}
	return false
}

// bothSeatedOnline tells a view of two players, both connected: once Alex
// sees it, the views relayed for Bob's join are all in.
func bothSeatedOnline(v game.View) bool {
	return len(v.Players) == 2 && v.Players[0].Online && v.Players[1].Online
}

// bobSeat is the seat of Bob, who joins a twoPlayerGame after Alex.
const bobSeat = 1

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

	cat, err := packs.Catalog()
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
	alex.awaitView(bothSeatedOnline)

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
	card := readyCardOf(t, g.bobView.View, bobSeat)

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
	alex.awaitView(bothSeatedOnline)

	alex.send(map[string]any{"type": "presence", "cursor": map[string]any{"x": 120, "y": 340}})

	got := bob.expect("presence")
	if got.Color == nil || *got.Color != alexView.View.You.Color || got.Name != "Alex" {
		t.Errorf("presence = %s, want Alex's name and colour %d", got.raw, alexView.View.You.Color)
	}
	if want := (presencePoint{X: 120, Y: 340}); got.Cursor == nil || *got.Cursor != want {
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

func TestPresenceNotRelayedToSendersOtherTab(t *testing.T) {
	mr := miniredis.RunT(t)
	first := startInstance(t, mr, nil)
	second := startInstance(t, mr, nil)
	created := createGame(t, first, "Alex")
	alex := connect(t, first, created.ID)
	alex.hello(created.Token, "Alex")
	alexOtherTab := connect(t, second, created.ID)
	alexOtherTab.hello(created.Token, "Alex")
	bob := connect(t, first, created.ID)
	bob.hello("", "Bob")
	alex.awaitView(bothSeatedOnline)

	alex.send(map[string]any{"type": "presence", "cursor": map[string]any{"x": 120, "y": 340}})
	if got := bob.awaitPresence(); got.Name != "Alex" {
		t.Fatalf("Bob got presence %s, want Alex's", got.raw)
	}

	// Bob answers after receiving Alex's cursor, so on every instance his
	// presence comes after Alex's: the first presence Alex's other tab gets
	// must be his.
	bob.send(map[string]any{"type": "presence", "preview": "c1"})
	if got := alexOtherTab.awaitPresence(); got.Name != "Bob" {
		t.Errorf("Alex's other tab got presence %s, want Bob's and never Alex's own", got.raw)
	}
}

func TestMarkerDragRelayed(t *testing.T) {
	for _, marker := range []string{game.MarkerFirstPlayer, game.MarkerActive} {
		t.Run(marker, func(t *testing.T) {
			mr := miniredis.RunT(t)
			first := startInstance(t, mr, nil)
			second := startInstance(t, mr, nil)
			created := createGame(t, first, "Alex")
			alex := connect(t, first, created.ID)
			alex.hello(created.Token, "Alex")
			bob := connect(t, second, created.ID)
			bob.hello("", "Bob")
			alex.awaitView(bothSeatedOnline)

			// A marker carries no card: the drag tells only where its corner is.
			alex.send(map[string]any{"type": "presence", "drag": map[string]any{"token": marker, "x": 160, "y": 640}})

			got := bob.expect("presence")
			want := `"drag":{"cards":[],"token":"` + marker + `","x":160,"y":640}`
			if !strings.Contains(string(got.raw), want) {
				t.Errorf("presence = %s, want it to contain %s", got.raw, want)
			}
		})
	}
}

func TestHiddenCursorRelayed(t *testing.T) {
	mr := miniredis.RunT(t)
	ts := startInstance(t, mr, nil)
	created := createGame(t, ts, "Alex")
	alex := connect(t, ts, created.ID)
	alex.hello(created.Token, "Alex")
	bob := connect(t, ts, created.ID)
	bob.hello("", "Bob")
	alex.awaitView(bothSeatedOnline)

	// Alex raises his hand or opens a dialog: his cursor goes, and nothing
	// tells where his pointer is.
	alex.send(map[string]any{"type": "presence", "cursor": nil})

	got := bob.expect("presence")
	if !strings.Contains(string(got.raw), `"cursor":null`) {
		t.Errorf("presence = %s, want the cursor hidden", got.raw)
	}
}

func TestSpectatorPresence(t *testing.T) {
	mr := miniredis.RunT(t)
	ts := startInstance(t, mr, nil)
	created := createGame(t, ts, "Alex")
	host := connect(t, ts, created.ID)
	host.hello(created.Token, "Alex")
	player := connect(t, ts, created.ID)
	player.hello("", "Carol")
	guest := connect(t, ts, created.ID)
	_, guestView := guest.hello("", "Bob")
	host.awaitView(func(v game.View) bool { return len(v.Players) == 3 })
	host.lobby("removePlayer", map[string]any{"color": guestView.View.You.Color})
	guest.awaitView(func(v game.View) bool { return v.You.Role == game.RoleSpectator })

	point := map[string]any{"x": 1, "y": 2}
	tests := []struct {
		name string
		msg  map[string]any
	}{
		{"ping", map[string]any{"ping": point}},
		{"drag", map[string]any{"drag": map[string]any{"cards": []string{"c1"}, "x": 1, "y": 2}}},
		{"cursor", map[string]any{"cursor": point}},
		{"hidden cursor", map[string]any{"cursor": nil}},
		{"preview", map[string]any{"preview": "c1"}},
	}
	for _, tt := range tests {
		msg := map[string]any{"type": "presence"}
		maps.Copy(msg, tt.msg)
		guest.send(msg)
		if reply := guest.expect("error"); reply.Code != "forbidden" {
			t.Errorf("spectator %s: error = %s, want code forbidden", tt.name, reply.raw)
		}
	}

	// Carol's presence goes through Redis after every refused message of
	// Bob: had one of them been relayed, the host would get it first.
	player.send(map[string]any{"type": "presence", "preview": "c1"})
	if got := host.awaitPresence(); got.Name != "Carol" {
		t.Errorf("host got presence %s, want Carol's and none from the spectator", got.raw)
	}
}

// awaitPresence reads messages until a presence comes, and returns it. Views
// may come before it, as the lobby changes.
func (c *testClient) awaitPresence() received {
	c.t.Helper()
	for {
		msg := c.read()
		if msg.Type == "presence" {
			return msg
		}
	}
}

func TestPresenceValidation(t *testing.T) {
	long := strings.Repeat("a", maxPresenceText+1)
	tooManyCards := make([]string, maxDragCards+1)
	for i := range tooManyCards {
		tooManyCards[i] = "c1"
	}
	point := map[string]any{"x": 1, "y": 2}
	drag := func(cards []string) map[string]any {
		return map[string]any{"cards": cards, "x": 1, "y": 2}
	}
	tokenDrag := map[string]any{"token": "active", "x": 1, "y": 2}
	tokenDragWithCards := map[string]any{"token": "active", "cards": []string{"c1"}, "x": 1, "y": 2}

	tests := []struct {
		name  string
		msg   map[string]any
		valid bool
	}{
		{"cursor", map[string]any{"cursor": point}, true},
		{"hidden cursor", map[string]any{"cursor": nil}, true},
		{"preview", map[string]any{"preview": "c1"}, true},
		{"cleared preview", map[string]any{"preview": ""}, true},
		{"drag", map[string]any{"drag": drag([]string{"c1", "c2"})}, true},
		{"ended drag", map[string]any{"drag": nil}, true},
		{"marker drag", map[string]any{"drag": tokenDrag}, true},
		{"ping", map[string]any{"ping": point}, true},
		{"nothing", map[string]any{}, false},
		{"cursor with a text x", map[string]any{"cursor": map[string]any{"x": "1", "y": 2}}, false},
		{"cursor as text", map[string]any{"cursor": "here"}, false},
		{"long preview", map[string]any{"preview": long}, false},
		{"drag without cards", map[string]any{"drag": drag([]string{})}, false},
		{"drag of too many cards", map[string]any{"drag": drag(tooManyCards)}, false},
		{"drag with a long card id", map[string]any{"drag": drag([]string{long})}, false},
		{"drag with an empty card id", map[string]any{"drag": drag([]string{""})}, false},
		{"drag as text", map[string]any{"drag": "c1"}, false},
		{"marker drag with a long name", map[string]any{"drag": map[string]any{"token": long, "x": 1, "y": 2}}, false},
		{"marker drag of an unknown marker", map[string]any{"drag": map[string]any{"token": "x", "x": 1, "y": 2}}, false},
		{"marker drag with cards", map[string]any{"drag": tokenDragWithCards}, false},
		{"ping with a text y", map[string]any{"ping": map[string]any{"x": 1, "y": "2"}}, false},
	}

	mr := miniredis.RunT(t)
	ts := startInstance(t, mr, nil)
	created := createGame(t, ts, "Alex")
	host := connect(t, ts, created.ID)
	host.hello(created.Token, "Alex")
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			msg := map[string]any{"type": "presence"}
			maps.Copy(msg, tt.msg)
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

// awaitSpectators reads views until one counts want connected spectators,
// and returns it.
func (c *testClient) awaitSpectators(want int) received {
	c.t.Helper()
	return c.awaitView(func(v game.View) bool { return v.Spectators == want })
}

func TestSpectatorCountFollowsConnections(t *testing.T) {
	mr := miniredis.RunT(t)
	first := startInstance(t, mr, nil)
	second := startInstance(t, mr, nil)
	created := createGame(t, first, "Alex")
	alex := connect(t, first, created.ID)
	alex.hello(created.Token, "Alex")
	bob := connect(t, second, created.ID)
	bobWelcome, _ := bob.hello("", "Bob")

	seated := alex.awaitView(bothSeatedOnline)
	if seated.View.Spectators != 0 {
		t.Errorf("with Bob playing: spectators = %d, want 0 as players never count", seated.View.Spectators)
	}

	bob.lobby("leave", nil)
	alex.awaitView(func(v game.View) bool { return len(v.Players) == 1 && v.Spectators == 1 })

	bob.lobby("takeSeat", nil)
	alex.awaitView(func(v game.View) bool { return len(v.Players) == 2 && v.Spectators == 0 })

	bob.lobby("leave", nil)
	watching := alex.awaitView(func(v game.View) bool { return len(v.Players) == 1 && v.Spectators == 1 })

	// Closing the tab leaves the game as it is: only the count changes.
	_ = bob.ws.Close(websocket.StatusNormalClosure, "")
	gone := alex.awaitSpectators(0)
	if gone.Version != watching.Version {
		t.Errorf("version = %d after Bob left, want %d, the game being unchanged", gone.Version, watching.Version)
	}

	back := connect(t, second, created.ID)
	back.hello(bobWelcome.Token, "Bob")
	alex.awaitSpectators(1)
}

func TestPlayerOnlineFollowsConnections(t *testing.T) {
	mr := miniredis.RunT(t)
	first := startInstance(t, mr, nil)
	second := startInstance(t, mr, nil)
	created := createGame(t, first, "Alex")
	alex := connect(t, first, created.ID)
	_, alexView := alex.hello(created.Token, "Alex")
	alexColor := alexView.View.You.Color
	if !playerOnline(alexView.View, alexColor) {
		t.Errorf("first view = %s, want Alex online in it", alexView.raw)
	}

	bob := connect(t, second, created.ID)
	bobWelcome, bobView := bob.hello("", "Bob")
	bobColor := bobView.View.You.Color
	joined := alex.awaitView(func(v game.View) bool { return playerOnline(v, bobColor) })
	if !playerOnline(joined.View, alexColor) {
		t.Errorf("with Bob in: Alex offline, want online")
	}

	// Closing the tab leaves the game as it is: only Bob's state changes.
	_ = bob.ws.Close(websocket.StatusNormalClosure, "")
	gone := alex.awaitView(func(v game.View) bool { return !playerOnline(v, bobColor) })
	if gone.Version != joined.Version {
		t.Errorf("version = %d after Bob left, want %d, the game being unchanged", gone.Version, joined.Version)
	}
	if len(gone.View.Players) != 2 || gone.View.Spectators != 0 {
		t.Errorf("after Bob left: %d players and %d spectators, want Bob still seated", len(gone.View.Players),
			gone.View.Spectators)
	}

	back := connect(t, second, created.ID)
	back.hello(bobWelcome.Token, "Bob")
	alex.awaitView(func(v game.View) bool { return playerOnline(v, bobColor) })
}

func TestLeasesKeepOnlyLiveConnections(t *testing.T) {
	const (
		interval = 20 * time.Millisecond // leases last leaseRounds intervals
		// carolLease outlasts several leases of the live connections.
		carolLease = 200 * time.Millisecond
	)

	mr := miniredis.RunT(t)
	ts := startInstance(t, mr, func(s *Server) { s.onlineInterval = interval })
	created := createGame(t, ts, "Alex")
	alex := connect(t, ts, created.ID)
	alex.hello(created.Token, "Alex")
	bob := connect(t, ts, created.ID)
	bobWelcome, _ := bob.hello("", "Bob")
	alex.awaitView(bothSeatedOnline)
	bob.lobby("leave", nil)
	alex.awaitView(func(v game.View) bool { return len(v.Players) == 1 && v.Spectators == 1 })

	// Carol watches from an instance that stops without closing her
	// connection: nothing renews her lease, nor tells that she left.
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rdb.Close() })
	vanished := store.New(rdb, time.Hour)
	_, _, err := vanished.Update(t.Context(), created.ID, func(g *game.Game) error {
		g.Spectators = append(g.Spectators, &game.Spectator{Token: "carol-token", Name: "Carol"})
		return nil
	})
	if err != nil {
		t.Fatalf("add Carol: %v", err)
	}
	carol := []store.Connection{{Token: "carol-token", ID: "tab"}}
	if _, err := vanished.KeepOnline(t.Context(), created.ID, carol, time.Now(), carolLease); err != nil {
		t.Fatalf("connect Carol: %v", err)
	}

	alex.awaitSpectators(2)
	alex.awaitSpectators(1)

	// Bob, still connected, outlives many leases of his own: the rounds
	// renew them.
	time.Sleep(5 * leaseRounds * interval)
	online, err := vanished.Online(t.Context(), created.ID, time.Now())
	if err != nil {
		t.Fatalf("Online: %v", err)
	}
	if !online[bobWelcome.Token] || online["carol-token"] {
		t.Errorf("online = %v, want Bob's token and not Carol's", online)
	}
}

// beforeRenewal is a Redis hook that runs before once, as the first lease
// renewal (a pipeline holding a ZADD) is about to reach Redis.
type beforeRenewal struct {
	once   sync.Once
	before func()
}

func (h *beforeRenewal) DialHook(next redis.DialHook) redis.DialHook { return next }

func (h *beforeRenewal) ProcessHook(next redis.ProcessHook) redis.ProcessHook { return next }

func (h *beforeRenewal) ProcessPipelineHook(next redis.ProcessPipelineHook) redis.ProcessPipelineHook {
	return func(ctx context.Context, cmds []redis.Cmder) error {
		if slices.ContainsFunc(cmds, func(cmd redis.Cmder) bool { return cmd.Name() == "zadd" }) {
			h.once.Do(h.before)
		}
		return next(ctx, cmds)
	}
}

func TestConnectionClosedDuringRenewalStopsCounting(t *testing.T) {
	mr := miniredis.RunT(t)
	srv := newServerOn(t, mr)
	hook := &beforeRenewal{}
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	rdb.AddHook(hook)
	t.Cleanup(func() { _ = rdb.Close() })
	srv.deps.Store = store.New(rdb, time.Hour)

	g, err := game.NewGame("abc", "host-token", "Alex", time.Now())
	if err != nil {
		t.Fatal(err)
	}
	if err := srv.deps.Store.Create(t.Context(), g); err != nil {
		t.Fatalf("Create: %v", err)
	}
	carol := newConn(nil, "abc", srv.deps.Logger)
	carol.token, carol.onlineID = "carol-token", "tab"
	srv.hub.register(carol)

	// Carol closes after the round listed her connection and before it
	// renews her lease: she leaves the hub and sets herself offline, as
	// serveConn does, and the renewal then records her again.
	closed := false
	hook.before = func() {
		srv.hub.remove(carol)
		srv.setOffline(t.Context(), carol)
		closed = true
	}
	srv.renewOnline(t.Context())

	if !closed {
		t.Fatal("the round renewed no lease")
	}
	online, err := srv.deps.Store.Online(t.Context(), "abc", time.Now())
	if err != nil {
		t.Fatalf("Online: %v", err)
	}
	if online["carol-token"] {
		t.Error("Carol still counts after the round, want her closed connection forgotten")
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

func TestReconnectResyncsViewers(t *testing.T) {
	mr := miniredis.RunT(t)
	ts := startInstance(t, mr, nil)
	created := createGame(t, ts, "Alex")
	alex := connect(t, ts, created.ID)
	alex.hello(created.Token, "Alex")

	// Bob joins behind the instance's back: no event tells it, as if the
	// event had been published while its subscription was down.
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rdb.Close() })
	_, _, err := store.New(rdb, time.Hour).Update(t.Context(), created.ID, func(g *game.Game) error {
		_, err := g.Join("bob-token", "Bob")
		return err
	})
	if err != nil {
		t.Fatalf("join Bob: %v", err)
	}
	mr.Close()
	if err := mr.Restart(); err != nil {
		t.Fatalf("restart Redis: %v", err)
	}

	alex.awaitView(func(v game.View) bool { return len(v.Players) == 2 })
}

// expireBlocker is a Redis hook that holds every EXPIRE command, the one a
// touch round sends, until release is closed.
type expireBlocker struct {
	entered     chan struct{}
	enteredOnce sync.Once
	release     chan struct{}
}

func (b *expireBlocker) DialHook(next redis.DialHook) redis.DialHook { return next }

func (b *expireBlocker) ProcessPipelineHook(next redis.ProcessPipelineHook) redis.ProcessPipelineHook {
	return next
}

func (b *expireBlocker) ProcessHook(next redis.ProcessHook) redis.ProcessHook {
	return func(ctx context.Context, cmd redis.Cmder) error {
		if cmd.Name() == "expire" {
			b.enteredOnce.Do(func() { close(b.entered) })
			<-b.release
		}
		return next(ctx, cmd)
	}
}

func TestSlowTouchDoesNotDelayPresence(t *testing.T) {
	mr := miniredis.RunT(t)
	blocker := &expireBlocker{entered: make(chan struct{}), release: make(chan struct{})}
	ts := startInstance(t, mr, func(s *Server) {
		rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
		rdb.AddHook(blocker)
		t.Cleanup(func() { _ = rdb.Close() })
		s.deps.Store = store.New(rdb, time.Hour)
		s.touchInterval = 10 * time.Millisecond
	})
	// Registered after startInstance, so it runs first and lets Run stop.
	t.Cleanup(func() { close(blocker.release) })

	created := createGame(t, ts, "Alex")
	alex := connect(t, ts, created.ID)
	alex.hello(created.Token, "Alex")
	bob := connect(t, ts, created.ID)
	bob.hello("", "Bob")
	alex.awaitView(bothSeatedOnline)
	select {
	case <-blocker.entered:
	case <-time.After(waitTimeout):
		t.Fatal("no touch round started")
	}

	bob.send(map[string]any{"type": "presence", "preview": "c1"})

	if got := alex.expect("presence"); got.Name != "Bob" {
		t.Errorf("presence = %s, want Bob's", got.raw)
	}
}

// loadBlocker is a Redis hook that holds every GET, the one a game load
// sends, once a first lease is recorded (a pipeline holding a ZADD), until
// release is closed.
type loadBlocker struct {
	leased      atomic.Bool
	entered     chan struct{}
	enteredOnce sync.Once
	release     chan struct{}
}

func (b *loadBlocker) DialHook(next redis.DialHook) redis.DialHook { return next }

func (b *loadBlocker) ProcessPipelineHook(next redis.ProcessPipelineHook) redis.ProcessPipelineHook {
	return func(ctx context.Context, cmds []redis.Cmder) error {
		err := next(ctx, cmds)
		if slices.ContainsFunc(cmds, func(cmd redis.Cmder) bool { return cmd.Name() == "zadd" }) {
			b.leased.Store(true)
		}
		return err
	}
}

func (b *loadBlocker) ProcessHook(next redis.ProcessHook) redis.ProcessHook {
	return func(ctx context.Context, cmd redis.Cmder) error {
		if cmd.Name() == "get" && b.leased.Load() {
			b.enteredOnce.Do(func() { close(b.entered) })
			<-b.release
		}
		return next(ctx, cmd)
	}
}

func TestViewFromBeforeJoinNotSent(t *testing.T) {
	mr := miniredis.RunT(t)
	first := startInstance(t, mr, nil)
	blocker := &loadBlocker{entered: make(chan struct{}), release: make(chan struct{})}
	var srv *Server
	second := startInstance(t, mr, func(s *Server) {
		rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
		rdb.AddHook(blocker)
		t.Cleanup(func() { _ = rdb.Close() })
		s.deps.Store = store.New(rdb, time.Hour)
		srv = s
	})
	release := sync.OnceFunc(func() { close(blocker.release) })
	// Registered after startInstance, so it runs first and lets Run stop.
	t.Cleanup(release)

	created := createGame(t, first, "Alex")
	alex := connect(t, first, created.ID)
	alex.hello(created.Token, "Alex")
	stale, staleVersion, err := srv.deps.Store.Load(t.Context(), created.ID)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}

	// Bob is the only viewer of the second instance: the first lease
	// recorded there is his, and every load that follows comes once he is
	// registered.
	bob := connect(t, second, created.ID)
	bob.send(map[string]any{"type": "hello", "token": "", "name": "Bob"})
	select {
	case <-blocker.entered:
	case <-time.After(waitTimeout):
		t.Fatal("Bob's join loaded no game")
	}

	// The event loop broadcasts the game it loaded before Bob's join, while
	// his first view is held up.
	srv.hub.broadcast(stale, staleVersion, srv.onlineAudience(t.Context(), stale))
	srv.hub.mu.Lock()
	bobConns := slices.Collect(maps.Keys(srv.hub.games[created.ID].conns))
	srv.hub.mu.Unlock()
	// A view left pending would be replaced unseen by the first view: the
	// write loop takes it before the load goes on.
	waitFor(t, "no view of Bob is pending", func() bool {
		bobConns[0].viewMu.Lock()
		defer bobConns[0].viewMu.Unlock()
		return bobConns[0].pendingView == nil
	})
	release()

	bob.expect("welcome")
	view := bob.expect("view")
	if view.Version <= staleVersion || view.View.You.Role != game.RolePlayer {
		t.Errorf("first view = version %d, role %q; want a version after %d, role %q",
			view.Version, view.View.You.Role, staleVersion, game.RolePlayer)
	}
}

// readyCardOf returns a card of owner lying ready on the table.
func readyCardOf(t *testing.T, v game.View, owner int) string {
	t.Helper()
	i := slices.IndexFunc(v.Table.Cards, func(c game.CardView) bool {
		return c.Zone == game.ZoneTable && c.Owner == owner && !c.Exhausted
	})
	if i < 0 {
		t.Fatalf("no ready card of seat %d on the table", owner)
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

// handCounts returns the hand size of each player's first deck.
func handCounts(v game.View) []int {
	counts := make([]int, len(v.Players))
	for i, p := range v.Players {
		counts[i] = p.Decks[0].HandCount
	}
	return counts
}

// ownHand returns the hand of the viewer's first seat, or nil for someone who
// does not play.
func ownHand(v game.View) []string {
	if len(v.You.Areas) == 0 {
		return nil
	}
	return v.Table.Hands[v.You.Areas[0]]
}

// handCodes returns the codes of the viewer's hand.
func handCodes(v game.View) []string {
	var codes []string
	for _, id := range ownHand(v) {
		codes = append(codes, cardOf(v, id).Code)
	}
	return codes
}

// hiddenHandCodes returns the codes of the viewer's hand that no other card
// of the view shows, so that nobody else may know them.
func hiddenHandCodes(v game.View) []string {
	shown := map[string]bool{}
	for _, c := range v.Table.Cards {
		if !slices.Contains(ownHand(v), c.ID) {
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
