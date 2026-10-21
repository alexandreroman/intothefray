package server

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"reflect"
	"regexp"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"

	"github.com/alexandreroman/intothefray/internal/decks"
	"github.com/alexandreroman/intothefray/internal/game"
)

const (
	// readTimeoutInTests bounds every wait for a server message.
	readTimeoutInTests = 5 * time.Second
	// deckLink is a marvelcdb link; the importer of the test server fetches
	// it from a stub instead.
	deckLink = "https://marvelcdb.com/decklist/view/1"
	// blackPantherDeck is the Black Panther starter deck, as marvelcdb
	// serves it.
	blackPantherDeck = `{"name":"Black Panther - Starter","hero_code":"01040a","hero_name":"Black Panther",
		"slots":{"01041":1,"01042":1,"01043a":1,"01043b":1,"01043c":1,"01043d":2,"01044":3,"01045":1,
		"01046":1,"01047":1,"01048":1,"01049":1,"01075":1,"01076":1,"01077":2,"01078":2,"01079":2,
		"01080":2,"01081":2,"01082":2,"01083":1,"01084":1,"01085":1,"01086":1,"01087":1,"01088":1,
		"01089":1,"01090":1,"01091":1,"01092":1,"01093":1}}`
)

// received is any server message, decoded into the union of their fields.
type received struct {
	Type        string              `json:"type"`
	Token       string              `json:"token"`
	Role        game.Role           `json:"role"`
	Version     int64               `json:"version"`
	View        game.View           `json:"view"`
	ID          int64               `json:"id"`
	Code        string              `json:"code"`
	Message     string              `json:"message"`
	Unsupported []decks.Unsupported `json:"unsupported"`
	// presence; Color is a pointer as 0 is a valid colour.
	Color  *int           `json:"color"`
	Name   string         `json:"name"`
	Cursor *presencePoint `json:"cursor"`
	raw    []byte
}

// testClient is a viewer connected to the test server.
type testClient struct {
	t  *testing.T
	ws *websocket.Conn
}

func connect(t *testing.T, ts *httptest.Server, gameID string) *testClient {
	t.Helper()
	return connectWith(t, ts, gameID, &websocket.DialOptions{})
}

func connectWith(t *testing.T, ts *httptest.Server, gameID string, opts *websocket.DialOptions) *testClient {
	t.Helper()

	opts.HTTPHeader = http.Header{"Origin": {allowedOrigin}}
	// After a successful handshake the response body is not a real stream.
	ws, _, err := websocket.Dial(t.Context(), wsURL(ts, gameID), opts) //nolint:bodyclose // see above
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	ws.SetReadLimit(-1)
	t.Cleanup(func() { _ = ws.CloseNow() })
	return &testClient{t: t, ws: ws}
}

func (c *testClient) send(msg any) {
	c.t.Helper()
	if err := wsjson.Write(c.t.Context(), c.ws, msg); err != nil {
		c.t.Fatalf("send %v: %v", msg, err)
	}
}

func (c *testClient) read() received {
	c.t.Helper()

	ctx, cancel := context.WithTimeout(c.t.Context(), readTimeoutInTests)
	defer cancel()
	_, data, err := c.ws.Read(ctx)
	if err != nil {
		c.t.Fatalf("read: %v", err)
	}
	var msg received
	if err := json.Unmarshal(data, &msg); err != nil {
		c.t.Fatalf("decode %s: %v", data, err)
	}
	msg.raw = data
	return msg
}

// expect reads the next message and fails unless it has type want.
func (c *testClient) expect(want string) received {
	c.t.Helper()
	msg := c.read()
	if msg.Type != want {
		c.t.Fatalf("got message %s, want type %q", msg.raw, want)
	}
	return msg
}

// hello joins the game and returns the welcome and the first view.
func (c *testClient) hello(token, name string) (received, received) {
	c.t.Helper()
	c.send(map[string]any{"type": "hello", "token": token, "name": name})
	return c.expect("welcome"), c.expect("view")
}

