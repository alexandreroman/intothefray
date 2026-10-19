package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"runtime/debug"
	"slices"
	"sync"
	"time"

	"github.com/coder/websocket"

	"github.com/alexandreroman/intothefray/internal/decks"
	"github.com/alexandreroman/intothefray/internal/game"
	"github.com/alexandreroman/intothefray/internal/store"
)

const (
	// sendQueueSize is the number of messages other than views waiting for a
	// viewer. A viewer that falls further behind is dropped rather than
	// slowing the others.
	sendQueueSize = 64
	// maxMessageBytes bounds a message from a viewer.
	maxMessageBytes = 64 << 10
	// readTimeout is how long a viewer may stay silent. It is enforced with
	// pings: each must be answered before the next one is due.
	readTimeout  = 60 * time.Second
	pingInterval = 30 * time.Second
	pongTimeout  = readTimeout - pingInterval
	writeTimeout = 60 * time.Second
	// publishTimeout bounds telling the other instances about a change.
	publishTimeout = 2 * time.Second
	// keepSpectators stands for a count of connected spectators that could
	// not be read: the view goes out with the last count sent instead.
	keepSpectators = -1
)

// errInvalidMessage reports a message that breaks the protocol.
var errInvalidMessage = errors.New("invalid message")

// conn is one viewer's WebSocket connection, written by its write loop so
// that a slow viewer never holds up the others.
//
// Views are coalesced: the connection holds at most one pending view, and a
// newer one replaces it, so a viewer that reads slowly during a burst of
// changes skips the intermediate versions and ends on the latest. Every other
// message goes through a bounded queue; when it overflows, the viewer is
// dropped.
type conn struct {
	ws     *websocket.Conn
	gameID string
	logger *slog.Logger
	// token, presenceID and onlineID are set by a successful hello, before
	// the hub registers the connection, and never change afterwards.
	// onlineID tells this connection apart from the other tabs of the token
	// in the store.
	token      string
	presenceID string
	onlineID   string
	// presenceLimit is only used by the read loop.
	presenceLimit rateLimiter

	queue    chan []byte
	tooSlow  chan struct{}
	dropOnce sync.Once

	// viewReady signals that pendingView is set. Its buffer of one is enough:
	// the write loop always takes the latest pending view.
	viewReady chan struct{}
	// viewMu guards the view state, so that concurrent broadcasts leave the
	// newest version pending.
	viewMu         sync.Mutex
	pendingView    []byte
	lastVersion    int64
	lastSpectators int
	// you is who the viewer is in the last view sent, which presence
	// messages are signed with.
	you game.YouView
}

func newConn(ws *websocket.Conn, gameID string, logger *slog.Logger) *conn {
	return &conn{
		ws:            ws,
		gameID:        gameID,
		logger:        logger,
		queue:         make(chan []byte, sendQueueSize),
		tooSlow:       make(chan struct{}),
		viewReady:     make(chan struct{}, 1),
		presenceLimit: rateLimiter{limit: maxPresencePerSecond},
	}
}

// send queues msg for the viewer, and drops the viewer when its queue is
// full.
func (c *conn) send(msg any) {
	data, err := c.encode(msg)
	if err != nil {
		return
	}
	select {
	case c.queue <- data:
	default:
		c.dropOnce.Do(func() { close(c.tooSlow) })
	}
}

// sendPresence queues a presence message for the viewer. Presence is
// cosmetic: it is dropped when the queue is more than half full, so that it
// never costs a viewer its connection nor crowds out the other messages.
func (c *conn) sendPresence(data []byte) {
	if len(c.queue) > cap(c.queue)/2 {
		return
	}
	select {
	case c.queue <- data:
	default: // filled up meanwhile
	}
}

