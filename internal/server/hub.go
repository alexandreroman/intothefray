package server

import (
	"maps"
	"slices"
	"sync"

	"github.com/alexandreroman/intothefray/internal/game"
)

// hub keeps the connections of this instance, grouped by game, and sends
// them the new versions of their game.
type hub struct {
	mu    sync.Mutex
	games map[string]map[*conn]struct{}
}

func newHub() *hub {
	return &hub{games: make(map[string]map[*conn]struct{})}
}

// register adds c to the connections of its game. Its token must be set.
func (h *hub) register(c *conn) {
	h.mu.Lock()
	defer h.mu.Unlock()

	conns := h.games[c.gameID]
	if conns == nil {
		conns = make(map[*conn]struct{})
		h.games[c.gameID] = conns
	}
	conns[c] = struct{}{}
}

// unregister forgets c. A game left without local connections stays in the
// store, which expires it.
func (h *hub) unregister(c *conn) {
	h.mu.Lock()
	defer h.mu.Unlock()

	conns := h.games[c.gameID]
	delete(conns, c)
	if len(conns) == 0 {
		delete(h.games, c.gameID)
	}
}

// broadcast sends version of g to every local connection of the game, each
// with the view of its own token.
func (h *hub) broadcast(g *game.Game, version int64) {
	for _, c := range h.conns(g.ID) {
		c.sendView(g, version)
	}
}

// conns returns a copy of the connections of a game, so that views are built
// without holding the lock.
func (h *hub) conns(gameID string) []*conn {
	h.mu.Lock()
	defer h.mu.Unlock()
	return slices.Collect(maps.Keys(h.games[gameID]))
}