func (c *testClient) lobby(op string, fields map[string]any) {
	c.t.Helper()
	msg := map[string]any{"type": "lobby", "op": op}
	for k, v := range fields {
		msg[k] = v
	}
	c.send(msg)
}

// stubMarvelcdb serves deck as decklist 1 and names card 99999.
func stubMarvelcdb(t *testing.T, deck string) *decks.Importer {
	t.Helper()

	stub := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/api/public/decklist/1":
			_, _ = w.Write([]byte(deck))
		case "/api/public/card/99999":
			_, _ = w.Write([]byte(`{"name":"Mystery Card","pack_name":"Future Pack"}`))
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(stub.Close)
	return &decks.Importer{BaseURL: stub.URL}
}

func TestHelloThenView(t *testing.T) {
	ts, _ := newTestServer(t)
	created := createGame(t, ts, "Alex")
	host := connect(t, ts, created.ID)

	welcome, view := host.hello(created.Token, "Alex")

	if welcome.Token != created.Token || welcome.Role != game.RolePlayer {
		t.Errorf("welcome = token %q role %q, want the host token and role player", welcome.Token, welcome.Role)
	}
	if view.View.Phase != game.PhaseLobby {
		t.Errorf("phase = %q, want lobby", view.View.Phase)
	}
	if !view.View.You.Host || view.Version < 1 {
		t.Errorf("view = %s, want the host's view with a version", view.raw)
	}
}

func TestHelloWithUnknownTokenGetsFreshToken(t *testing.T) {
	ts, _ := newTestServer(t)
	created := createGame(t, ts, "Alex")
	host := connect(t, ts, created.ID)
	host.hello(created.Token, "Alex")
	guest := connect(t, ts, created.ID)

	welcome, view := guest.hello("not-a-known-token", "Bob")

	if !regexp.MustCompile(`^[A-Za-z0-9_-]{43}$`).MatchString(welcome.Token) {
		t.Errorf("token = %q, want a fresh 43-character base64url token", welcome.Token)
	}
	if welcome.Role != game.RolePlayer || view.View.You.Name != "Bob" {
		t.Errorf("welcome role %q, view of %q; want player Bob", welcome.Role, view.View.You.Name)
	}
	// The host gets Bob's arrival as a view of its own, without Bob's token.
	hostView := host.expect("view")
	if len(hostView.View.Players) != 2 || hostView.View.You.Name != "Alex" {
		t.Errorf("host view = %s, want Alex's view with two players", hostView.raw)
	}
	if strings.Contains(string(hostView.raw), welcome.Token) {
		t.Error("the host view contains Bob's token")
	}
	if strings.Contains(string(view.raw), created.Token) {
		t.Error("Bob's view contains the host token")
	}
}

func TestActionErrorCode(t *testing.T) {
	ts, _ := newTestServer(t)
	created := createGame(t, ts, "Alex")
	host := connect(t, ts, created.ID)
	host.hello(created.Token, "Alex")

	host.send(map[string]any{"type": "action", "id": 7, "action": map[string]any{"kind": "draw", "n": 1}})

	reply := host.expect("error")
	if reply.Code != "phase" || reply.ID != 7 {
		t.Errorf("error = %s, want code phase with id 7", reply.raw)
	}
	if reply.Message == "" || strings.Contains(reply.Message, "game:") {
		t.Errorf("message = %q, want a fixed text without error details", reply.Message)
	}
}

func TestUnknownMessageKeepsConnection(t *testing.T) {
	ts, _ := newTestServer(t)
	created := createGame(t, ts, "Alex")
	host := connect(t, ts, created.ID)

	host.send(map[string]any{"type": "action", "id": 1, "action": map[string]any{"kind": "draw", "n": 1}})
	if reply := host.expect("error"); reply.Code != "invalid" {
		t.Errorf("before hello: error = %s, want code invalid", reply.raw)
	}

	host.hello(created.Token, "Alex")
	host.send(map[string]any{"type": "dance"})
	if reply := host.expect("error"); reply.Code != "invalid" {
		t.Errorf("unknown type: error = %s, want code invalid", reply.raw)
	}
	host.lobby("juggle", nil)
	if reply := host.expect("error"); reply.Code != "invalid" {
		t.Errorf("unknown lobby op: error = %s, want code invalid", reply.raw)
	}

	host.send(map[string]any{"type": "action", "id": 2, "action": map[string]any{"kind": "draw", "n": 1}})
	if reply := host.expect("error"); reply.Code != "phase" {
		t.Errorf("after the unknown messages: error = %s, want code phase", reply.raw)
	}
}

