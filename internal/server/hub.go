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
	// onlineInterval is how often the connections of this instance get their
	// lease renewed, and their viewers the count of connected spectators.
	onlineInterval = 30 * time.Second
	// leaseRounds is how many online intervals a lease lasts: a connection
	// counts as open that long without a renewal, so that one late round
	// drops nobody.
	leaseRounds = 3
	// storeCallTimeout bounds each store call of the background work: the
	// event loop handles the events of every game one at a time.
	storeCallTimeout = 2 * time.Second
)

// errSubscriptionEnded reports that the game events stopped arriving while
// the server was still running.
var errSubscriptionEnded = errors.New("game event subscription ended")

// hub keeps the connections of this instance, grouped by game, and sends
// them the new versions of their game, the count of connected spectators and
// the presence of the other viewers.
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
// with the view of its own token, and spectators as the count of connected
// spectators (see conn.sendView).
func (h *hub) broadcast(g *game.Game, version int64, spectators int) {
	for _, c := range h.recipients(g.ID, version) {
		c.sendView(g, version, spectators)
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

// watched reports whether the game has local connections.
func (h *hub) watched(gameID string) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.games[gameID] != nil
}

// connections returns the local connections of every game, as the store
// records them.
func (h *hub) connections() map[string][]store.Connection {
	h.mu.Lock()
	defer h.mu.Unlock()

	byGame := make(map[string][]store.Connection, len(h.games))
	for id, local := range h.games {
		for c := range local.conns {
			byGame[id] = append(byGame[id], c.online())
		}
	}
	return byGame
}

// registered reports whether connection is still among the local connections
// of the game.
func (h *hub) registered(gameID string, connection store.Connection) bool {
	h.mu.Lock()
	defer h.mu.Unlock()

	local := h.games[gameID]
	if local == nil {
		return false
	}
	for c := range local.conns {
		if c.online() == connection {
			return true
		}
	}
	return false
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

	// The touch and lease rounds run apart from the event loop: their store
	// calls must not hold up the updates and presence of the games.
	roundsCtx, stopRounds := context.WithCancel(ctx)
	var rounds sync.WaitGroup
	rounds.Go(func() { every(roundsCtx, s.touchInterval, s.touchLocalGames) })
	rounds.Go(func() { every(roundsCtx, s.onlineInterval, s.renewOnline) })
	defer rounds.Wait()
	defer stopRounds()

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

// every runs round every interval until ctx ends.
func every(ctx context.Context, interval time.Duration, round func(context.Context)) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			round(ctx)
		}
	}
}

// handleEvent relays one event published on a game's channel, by any
// instance, this one included.
func (s *Server) handleEvent(ctx context.Context, ev store.Event) {
	if ev.Resync {
		s.resyncLocalGames(ctx)
		return
	}
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
	case eventOnline:
		s.relayOnline(ctx, ev.GameID)
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
	// The stored game may be newer than the event: sending it is fine, the
	// connections skip the versions they already have.
	if err := s.sendStoredGame(ctx, ev.GameID); err != nil {
		s.deps.Logger.Warn("load updated game", "game_id", ev.GameID, "error", err)
	}
}

// relayOnline sends the local viewers of a game the new count of connected
// spectators, after a viewer connected or disconnected on any instance.
func (s *Server) relayOnline(ctx context.Context, gameID string) {
	if !s.hub.watched(gameID) {
		return
	}
	if err := s.sendStoredGame(ctx, gameID); err != nil {
		s.deps.Logger.Warn("load game to count its spectators", "game_id", gameID, "error", err)
	}
}

// resyncLocalGames sends the stored version of every game with local
// viewers, once the subscription is back after a lost connection: the
// updates published in the meantime never reached this instance.
func (s *Server) resyncLocalGames(ctx context.Context) {
	for _, id := range s.hub.gameIDs() {
		if err := s.sendStoredGame(ctx, id); err != nil {
			s.deps.Logger.Warn("load game to resync", "game_id", id, "error", err)
		}
	}
}

// sendStoredGame sends the stored version of a game to its local viewers,
// with the current count of connected spectators. Connections skip it when
// they already have this version and count.
func (s *Server) sendStoredGame(ctx context.Context, gameID string) error {
	ctx, cancel := context.WithTimeout(ctx, storeCallTimeout)
	defer cancel()

	g, version, err := s.deps.Store.Load(ctx, gameID)
	if err != nil {
		return err
	}
	s.hub.broadcast(g, version, s.onlineSpectators(ctx, g))
	return nil
}

// onlineSpectators counts the spectators of g connected to any instance. When
// the connections cannot be read, it returns keepSpectators: a failure never
// holds back a view, which then shows the last count sent.
func (s *Server) onlineSpectators(ctx context.Context, g *game.Game) int {
	online, err := s.deps.Store.Online(ctx, g.ID, time.Now())
	if err != nil {
		s.deps.Logger.Warn("load online connections", "game_id", g.ID, "error", err)
		return keepSpectators
	}
	return g.OnlineSpectators(online)
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

// renewOnline renews the leases of the local connections, then sends their
// viewers the current count of connected spectators. The count leaves out the
// connections whose lease passed, such as those of an instance that stopped
// without closing them, and corrects a count that a broadcast read just
// before a viewer connected or disconnected.
func (s *Server) renewOnline(ctx context.Context) {
	for id, conns := range s.hub.connections() {
		s.keepOnline(ctx, id, conns)
		s.forgetClosed(ctx, id, conns)
		if err := s.sendStoredGame(ctx, id); err != nil {
			s.deps.Logger.Warn("load game to count its spectators", "game_id", id, "error", err)
		}
	}
}

// keepOnline records conns, local connections to a game, as open for another
// lease. A failure is only logged: the next round records them again, before
// the leases pass.
func (s *Server) keepOnline(ctx context.Context, gameID string, conns []store.Connection) {
	ctx, cancel := context.WithTimeout(ctx, storeCallTimeout)
	defer cancel()

	lease := leaseRounds * s.onlineInterval
	dropped, err := s.deps.Store.KeepOnline(ctx, gameID, conns, time.Now(), lease)
	if err != nil {
		s.deps.Logger.Warn("keep connections online", "game_id", gameID, "error", err)
		return
	}
	if dropped > 0 {
		s.deps.Logger.Info("dropped connections whose lease passed", "game_id", gameID, "count", dropped)
	}
}

// forgetClosed sets offline those of conns, just renewed, that closed since
// the round listed them: their own setOffline may have run before the renewal
// and been undone by it. A connection leaves the hub before it sets itself
// offline, so one that closed too late to be seen here sets itself offline
// after the renewal.
func (s *Server) forgetClosed(ctx context.Context, gameID string, conns []store.Connection) {
	forgotten := false
	for _, connection := range conns {
		if s.hub.registered(gameID, connection) {
			continue
		}
		storeCtx, cancel := context.WithTimeout(ctx, storeCallTimeout)
		err := s.deps.Store.SetOffline(storeCtx, gameID, connection)
		cancel()
		if err != nil {
			// Its lease passes in time: the count corrects itself then.
			s.deps.Logger.Warn("set closed connection offline", "game_id", gameID, "error", err)
			continue
		}
		forgotten = true
	}
	if forgotten {
		s.publishOnline(ctx, gameID)
	}
}