// sendView makes the viewer's view of g the pending view, with spectators as
// the count of connected spectators, or the last count sent when it is
// keepSpectators. The viewer gets a version newer than the last one sent, or
// the same version when the count changed: viewers come and go without the
// game changing.
func (c *conn) sendView(g *game.Game, version int64, spectators int) {
	c.viewMu.Lock()
	defer c.viewMu.Unlock()

	if spectators == keepSpectators {
		spectators = c.lastSpectators
	}
	if version < c.lastVersion || (version == c.lastVersion && spectators == c.lastSpectators) {
		return
	}
	view := g.ViewFor(c.token)
	view.Spectators = spectators
	data, err := c.encode(viewMessage{Type: typeView, Version: version, View: view})
	if err != nil {
		return
	}
	c.you = view.You
	c.lastVersion = version
	c.lastSpectators = spectators
	c.pendingView = data
	select {
	case c.viewReady <- struct{}{}:
	default: // already signalled
	}
}

// online returns the connection as the store records it. The connection must
// have said hello.
func (c *conn) online() store.Connection {
	return store.Connection{Token: c.token, ID: c.onlineID}
}

// identity returns who the viewer is in the last view sent.
func (c *conn) identity() game.YouView {
	c.viewMu.Lock()
	defer c.viewMu.Unlock()
	return c.you
}

// takeView returns the pending view, or nil when an earlier signal already
// took it.
func (c *conn) takeView() []byte {
	c.viewMu.Lock()
	defer c.viewMu.Unlock()

	data := c.pendingView
	c.pendingView = nil
	return data
}

func (c *conn) encode(msg any) ([]byte, error) {
	data, err := json.Marshal(msg)
	if err != nil {
		c.logger.Error("encode message", "game_id", c.gameID, "error", err)
	}
	return data, err
}

func (c *conn) writeLoop(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case <-c.tooSlow:
			// Leave the connection to the close frame.
			return
		case data := <-c.queue:
			if err := c.write(ctx, data); err != nil {
				return
			}
		case <-c.viewReady:
			// Queued messages go first: the welcome must reach the viewer
			// before its first view.
			if err := c.writeQueued(ctx); err != nil {
				return
			}
			if data := c.takeView(); data != nil {
				if err := c.write(ctx, data); err != nil {
					return
				}
			}
		}
	}
}

// writeQueued writes the queued messages until the queue is empty.
func (c *conn) writeQueued(ctx context.Context) error {
	for {
		select {
		case data := <-c.queue:
			if err := c.write(ctx, data); err != nil {
				return err
			}
		default:
			return nil
		}
	}
}

func (c *conn) write(ctx context.Context, data []byte) error {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()
	return c.ws.Write(ctx, websocket.MessageText, data)
}

// pingLoop drops a viewer that stopped answering: one silent for readTimeout.
func (c *conn) pingLoop(ctx context.Context) {
	ticker := time.NewTicker(pingInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := c.ping(ctx); err != nil {
				_ = c.ws.CloseNow()
				return
			}
		}
	}
}

func (c *conn) ping(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, pongTimeout)
	defer cancel()
	return c.ws.Ping(ctx)
}

// closeWhenTooSlow closes the connection once its queue overflows. It runs
// apart from the write loop, which may be stuck writing to that very viewer.
func (c *conn) closeWhenTooSlow(ctx context.Context) {
	select {
	case <-ctx.Done():
	case <-c.tooSlow:
		_ = c.ws.Close(websocket.StatusPolicyViolation, "too slow")
	}
}

// serveConn runs a viewer's connection until it ends.
func (s *Server) serveConn(ctx context.Context, ws *websocket.Conn, gameID string) {
	ws.SetReadLimit(maxMessageBytes)
	c := newConn(ws, gameID, s.deps.Logger)
	if !s.hub.add(c) {
		_ = ws.Close(websocket.StatusGoingAway, "server shutting down")
		return
	}
	ctx, cancel := context.WithCancel(ctx)
	var wg sync.WaitGroup
	// Deferred, so that even a panic leaves neither the hub entry, the online
	// connection nor the socket behind. The read loop that sets the token has
	// returned: reading it here is safe.
	defer func() {
		s.hub.remove(c)
		if c.token != "" {
			s.setOffline(ctx, c)
		}
		cancel()
		wg.Wait()
		_ = ws.CloseNow()
	}()

	wg.Go(func() { c.writeLoop(ctx) })
	wg.Go(func() { c.pingLoop(ctx) })
	wg.Go(func() { c.closeWhenTooSlow(ctx) })

	s.readLoop(ctx, c)
}