func TestRemovePlayerByColor(t *testing.T) {
	ts, _ := newTestServer(t)
	created := createGame(t, ts, "Alex")
	host := connect(t, ts, created.ID)
	host.hello(created.Token, "Alex")
	guest := connect(t, ts, created.ID)
	_, guestView := guest.hello("", "Bob")
	host.expect("view")

	host.lobby("removePlayer", map[string]any{"color": 3})
	if reply := host.expect("error"); reply.Code != "invalid" {
		t.Errorf("unknown colour: error = %s, want code invalid", reply.raw)
	}

	host.lobby("removePlayer", map[string]any{"color": guestView.View.You.Color})
	view := host.expect("view")
	if len(view.View.Players) != 1 || view.View.Spectators != 1 {
		t.Errorf("host view = %s, want one player and one spectator", view.raw)
	}
	if role := guest.expect("view").View.You.Role; role != game.RoleSpectator {
		t.Errorf("guest role = %q, want spectator", role)
	}
}

func TestSendViewResendsWhenOnlyTheAudienceChanges(t *testing.T) {
	g, err := game.NewGame("abc", "host-token", "Alex", time.Now())
	if err != nil {
		t.Fatal(err)
	}
	c := newConn(nil, "abc", slog.New(slog.NewTextHandler(io.Discard, nil)))
	host := g.Players[0].Color

	// Each step builds on the views sent by the previous ones. A nil
	// audience is one that could not be read.
	steps := []struct {
		name     string
		version  int64
		audience *game.Audience
		sent     bool
		// wantSpectators and wantOnline tell the audience of the view sent.
		wantSpectators int
		wantOnline     bool
	}{
		{"first view", 2, &game.Audience{Spectators: 1}, true, 1, false},
		{"same version and audience", 2, &game.Audience{Spectators: 1}, false, 0, false},
		{"same version, new count", 2, &game.Audience{Spectators: 3}, true, 3, false},
		{"same version, player online", 2, &game.Audience{Spectators: 3, Players: []int{host}}, true, 3, true},
		{"older version", 1, &game.Audience{Spectators: 5}, false, 0, false},
		{"same version, unknown audience", 2, nil, false, 0, false},
		{"new version, unknown audience", 3, nil, true, 3, true},
		{"same version, player offline", 3, &game.Audience{Spectators: 3}, true, 3, false},
	}
	for _, step := range steps {
		c.sendView(g, step.version, step.audience)

		data := c.takeView()
		if !step.sent {
			if data != nil {
				t.Errorf("%s: sent %s, want nothing", step.name, data)
			}
			continue
		}
		if data == nil {
			t.Fatalf("%s: sent nothing, want a view", step.name)
		}
		var msg received
		if err := json.Unmarshal(data, &msg); err != nil {
			t.Fatalf("%s: decode %s: %v", step.name, data, err)
		}
		view := msg.View
		if msg.Version != step.version || view.Spectators != step.wantSpectators {
			t.Errorf("%s: sent version %d with %d spectators, want version %d with %d",
				step.name, msg.Version, view.Spectators, step.version, step.wantSpectators)
		}
		if online := view.Players[0].Online; online != step.wantOnline {
			t.Errorf("%s: host online = %v, want %v", step.name, online, step.wantOnline)
		}
	}
}

