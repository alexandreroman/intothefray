// Package store keeps games in Redis and relays game events between
// server instances.
package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math/rand/v2"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/alexandreroman/intothefray/internal/game"
)

const (
	// maxUpdateAttempts bounds the optimistic retries of Update.
	maxUpdateAttempts = 10
	// endedGameTTL keeps an ended game around so viewers see the end screen.
	endedGameTTL = time.Hour
	// retryJitter scales the random pause between two Update attempts.
	retryJitter = 2 * time.Millisecond

	eventsPattern = "game:*:events"
	eventsSuffix  = ":events"
	gamePrefix    = "game:"
)

var (
	// ErrNotFound reports an unknown (or expired) game.
	ErrNotFound = errors.New("game not found")
	// ErrExists reports a Create on an id that is already taken.
	ErrExists = errors.New("game already exists")
)

// Event is a message published on a game's channel.
type Event struct {
	GameID  string
	Payload []byte
}

// record is the JSON value stored under a game key.
type record struct {
	Version int64      `json:"version"`
	Game    *game.Game `json:"game"`
}

// Store persists games in Redis, one JSON value per game.
type Store struct {
	rdb *redis.Client
	ttl time.Duration
}

// New returns a Store whose games expire after ttl without a write.
// An ended game expires after one hour instead.
func New(rdb *redis.Client, ttl time.Duration) *Store {
	return &Store{rdb: rdb, ttl: ttl}
}

// Create stores a new game at version 1. It fails if the id is taken.
func (s *Store) Create(ctx context.Context, g *game.Game) error {
	data, err := json.Marshal(record{Version: 1, Game: g})
	if err != nil {
		return fmt.Errorf("encode game %s: %w", g.ID, err)
	}
	created, err := s.rdb.SetNX(ctx, gameKey(g.ID), data, s.ttlFor(g.Phase)).Result()
	if err != nil {
		return fmt.Errorf("create game %s: %w", g.ID, err)
	}
	if !created {
		return fmt.Errorf("create game %s: %w", g.ID, ErrExists)
	}
	return nil
}

// Load returns a game and its version.
func (s *Store) Load(ctx context.Context, id string) (*game.Game, int64, error) {
	data, err := s.rdb.Get(ctx, gameKey(id)).Bytes()
	if err != nil {
		return nil, 0, readError(id, err)
	}
	rec, err := decode(id, data)
	if err != nil {
		return nil, 0, err
	}
	return rec.Game, rec.Version, nil
}

// Update applies fn to the stored game and writes the result with the
// version incremented. Concurrent writers are handled optimistically: when
// the key changes under us, the whole load-fn-write cycle runs again, so fn
// must be safe to call several times. An error from fn aborts the update
// without writing and is returned as is.
func (s *Store) Update(
	ctx context.Context, id string, fn func(*game.Game) error,
) (*game.Game, int64, error) {
	key := gameKey(id)
	var updated record

	attempt := func(tx *redis.Tx) error {
		data, err := tx.Get(ctx, key).Bytes()
		if err != nil {
			return readError(id, err)
		}
		rec, err := decode(id, data)
		if err != nil {
			return err
		}
		if err := fn(rec.Game); err != nil {
			return err
		}
		rec.Version++

		data, err = json.Marshal(rec)
		if err != nil {
			return fmt.Errorf("encode game %s: %w", id, err)
		}
		_, err = tx.TxPipelined(ctx, func(pipe redis.Pipeliner) error {
			pipe.Set(ctx, key, data, s.ttlFor(rec.Game.Phase))
			return nil
		})
		if err != nil {
			return err
		}
		updated = *rec
		return nil
	}

	for n := range maxUpdateAttempts {
		err := s.rdb.Watch(ctx, attempt, key)
		if errors.Is(err, redis.TxFailedErr) {
			if n == maxUpdateAttempts-1 {
				break
			}
			if err := sleepWithJitter(ctx, n); err != nil {
				return nil, 0, err
			}
			continue
		}
		if err != nil {
			return nil, 0, err
		}
		return updated.Game, updated.Version, nil
	}
	return nil, 0, fmt.Errorf("update game %s: gave up after %d attempts: %w",
		id, maxUpdateAttempts, redis.TxFailedErr)
}