// readLoop handles the viewer's messages one at a time, until the
// connection fails or the viewer leaves.
func (s *Server) readLoop(ctx context.Context, c *conn) {
	for {
		typ, data, err := c.ws.Read(ctx)
		if err != nil {
			return
		}
		msg, err := decodeMessage(typ, data)
		if err == nil {
			err = s.handleSafely(ctx, c, msg)
		}
		if err != nil {
			s.replyError(c, msg.ID, err)
		}
	}
}

// decodeMessage decodes a viewer's message. On failure, the message returned
// still holds the id when it can be read, so that the error reply echoes it.
func decodeMessage(typ websocket.MessageType, data []byte) (clientMessage, error) {
	if typ != websocket.MessageText {
		return clientMessage{}, fmt.Errorf("%w: binary message", errInvalidMessage)
	}
	var msg clientMessage
	if err := json.Unmarshal(data, &msg); err != nil {
		var head struct {
			ID int64 `json:"id"`
		}
		_ = json.Unmarshal(data, &head) // a missing or broken id stays 0
		return clientMessage{ID: head.ID}, fmt.Errorf("%w: %w", errInvalidMessage, err)
	}
	return msg, nil
}

// handleSafely handles msg and turns a panic into an internal error, so that
// one bad message does not cost the viewer its connection.
func (s *Server) handleSafely(ctx context.Context, c *conn, msg clientMessage) (err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("panic handling %s message: %v\n%s", msg.Type, r, debug.Stack())
		}
	}()
	return s.handle(ctx, c, msg)
}

func (s *Server) handle(ctx context.Context, c *conn, msg clientMessage) error {
	if msg.Type != typeHello && c.token == "" {
		return fmt.Errorf("%w: %s before hello", errInvalidMessage, msg.Type)
	}
	switch msg.Type {
	case typeHello:
		return s.hello(ctx, c, msg)
	case typeLobby:
		return s.lobby(ctx, c, msg)
	case typeAction:
		return s.act(ctx, c, msg)
	case typePresence:
		return s.presence(ctx, c, msg)
	default:
		return fmt.Errorf("%w: unknown type %q", errInvalidMessage, msg.Type)
	}
}

// hello joins the game with the viewer's token, or with a fresh one when the
// game does not know it, then sends the welcome and the first view.
func (s *Server) hello(ctx context.Context, c *conn, msg clientMessage) error {
	if c.token != "" {
		return fmt.Errorf("%w: second hello", errInvalidMessage)
	}
	fresh, err := newToken()
	if err != nil {
		return err
	}
	onlineID, err := newToken()
	if err != nil {
		return err
	}

	var token string
	var role game.Role
	err = s.update(ctx, c.gameID, func(g *game.Game) error {
		token = msg.Token
		if !takesPart(g, token) {
			token = fresh
		}
		var joinErr error
		role, joinErr = g.Join(token, msg.Name)
		return joinErr
	})
	if err != nil {
		return err
	}

	c.token = token
	c.presenceID = presenceID(token)
	c.onlineID = onlineID
	c.send(welcomeMessage{Type: typeWelcome, Token: token, Role: role})
	s.hub.register(c)
	s.keepOnline(ctx, c.gameID, []store.Connection{c.online()})
	// Loading after registering leaves no gap: an update made since the join
	// is either in this view or broadcast to c.
	g, version, err := s.deps.Store.Load(ctx, c.gameID)
	if err != nil {
		// The viewer is registered but has no view to start from: it must
		// reconnect, as an error reply would leave it waiting for one.
		s.deps.Logger.Error("load game after join", "game_id", c.gameID, "error", err)
		_ = c.ws.Close(websocket.StatusInternalError, "internal error")
		return nil
	}
	c.sendView(g, version, s.onlineSpectators(ctx, g))
	// The other viewers count c from now on, when it is a spectator.
	s.publishOnline(ctx, c.gameID)
	return nil
}