func TestDeckErrorMessage(t *testing.T) {
	deck := strings.Replace(blackPantherDeck, `"slots":{`, `"slots":{"99999":2,`, 1)
	ts, _ := newTestServerWith(t, func(s *Server) { s.deps.Decks = stubMarvelcdb(t, deck) })
	created := createGame(t, ts, "Alex")
	host := connect(t, ts, created.ID)
	host.hello(created.Token, "Alex")

	host.lobby("setDeck", map[string]any{"url": deckLink})

	reply := host.expect("deckError")
	want := []decks.Unsupported{{Code: "99999", Name: "Mystery Card", Pack: "Future Pack", Qty: 2}}
	if !reflect.DeepEqual(reply.Unsupported, want) {
		t.Errorf("unsupported = %+v, want %+v", reply.Unsupported, want)
	}
	// No view follows: the game did not change.
	host.send(map[string]any{"type": "action", "id": 1, "action": map[string]any{"kind": "draw", "n": 1}})
	host.expect("error")
}

func TestDeckLinkError(t *testing.T) {
	ts, _ := newTestServer(t)
	created := createGame(t, ts, "Alex")
	host := connect(t, ts, created.ID)
	host.hello(created.Token, "Alex")

	host.lobby("setDeck", map[string]any{"url": "https://example.com/decklist/view/1"})

	if reply := host.expect("error"); reply.Code != "deck" || reply.Message == "" {
		t.Errorf("error = %s, want code deck with a message", reply.raw)
	}
}

func TestSetDeckHeroTaken(t *testing.T) {
	ts, _ := newTestServerWith(t, func(s *Server) { s.deps.Decks = stubDecklists(t) })
	created := createGame(t, ts, "Alex")
	host := connect(t, ts, created.ID)
	host.hello(created.Token, "Alex")
	guest := connect(t, ts, created.ID)
	guest.hello("", "Sam")
	host.expect("view")
	// Every change below reaches the host as a view, in order.
	guest.lobby("setDeck", map[string]any{"url": deckLink})
	host.expect("view")

	host.lobby("setDeck", map[string]any{"url": deckLink})

	reply := host.expect("error")
	want := "Black Panther (T'Challa) is already at the table."
	if reply.Code != "deck" || reply.Message != want {
		t.Errorf("error = %s, want code deck with %q", reply.raw, want)
	}

	host.lobby("setDeck", map[string]any{"url": spiderManDeckLink})
	host.expect("view")
	host.lobby("addDeck", nil)
	host.expect("view")

	host.lobby("setDeck", map[string]any{"url": spiderManDeckLink, "deck": 1})

	reply = host.expect("error")
	want = "Spider-Man (Peter Parker) is already at the table."
	if reply.Code != "deck" || reply.Message != want {
		t.Errorf("error = %s, want code deck with %q", reply.raw, want)
	}
}

func TestStartThenAct(t *testing.T) {
	ts, _ := newTestServerWith(t, func(s *Server) { s.deps.Decks = stubMarvelcdb(t, blackPantherDeck) })
	cat, err := testCatalog()
	if err != nil {
		t.Fatal(err)
	}
	created := createGame(t, ts, "Alex")
	host := connect(t, ts, created.ID)
	host.hello(created.Token, "Alex")

	host.lobby("setDeck", map[string]any{"url": deckLink})
	host.expect("view")
	host.lobby("configure", map[string]any{"config": game.DefaultConfig(cat, "rhino")})
	host.expect("view")
	host.lobby("start", nil)
	started := host.expect("view")
	host.send(map[string]any{"type": "action", "id": 1, "action": map[string]any{"kind": "draw", "n": 1}})
	drawn := host.expect("view")

	if started.View.Phase != game.PhasePlaying || started.View.Table == nil {
		t.Fatalf("view after start = %s, want a table in play", started.raw)
	}
	if got := len(ownHand(drawn.View)); got != len(ownHand(started.View))+1 {
		t.Errorf("hand has %d cards after the draw, want %d", got, len(ownHand(started.View))+1)
	}
	if drawn.Version <= started.Version {
		t.Errorf("version %d after the draw, want more than %d", drawn.Version, started.Version)
	}
	for _, secret := range []string{`"history"`, `"seed"`, `"events"`} {
		if strings.Contains(string(drawn.raw), secret) {
			t.Errorf("the view contains %s", secret)
		}
	}
}

