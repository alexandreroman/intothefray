package server

import (
	"context"
	"encoding/json"
	"errors"
	"maps"
	"slices"
	"sync"
	"time"

	"github.com/coder/websocket"

	"github.com/alexandreroman/intothefray/internal/game"
	"github.com/alexandreroman/intothefray/internal/store"
)

const (
	// touchInterval is how often the games with a viewer on this instance
	// get their expiry reset.
	touchInterval = 10 * time.Minute
	// storeCallTimeout bounds each store call of the background work: the
	// event loop handles the events of every game one at a time.
	storeCallTimeout = 2 * time.Second
)

// errSubscriptionEnded reports that the game events stopped arriving while
// the server was still running.
var errSubscriptionEnded = errors.New("game event subscription ended")

// hub keeps the connections of this instance, grouped by game, and sends
// them the new versions of their game and the presence of the other viewers.
type hub struct {
	mu sync.Mutex
	// closed is set once the server shuts down: no connection is accepted
	// afterwards.
	closed bool
	// all holds every open connection, including those that have not said
	// hello yet, so that shutdown closes them all.
	all map[*conn]struct{}
	// games holds the connections that joined, by game.
	games map[string]*localGame
}

// localGame is a game with viewers on this instance.
type localGame struct {
	conns map[*conn]struct{}
	// version is the newest version broadcast to the connections, so that
	// the update event of a change made here does not load the game again.
	version int64
}

func newHub() *hub {
	return &hub{all: make(map[*conn]struct{}), games: make(map[string]*localGame)}
}

// add records a new connection. It returns false once the hub is closed:
// the connection must then be closed.
func (h *hub) add(c *conn) bool {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.closed {
		return false
	}
	h.all[c] = struct{}{}
	return true
}

// register adds c to the connections of its game, once it joined. Its token
// must be set.
func (h *hub) register(c *conn) {
	h.mu.Lock()
	defer h.mu.Unlock()

	local := h.games[c.gameID]
	if local == nil {
		local = &localGame{conns: make(map[*conn]struct{})}
		h.games[c.gameID] = local
	}
	local.conns[c] = struct{}{}
}

// remove forgets c. A game left without local connections stays in the
// store, which expires it.
func (h *hub) remove(c *conn) {
	h.mu.Lock()
	defer h.mu.Unlock()

	delete(h.all, c)
	local := h.games[c.gameID]
	if local == nil {
		return
	}
	delete(local.conns, c)
	if len(local.conns) == 0 {
		delete(h.games, c.gameID)
	}
}

// broadcast sends version of g to every local connection of the game, each
// with the view of its own token.
func (h *hub) broadcast(g *game.Game, version int64) {
	for _, c := range h.recipients(g.ID, version) {
		c.sendView(g, version)
	}
}

// recipients returns a copy of the connections of a game, so that views are
// built without holding the lock, and records that they get version.
func (h *hub) recipients(gameID string, version int64) []*conn {
	h.mu.Lock()
	defer h.mu.Unlock()

	local := h.games[gameID]
	if local == nil {
		return nil
	}
	local.version = max(local.version, version)
	return slices.Collect(maps.Keys(local.conns))
}

// needs reports whether the game has local connections that have not been
// sent version yet.
func (h *hub) needs(gameID string, version int64) bool {
	h.mu.Lock()
	defer h.mu.Unlock()

	local := h.games[gameID]
	return local != nil && version > local.version
}

// relay sends a presence message to the local connections of a game but
// those of its sender.
func (h *hub) relay(gameID, from string, data []byte) {
	h.mu.Lock()
	defer h.mu.Unlock()

	local := h.games[gameID]
	if local == nil {
		return
	}
	for c := range local.conns {
		if c.presenceID != from {
			c.sendPresence(data)
		}
	}
}

// gameIDs returns the games with local connections.
func (h *hub) gameIDs() []string {
	h.mu.Lock()
	defer h.mu.Unlock()
	return slices.Collect(maps.Keys(h.games))
}

// closeAll refuses new connections and closes the open ones, telling the
// viewers that the server is going away. It returns once they are closed.
func (h *hub) closeAll() {
	h.mu.Lock()
	h.closed = true
	conns := slices.Collect(maps.Keys(h.all))
	h.mu.Unlock()

	// Each close waits for the viewer's answer: they run side by side so
	// that a silent viewer does not hold up the others.
	var wg sync.WaitGroup
	for _, c := range conns {
		wg.Go(func() { _ = c.ws.Close(websocket.StatusGoingAway, "server shutting down") })
	}
	wg.Wait()
}

