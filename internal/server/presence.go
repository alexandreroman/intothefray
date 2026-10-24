package server

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"

	"github.com/alexandreroman/intothefray/internal/game"
)

const (
	// maxPresenceText bounds every text of a presence message: the preview
	// and the card ids of a drag.
	maxPresenceText = 64
	// maxDragCards bounds the cards of one drag.
	maxDragCards = 50
	// maxPresencePerSecond is how many presence messages a player may send
	// per second; the others are dropped. The web client sends its
	// continuous moves at most once per PRESENCE_INTERVAL_MS (web
	// session.svelte.ts), and its discrete events (pings, previews, drag
	// start and end, a hidden cursor) at once: the limit leaves room for a
	// burst of those, while it caps a modified client, as each relayed
	// message costs one Redis publish. Events are not capped by the client,
	// though: a burst past the limit (previews changing fast) loses the
	// messages dropped, and the others see a stale state until the next one.
	maxPresencePerSecond = 30
	// presenceIDLength is the length of the hex hash that tells the sender
	// of a presence event apart.
	presenceIDLength = 16
)

// presence relays the player's cursor, preview, drag or ping to the other
// viewers of the game, on every instance. Presence is never stored.
func (s *Server) presence(ctx context.Context, c *conn, msg clientMessage) error {
	// Checked first, so that a spectator's presence costs no Redis publish:
	// the web client never sends any, only a modified one would.
	you := c.identity()
	if you.Role != game.RolePlayer {
		return fmt.Errorf("%w: a spectator sends no presence", game.ErrForbidden)
	}
	if !c.presenceLimit.allow(time.Now()) {
		return nil
	}
	fields, err := presenceFieldsOf(msg)
	if err != nil {
		return err
	}

	payload, err := json.Marshal(presenceEvent{
		Kind:           eventPresence,
		From:           c.presenceID,
		Color:          you.Color,
		Name:           you.Name,
		presenceFields: fields,
	})
	if err != nil {
		return err
	}
	s.publish(ctx, c.gameID, payload)
	return nil
}

// presenceFieldsOf validates the presence fields of msg. A cursor and a drag
// are decoded and encoded again, so that only their known fields are relayed.
func presenceFieldsOf(msg clientMessage) (presenceFields, error) {
	fields := presenceFields{Preview: msg.Preview, Ping: msg.Ping}
	if msg.Cursor != nil {
		var cursor *presencePoint
		if err := json.Unmarshal(msg.Cursor, &cursor); err != nil {
			return presenceFields{}, fmt.Errorf("%w: cursor: %w", errInvalidMessage, err)
		}
		encoded, err := json.Marshal(cursor) // null while the viewer is off the table
		if err != nil {
			return presenceFields{}, err
		}
		fields.Cursor = encoded
	}
	if msg.Drag != nil {
		var drag *presenceDrag
		if err := json.Unmarshal(msg.Drag, &drag); err != nil {
			return presenceFields{}, fmt.Errorf("%w: drag: %w", errInvalidMessage, err)
		}
		if drag != nil && !drag.valid() {
			return presenceFields{}, fmt.Errorf("%w: drag out of bounds", errInvalidMessage)
		}
		if drag != nil && drag.Cards == nil {
			// Relayed as a list, never null: a token drag may leave its cards out.
			drag.Cards = []string{}
		}
		encoded, err := json.Marshal(drag) // null once the drag ends
		if err != nil {
			return presenceFields{}, err
		}
		fields.Drag = encoded
	}

	switch {
	case fields.Cursor == nil && fields.Preview == nil && fields.Drag == nil && fields.Ping == nil:
		return presenceFields{}, fmt.Errorf("%w: empty presence", errInvalidMessage)
	case fields.Preview != nil && len(*fields.Preview) > maxPresenceText:
		// An empty preview is valid: it clears the previous one.
		return presenceFields{}, fmt.Errorf("%w: preview too long", errInvalidMessage)
	}
	return fields, nil
}

// valid reports whether d carries either a table marker alone, or between 1
// and maxDragCards cards.
func (d *presenceDrag) valid() bool {
	if d.Token != "" {
		return len(d.Cards) == 0 && validPresenceText(d.Token)
	}
	if len(d.Cards) == 0 || len(d.Cards) > maxDragCards {
		return false
	}
	for _, id := range d.Cards {
		if !validPresenceText(id) {
			return false
		}
	}
	return true
}

func validPresenceText(s string) bool {
	return s != "" && len(s) <= maxPresenceText
}

// presenceID identifies the connections of token in presence events. It is a
// hash, so that the token itself never travels through Redis.
func presenceID(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])[:presenceIDLength]
}

// rateLimiter allows up to limit events per one-second window. It is not
// safe for concurrent use: each connection's read loop owns its own.
type rateLimiter struct {
	limit       int
	windowStart time.Time
	count       int
}

func (l *rateLimiter) allow(now time.Time) bool {
	if now.Sub(l.windowStart) >= time.Second {
		l.windowStart = now
		l.count = 0
	}
	if l.count >= l.limit {
		return false
	}
	l.count++
	return true
}