// smallSocketBuffer shrinks the kernel buffers of the slow client's
// connection, so that a client that never reads fills them after a few
// messages instead of megabytes.
const smallSocketBuffer = 4 << 10

// smallBufferListener shrinks the send buffer of every accepted connection.
type smallBufferListener struct {
	net.Listener
}

func (l smallBufferListener) Accept() (net.Conn, error) {
	conn, err := l.Listener.Accept()
	if tcp, ok := conn.(*net.TCPConn); ok {
		_ = tcp.SetWriteBuffer(smallSocketBuffer)
	}
	return conn, err
}

// newSmallBufferServer starts a test server whose sockets have small send
// buffers.
func newSmallBufferServer(t *testing.T) *httptest.Server {
	t.Helper()

	srv, _ := newServer(t)
	ts := httptest.NewUnstartedServer(srv.Handler())
	ts.Listener = smallBufferListener{Listener: ts.Listener}
	ts.Start()
	t.Cleanup(ts.Close)
	return ts
}

// connectSlow connects a client with a small receive buffer.
func connectSlow(t *testing.T, ts *httptest.Server, gameID string) *testClient {
	t.Helper()
	return connectWith(t, ts, gameID, &websocket.DialOptions{HTTPClient: smallReadBufferClient()})
}

func TestSlowClientIsDropped(t *testing.T) {
	const requests = 50000

	ts := newSmallBufferServer(t)
	created := createGame(t, ts, "Alex")
	slow := connectSlow(t, ts, created.ID)
	slow.hello(created.Token, "Alex")
	fast := connect(t, ts, created.ID)
	fast.hello("", "Bob")

	// Every unknown message is answered with an error, which goes through
	// the bounded queue, and the slow client never reads the answers.
	for range requests {
		if err := wsjson.Write(t.Context(), slow.ws, map[string]any{"type": "dance"}); err != nil {
			break // already dropped
		}
	}

	read, err := drain(t, slow.ws)
	if status := websocket.CloseStatus(err); status != websocket.StatusPolicyViolation {
		t.Fatalf("slow client read %d messages then %v, want close status %v",
			read, err, websocket.StatusPolicyViolation)
	}
	if read >= requests {
		t.Errorf("slow client read %d messages, want it dropped before %d", read, requests)
	}
	// The other viewer is unaffected.
	fast.lobby("leave", nil)
	fast.expect("view")
}

func TestSlowViewReaderIsKept(t *testing.T) {
	const updates = 600

	ts := newSmallBufferServer(t)
	created := createGame(t, ts, "Alex")
	slow := connectSlow(t, ts, created.ID)
	slow.hello(created.Token, "Alex")
	fast := connect(t, ts, created.ID)
	fast.hello("", "Bob")
	slow.expect("view") // Bob's arrival

	// Bob leaves his seat and takes it back: every change sends both
	// viewers a view, and the slow one does not read them yet.
	var latest int64
	for i := range updates {
		fast.lobby([]string{"leave", "takeSeat"}[i%2], nil)
		latest = fast.expect("view").Version
	}

	// The slow viewer was not dropped: it skips the versions it missed and
	// ends on the latest one.
	read := 0
	for {
		msg := slow.expect("view")
		read++
		if msg.Version == latest {
			break
		}
	}
	if read >= updates {
		t.Errorf("slow viewer read %d views, want the intermediate versions skipped", read)
	}
}

func TestPanicIsAnsweredAsInternal(t *testing.T) {
	var clockBroken atomic.Bool
	ts, _ := newTestServerWith(t, func(s *Server) {
		s.deps.Now = func() time.Time {
			if clockBroken.Load() {
				panic("clock broke")
			}
			return time.Now()
		}
	})
	created := createGame(t, ts, "Alex")
	host := connect(t, ts, created.ID)
	host.hello(created.Token, "Alex")

	// Actions read the clock, which now panics.
	clockBroken.Store(true)
	host.send(map[string]any{"type": "action", "id": 3, "action": map[string]any{"kind": "draw", "n": 1}})

	reply := host.expect("error")
	if reply.Code != "internal" || reply.ID != 3 || strings.Contains(reply.Message, "clock") {
		t.Errorf("error = %s, want code internal with id 3 and a fixed message", reply.raw)
	}
	// The connection, and the store, still work.
	host.lobby("takeSeat", nil)
	host.expect("view")
}