// Run relays the events of every game to the viewers connected to this
// instance, and keeps their games from expiring, until ctx ends. It then
// closes every connection: http.Server.Shutdown does not, as WebSocket
// connections are hijacked.
func (s *Server) Run(ctx context.Context) error {
	defer s.hub.closeAll()

	events, closeEvents, err := s.deps.Store.Subscribe(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = closeEvents() }()

	// The touch rounds run apart from the event loop: their store calls must
	// not hold up the updates and presence of the games.
	touchCtx, stopTouching := context.WithCancel(ctx)
	var touching sync.WaitGroup
	touching.Go(func() { s.touchLoop(touchCtx) })
	defer touching.Wait()
	defer stopTouching()

	for {
		select {
		case <-ctx.Done():
			return nil
		case ev, ok := <-events:
			if !ok {
				if ctx.Err() != nil {
					return nil
				}
				return errSubscriptionEnded
			}
			s.handleEvent(ctx, ev)
		}
	}
}

// touchLoop runs a touch round every touchInterval until ctx ends.
func (s *Server) touchLoop(ctx context.Context) {
	ticker := time.NewTicker(s.touchInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.touchLocalGames(ctx)
		}
	}
}

// handleEvent relays one event published on a game's channel, by any
// instance, this one included.
func (s *Server) handleEvent(ctx context.Context, ev store.Event) {
	var head struct {
		Kind string `json:"kind"`
	}
	if err := json.Unmarshal(ev.Payload, &head); err != nil {
		s.deps.Logger.Warn("decode game event", "game_id", ev.GameID, "error", err)
		return
	}
	switch head.Kind {
	case eventUpdated:
		s.relayUpdate(ctx, ev)
	case eventPresence:
		s.relayPresence(ev)
	default:
		s.deps.Logger.Warn("unknown game event", "game_id", ev.GameID, "kind", head.Kind)
	}
}

// relayUpdate sends a new version of the game to its local viewers. The game
// is loaded once for all of them, and only when some of them lack that
// version: the instance that made the change has sent it already.
func (s *Server) relayUpdate(ctx context.Context, ev store.Event) {
	var updated updatedEvent
	if err := json.Unmarshal(ev.Payload, &updated); err != nil {
		s.deps.Logger.Warn("decode update event", "game_id", ev.GameID, "error", err)
		return
	}
	if !s.hub.needs(ev.GameID, updated.Version) {
		return
	}

	ctx, cancel := context.WithTimeout(ctx, storeCallTimeout)
	defer cancel()
	// The stored game may be newer than the event: sending it is fine, the
	// connections skip the versions they already have.
	g, version, err := s.deps.Store.Load(ctx, ev.GameID)
	if err != nil {
		s.deps.Logger.Warn("load updated game", "game_id", ev.GameID, "error", err)
		return
	}
	s.hub.broadcast(g, version)
}

// relayPresence sends a viewer's presence to the other local viewers of the
// game, without the sender's id.
func (s *Server) relayPresence(ev store.Event) {
	var presence presenceEvent
	if err := json.Unmarshal(ev.Payload, &presence); err != nil {
		s.deps.Logger.Warn("decode presence event", "game_id", ev.GameID, "error", err)
		return
	}
	data, err := json.Marshal(presenceMessage{
		Type:           typePresence,
		Color:          presence.Color,
		Name:           presence.Name,
		presenceFields: presence.presenceFields,
	})
	if err != nil {
		s.deps.Logger.Error("encode presence", "game_id", ev.GameID, "error", err)
		return
	}
	s.hub.relay(ev.GameID, presence.From, data)
}

// touchLocalGames resets the expiry of every game with a viewer on this
// instance: a game stays alive as long as somebody looks at it.
func (s *Server) touchLocalGames(ctx context.Context) {
	for _, id := range s.hub.gameIDs() {
		touchCtx, cancel := context.WithTimeout(ctx, storeCallTimeout)
		err := s.deps.Store.Touch(touchCtx, id)
		cancel()
		if err != nil {
			s.deps.Logger.Warn("touch game", "game_id", id, "error", err)
		}
	}
}