// Touch resets the expiry of a game without changing it.
func (s *Store) Touch(ctx context.Context, id string) error {
	g, _, err := s.Load(ctx, id)
	if err != nil {
		return err
	}
	touched, err := s.rdb.Expire(ctx, gameKey(id), s.ttlFor(g.Phase)).Result()
	if err != nil {
		return fmt.Errorf("touch game %s: %w", id, err)
	}
	if !touched {
		return fmt.Errorf("touch game %s: %w", id, ErrNotFound)
	}
	return nil
}

// Publish sends payload to every instance subscribed to the game's events.
func (s *Store) Publish(ctx context.Context, id string, payload []byte) error {
	if err := s.rdb.Publish(ctx, eventsChannel(id), payload).Err(); err != nil {
		return fmt.Errorf("publish event of game %s: %w", id, err)
	}
	return nil
}

// Subscribe receives the events of every game. The returned function stops
// the subscription and closes the channel; the channel also closes when ctx
// ends, releasing the Redis connection. Events are handed to the reader one
// at a time, so a reader that stops reading stalls the subscription until it
// is closed.
func (s *Store) Subscribe(ctx context.Context) (<-chan Event, func() error, error) {
	sub := s.rdb.PSubscribe(ctx, eventsPattern)
	// Wait for the subscription to be active so that an event published
	// right after Subscribe returns is not lost.
	if _, err := sub.Receive(ctx); err != nil {
		_ = sub.Close()
		return nil, nil, fmt.Errorf("subscribe to game events: %w", err)
	}

	events := make(chan Event)
	quit := make(chan struct{})
	done := make(chan struct{})
	release := sync.OnceValue(sub.Close)

	go func() {
		defer close(events)
		defer close(done)
		defer func() { _ = release() }()
		messages := sub.Channel()
		for {
			var msg *redis.Message
			select {
			case m, ok := <-messages:
				if !ok {
					return
				}
				msg = m
			case <-quit:
				return
			case <-ctx.Done():
				return
			}
			ev := Event{GameID: gameIDFromChannel(msg.Channel), Payload: []byte(msg.Payload)}
			select {
			case events <- ev:
			case <-quit:
				return
			case <-ctx.Done():
				return
			}
		}
	}()

	var quitOnce sync.Once
	closeSub := func() error {
		quitOnce.Do(func() { close(quit) })
		err := release()
		<-done
		return err
	}
	return events, closeSub, nil
}

// sleepWithJitter desynchronises writers that just collided; without it they
// keep retrying in lockstep and the same ones lose every round.
func sleepWithJitter(ctx context.Context, attempt int) error {
	delay := rand.N(time.Duration(attempt+1) * retryJitter) //nolint:gosec // timing jitter, not security
	select {
	case <-time.After(delay):
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (s *Store) ttlFor(phase game.Phase) time.Duration {
	if phase == game.PhaseEnded {
		return endedGameTTL
	}
	return s.ttl
}

func gameKey(id string) string {
	return gamePrefix + id
}

func eventsChannel(id string) string {
	return gamePrefix + id + eventsSuffix
}

func gameIDFromChannel(channel string) string {
	return strings.TrimSuffix(strings.TrimPrefix(channel, gamePrefix), eventsSuffix)
}

func readError(id string, err error) error {
	if errors.Is(err, redis.Nil) {
		return fmt.Errorf("game %s: %w", id, ErrNotFound)
	}
	return fmt.Errorf("read game %s: %w", id, err)
}

func decode(id string, data []byte) (*record, error) {
	var rec record
	if err := json.Unmarshal(data, &rec); err != nil {
		return nil, fmt.Errorf("decode game %s: %w", id, err)
	}
	return &rec, nil
}