func TestSecondHelloIsRefused(t *testing.T) {
	ts, _ := newTestServer(t)
	created := createGame(t, ts, "Alex")
	host := connect(t, ts, created.ID)
	host.hello(created.Token, "Alex")

	host.send(map[string]any{"type": "hello", "token": created.Token, "name": "Alex"})

	if reply := host.expect("error"); reply.Code != "invalid" {
		t.Errorf("error = %s, want code invalid", reply.raw)
	}
}

func TestMalformedActionKeepsItsID(t *testing.T) {
	ts, _ := newTestServer(t)
	created := createGame(t, ts, "Alex")
	host := connect(t, ts, created.ID)
	host.hello(created.Token, "Alex")

	host.send(map[string]any{"type": "action", "id": 9, "action": "not an action"})

	if reply := host.expect("error"); reply.Code != "invalid" || reply.ID != 9 {
		t.Errorf("error = %s, want code invalid with id 9", reply.raw)
	}
}

func TestMessageOverReadLimitClosesConnection(t *testing.T) {
	ts, _ := newTestServer(t)
	created := createGame(t, ts, "Alex")
	host := connect(t, ts, created.ID)
	big := `{"type":"hello","name":"` + strings.Repeat("a", maxMessageBytes) + `"}`

	if err := host.ws.Write(t.Context(), websocket.MessageText, []byte(big)); err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithTimeout(t.Context(), readTimeoutInTests)
	defer cancel()
	_, _, err := host.ws.Read(ctx)
	if status := websocket.CloseStatus(err); status != websocket.StatusMessageTooBig {
		t.Errorf("read = %v, want close status %v", err, websocket.StatusMessageTooBig)
	}
}

// smallReadBufferClient dials connections with a small receive buffer.
func smallReadBufferClient() *http.Client {
	dialer := &net.Dialer{}
	transport := &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			conn, err := dialer.DialContext(ctx, network, addr)
			if tcp, ok := conn.(*net.TCPConn); ok {
				_ = tcp.SetReadBuffer(smallSocketBuffer)
			}
			return conn, err
		},
	}
	return &http.Client{Transport: transport}
}

// drain reads messages until the connection fails and returns how many it
// read, with the error that ended it.
func drain(t *testing.T, ws *websocket.Conn) (int, error) {
	t.Helper()

	ctx, cancel := context.WithTimeout(t.Context(), 30*time.Second)
	defer cancel()
	for n := 0; ; n++ {
		if _, _, err := ws.Read(ctx); err != nil {
			return n, err
		}
	}
}

// startSolo loads the Black Panther deck into the host's first slot,
// configures Rhino and starts the game, then returns the view after the start.
func startSolo(t *testing.T, host *testClient) received {
	t.Helper()

	cat, err := testCatalog()
	if err != nil {
		t.Fatal(err)
	}
	host.lobby("setDeck", map[string]any{"url": deckLink})
	host.expect("view")
	host.lobby("configure", map[string]any{"config": game.DefaultConfig(cat, "rhino")})
	host.expect("view")
	host.lobby("start", nil)
	return host.expect("view")
}

func TestLobbyAddDeck(t *testing.T) {
	ts, _ := newTestServer(t)
	created := createGame(t, ts, "Alex")
	host := connect(t, ts, created.ID)
	host.hello(created.Token, "Alex")

	host.lobby("addDeck", nil)

	view := host.expect("view")
	if len(view.View.Players) != 1 || len(view.View.Players[0].Decks) != 2 {
		t.Errorf("view = %s, want one player with 2 deck slots", view.raw)
	}
}

