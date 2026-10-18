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
	// maxPresenceText bounds every text of a presence message: areas and
	// card ids.
	maxPresenceText = 64
	// maxDragCards bounds the cards of one drag.
	maxDragCards = 50
	// maxPresencePerSecond is how many presence messages a viewer may send
	// per second; the others are dropped.
	maxPresencePerSecond = 30
	// spectatorColor is the colour relayed with a spectator's presence, as
	// spectators have none.
	spectatorColor = -1
	// presenceIDLength is the length of the hex hash that tells the sender
	// of a presence event apart.
	presenceIDLength = 16
)

// presence relays the viewer's cursor, preview, drag or ping to the other
// viewers of the game, on every instance. Presence is never stored.
func (s *Server) presence(ctx context.Context, c *conn, msg clientMessage) error {
	if !c.presenceLimit.allow(time.Now()) {
		return nil
	}
	fields, err := presenceFieldsOf(msg)
	if err != nil {
		return err
	}

	you := c.identity()
	color := you.Color
	if you.Role != game.RolePlayer {
		if fields.Ping != nil || fields.Drag != nil {
			return fmt.Errorf("%w: a spectator cannot ping or drag", game.ErrForbidden)
		}
		color = spectatorColor
	}

	payload, err := json.Marshal(presenceEvent{
		Kind:           eventPresence,
		From:           c.presenceID,
		Color:          color,
		Name:           you.Name,
		presenceFields: fields,
	})
	if err != nil {
		return err
	}
	s.publish(ctx, c.gameID, payload)
	return nil
}

// presenceFieldsOf validates the presence fields of msg. A drag is decoded
// and encoded again, so that only its known fields are relayed.
func presenceFieldsOf(msg clientMessage) (presenceFields, error) {
	fields := presenceFields{Cursor: msg.Cursor, Preview: msg.Preview, Ping: msg.Ping}
	if msg.Drag != nil {
		var drag *presenceDrag
		if err := json.Unmarshal(msg.Drag, &drag); err != nil {
			return presenceFields{}, fmt.Errorf("%w: drag: %w", errInvalidMessage, err)
		}
		if drag != nil && !drag.valid() {
			return presenceFields{}, fmt.Errorf("%w: drag out of bounds", errInvalidMessage)
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
	case fields.Cursor != nil && !fields.Cursor.valid():
		return presenceFields{}, fmt.Errorf("%w: cursor out of bounds", errInvalidMessage)
	case fields.Ping != nil && !fields.Ping.valid():
		return presenceFields{}, fmt.Errorf("%w: ping out of bounds", errInvalidMessage)
	case fields.Preview != nil && len(*fields.Preview) > maxPresenceText:
		// An empty preview is valid: it clears the previous one.
		return presenceFields{}, fmt.Errorf("%w: preview too long", errInvalidMessage)
	}
	return fields, nil
}

func (p *presencePoint) valid() bool {
	return validPresenceText(p.Area)
}

func (d *presenceDrag) valid() bool {
	if len(d.Cards) == 0 || len(d.Cards) > maxDragCards || !validPresenceText(d.Area) {
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