// setOffline forgets c among the connections of its game, and tells every
// instance so that the viewers stop counting it. It runs as c closes, so its
// store call outlives c's context, like publish.
func (s *Server) setOffline(ctx context.Context, c *conn) {
	storeCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), storeCallTimeout)
	defer cancel()

	if err := s.deps.Store.SetOffline(storeCtx, c.gameID, c.online()); err != nil {
		// Its lease passes in time: the count corrects itself then.
		s.deps.Logger.Warn("set connection offline", "game_id", c.gameID, "error", err)
	}
	s.publishOnline(ctx, c.gameID)
}

func (s *Server) lobby(ctx context.Context, c *conn, msg clientMessage) error {
	cat := s.deps.Catalog
	switch msg.Op {
	case opConfigure:
		if msg.Config == nil {
			return fmt.Errorf("%w: configure without a config", errInvalidMessage)
		}
		return s.update(ctx, c.gameID, func(g *game.Game) error {
			return g.Configure(c.token, *msg.Config, cat)
		})
	case opAddDeck:
		return s.update(ctx, c.gameID, func(g *game.Game) error { return g.AddDeck(c.token) })
	case opRemoveDeck:
		return s.update(ctx, c.gameID, func(g *game.Game) error { return g.RemoveDeck(c.token, msg.Deck) })
	case opSetDeck:
		return s.setDeck(ctx, c, msg.URL, msg.Deck)
	case opRemovePlayer:
		return s.update(ctx, c.gameID, func(g *game.Game) error {
			player := playerWithColor(g, msg.Color)
			if player == nil {
				return fmt.Errorf("%w: no player has colour %d", errInvalidMessage, msg.Color)
			}
			return g.RemovePlayer(c.token, player.Token)
		})
	case opLeave:
		return s.update(ctx, c.gameID, func(g *game.Game) error { return g.Leave(c.token) })
	case opTakeSeat:
		return s.update(ctx, c.gameID, func(g *game.Game) error { return g.TakeSeat(c.token) })
	case opStart:
		seed, err := newSeed()
		if err != nil {
			return err
		}
		return s.update(ctx, c.gameID, func(g *game.Game) error {
			return g.Start(c.token, cat, seed, s.deps.Now())
		})
	case opEnd:
		return s.update(ctx, c.gameID, func(g *game.Game) error { return g.End(c.token) })
	default:
		return fmt.Errorf("%w: unknown lobby op %q", errInvalidMessage, msg.Op)
	}
}

// setDeck imports the deck into the viewer's deck slot, importing before
// touching the game: the import calls marvelcdb, which has no place in a
// store transaction that may run several times. A failed import, or a hero
// already at the table, is answered here and leaves the game as it is.
func (s *Server) setDeck(ctx context.Context, c *conn, link string, slot int) error {
	deck, err := s.deps.Decks.Import(ctx, link, s.deps.Catalog)
	var unsupported *decks.UnsupportedError
	if errors.As(err, &unsupported) {
		c.send(deckErrorMessage{Type: typeDeckError, Unsupported: unsupported.Cards})
		return nil
	}
	if err != nil {
		c.send(errorMessage{Type: typeError, Code: codeDeck, Message: s.importErrorText(c, err)})
		return nil
	}
	err = s.update(ctx, c.gameID, func(g *game.Game) error {
		return g.SetDeck(c.token, slot, deck, s.deps.Catalog)
	})
	var taken *game.HeroTakenError
	if errors.As(err, &taken) {
		c.send(errorMessage{Type: typeError, Code: codeDeck, Message: heroTakenText(taken)})
		return nil
	}
	return err
}

// heroTakenText is the message of a deck refused because its hero is already
// at the table.
func heroTakenText(err *game.HeroTakenError) string {
	return fmt.Sprintf("%s is already at the table.", err.Hero)
}

// importErrorText is the fixed message of a failed deck import. Failures that
// are not the deck's fault are logged.
func (s *Server) importErrorText(c *conn, err error) string {
	switch {
	case errors.Is(err, decks.ErrLink):
		return "This is not a marvelcdb deck link."
	case errors.Is(err, decks.ErrNotFound):
		return "This deck does not exist on marvelcdb, or it is not public."
	case errors.Is(err, decks.ErrInvalidDeck):
		return "This deck is not valid."
	default:
		s.deps.Logger.Warn("import deck", "game_id", c.gameID, "error", err)
		return "The deck could not be loaded from marvelcdb. Please try again."
	}
}