func TestLobbyRemoveDeck(t *testing.T) {
	ts, _ := newTestServerWith(t, func(s *Server) { s.deps.Decks = stubMarvelcdb(t, blackPantherDeck) })
	created := createGame(t, ts, "Alex")
	host := connect(t, ts, created.ID)
	host.hello(created.Token, "Alex")
	host.lobby("addDeck", nil)
	host.expect("view")
	host.lobby("setDeck", map[string]any{"url": deckLink, "deck": 1})
	host.expect("view")

	// Removing the empty first slot leaves the loaded one, moved down.
	host.lobby("removeDeck", map[string]any{"deck": 0})

	view := host.expect("view")
	slots := view.View.Players[0].Decks
	if len(slots) != 1 || !slots[0].Ready || slots[0].HeroName != "Black Panther" {
		t.Errorf("deck slots = %+v, want the Black Panther deck alone", slots)
	}
	host.lobby("removeDeck", map[string]any{"deck": 0})
	if reply := host.expect("error"); reply.Code != "invalid" {
		t.Errorf("removing the last slot: error = %s, want code invalid", reply.raw)
	}
}

func TestSetDeckSlot(t *testing.T) {
	ts, _ := newTestServerWith(t, func(s *Server) { s.deps.Decks = stubMarvelcdb(t, blackPantherDeck) })
	created := createGame(t, ts, "Alex")
	host := connect(t, ts, created.ID)
	host.hello(created.Token, "Alex")
	host.lobby("addDeck", nil)
	host.expect("view")

	host.lobby("setDeck", map[string]any{"url": deckLink, "deck": 1})

	view := host.expect("view")
	slots := view.View.Players[0].Decks
	if len(slots) != 2 {
		t.Fatalf("view = %s, want 2 deck slots", view.raw)
	}
	if slots[0].Ready {
		t.Errorf("slot 0 = %+v, want it empty", slots[0])
	}
	if !slots[1].Ready || slots[1].HeroName != "Black Panther" {
		t.Errorf("slot 1 = %+v, want the Black Panther deck", slots[1])
	}
}

func TestActionSeatAbsent(t *testing.T) {
	ts, _ := newTestServerWith(t, func(s *Server) { s.deps.Decks = stubMarvelcdb(t, blackPantherDeck) })
	created := createGame(t, ts, "Alex")
	host := connect(t, ts, created.ID)
	host.hello(created.Token, "Alex")
	started := startSolo(t, host)

	host.send(map[string]any{"type": "action", "id": 1, "action": map[string]any{"kind": "draw", "n": 1}})

	drawn := host.expect("view")
	if got, want := len(ownHand(drawn.View)), len(ownHand(started.View))+1; got != want {
		t.Errorf("first seat's hand has %d cards after the draw, want %d", got, want)
	}
}

func TestActionSeatForeign(t *testing.T) {
	ts, _ := newTestServerWith(t, func(s *Server) { s.deps.Decks = stubDecklists(t) })
	cat, err := testCatalog()
	if err != nil {
		t.Fatal(err)
	}
	created := createGame(t, ts, "Alex")
	host := connect(t, ts, created.ID)
	host.hello(created.Token, "Alex")
	guest := connect(t, ts, created.ID)
	guest.hello("", "Bob")
	host.expect("view")
	// Every change below reaches the host as a view, in order.
	host.lobby("setDeck", map[string]any{"url": deckLink})
	host.expect("view")
	guest.lobby("setDeck", map[string]any{"url": spiderManDeckLink})
	host.expect("view")
	host.lobby("configure", map[string]any{"config": game.DefaultConfig(cat, "rhino")})
	host.expect("view")
	host.lobby("start", nil)
	host.expect("view")

	// Seat 1 is Bob's deck.
	host.send(map[string]any{"type": "action", "id": 4, "seat": 1, "action": map[string]any{"kind": "draw", "n": 1}})

	if reply := host.expect("error"); reply.Code != "forbidden" || reply.ID != 4 {
		t.Errorf("error = %s, want code forbidden with id 4", reply.raw)
	}
}