func (s *Server) act(ctx context.Context, c *conn, msg clientMessage) error {
	if msg.Action == nil {
		return fmt.Errorf("%w: action without an action", errInvalidMessage)
	}
	// A negative seat stands for the player's first seat.
	seat := -1
	if msg.Seat != nil {
		seat = *msg.Seat
	}
	return s.update(ctx, c.gameID, func(g *game.Game) error {
		return g.Do(c.token, seat, *msg.Action, s.deps.Catalog, s.deps.Now())
	})
}

// update applies change to the stored game, then sends the new version to
// the local viewers and tells the other instances about it.
func (s *Server) update(ctx context.Context, gameID string, change func(*game.Game) error) error {
	g, version, err := s.deps.Store.Update(ctx, gameID, change)
	if err != nil {
		return err
	}
	s.hub.broadcast(g, version, s.onlineSpectators(ctx, g))
	s.publishUpdated(ctx, gameID, version)
	return nil
}

// publishUpdated tells the other instances that a game changed. The change
// is stored already, so a failure is only logged: their viewers catch up
// with the next change.
func (s *Server) publishUpdated(ctx context.Context, gameID string, version int64) {
	payload, err := json.Marshal(updatedEvent{Kind: eventUpdated, Version: version})
	if err != nil {
		s.deps.Logger.Error("encode game update", "game_id", gameID, "error", err)
		return
	}
	s.publish(ctx, gameID, payload)
}

// publishOnline tells every instance that a viewer of the game connected or
// disconnected. A failure is only logged: the lease rounds send the count
// again.
func (s *Server) publishOnline(ctx context.Context, gameID string) {
	payload, err := json.Marshal(onlineEvent{Kind: eventOnline})
	if err != nil {
		s.deps.Logger.Error("encode online event", "game_id", gameID, "error", err)
		return
	}
	s.publish(ctx, gameID, payload)
}

// publish sends an event to the viewers of the game on every instance,
// this one included. A failure is only logged: game changes are stored
// already and presence is cosmetic.
func (s *Server) publish(ctx context.Context, gameID string, payload []byte) {
	// The viewer leaving must not keep the others from hearing of a change
	// that is stored already.
	ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), publishTimeout)
	defer cancel()

	if err := s.deps.Store.Publish(ctx, gameID, payload); err != nil {
		s.deps.Logger.Warn("publish game event", "game_id", gameID, "error", err)
	}
}

// replyError tells the viewer that a request failed. Only the code and its
// fixed text are sent; unexpected errors are logged.
func (s *Server) replyError(c *conn, id int64, err error) {
	code := errorCode(err)
	if code == codeInternal {
		s.deps.Logger.Error("handle message", "game_id", c.gameID, "error", err)
	}
	c.send(errorMessage{Type: typeError, ID: id, Code: code, Message: errorTexts[code]})
}

func errorCode(err error) string {
	switch {
	case errors.Is(err, errInvalidMessage), errors.Is(err, game.ErrInvalid):
		return codeInvalid
	case errors.Is(err, game.ErrForbidden):
		return codeForbidden
	case errors.Is(err, game.ErrPhase):
		return codePhase
	case errors.Is(err, game.ErrNotFound), errors.Is(err, store.ErrNotFound):
		return codeNotFound
	default:
		return codeInternal
	}
}

// takesPart reports whether token is the token of a player or a spectator.
func takesPart(g *game.Game, token string) bool {
	if token == "" {
		return false
	}
	isPlayer := slices.ContainsFunc(g.Players, func(p *game.Player) bool { return p.Token == token })
	isSpectator := slices.ContainsFunc(g.Spectators, func(sp *game.Spectator) bool { return sp.Token == token })
	return isPlayer || isSpectator
}

func playerWithColor(g *game.Game, color int) *game.Player {
	i := slices.IndexFunc(g.Players, func(p *game.Player) bool { return p.Color == color })
	if i < 0 {
		return nil
	}
	return g.Players[i]
}
