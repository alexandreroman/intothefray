// Package store keeps games in Redis and relays game events between
// server instances.
package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math/rand/v2"
	"strconv"
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
	// infoScanBatch is the COUNT hint of the SCAN rounds of GameSummaries.
	infoScanBatch = 1000

	// The keys of a game are game:<id>, the game, game:<id>:info, its
	// summary, and online:<id>, its online connections; game:<id>:events is
	// the pub/sub channel of its events, not a key. The server only hands
	// over the ids it generates, which hold no colon, so no id names another
	// game's key.
	gamePrefix    = "game:"
	infoSuffix    = ":info"
	infoPattern   = gamePrefix + "*" + infoSuffix
	eventsSuffix  = ":events"
	eventsPattern = gamePrefix + "*" + eventsSuffix
	// onlinePrefix starts the keys of the online connections of the games.
	onlinePrefix = "online:"
	// connectionSeparator joins the id and the token of a connection in the
	// set. The id comes first: it is generated without the separator, whereas
	// nothing bounds what a token holds.
	connectionSeparator = ":"
)

var (
	// ErrNotFound reports an unknown (or expired) game.
	ErrNotFound = errors.New("game not found")
	// ErrExists reports a Create on an id that is already taken.
	ErrExists = errors.New("game already exists")
)

// createScript stores a game and its summary in one step, so that no game is
// ever left without a summary: it sets the game key (KEYS[1]) to ARGV[1]
// unless it exists, and only then the summary key (KEYS[2]) to ARGV[2], both
// expiring after ARGV[3] milliseconds. It returns 1 when it stored the game, 0
// when the id is taken; a taken id never overwrites the summary of the game
// that holds it.
var createScript = redis.NewScript(`
if not redis.call("SET", KEYS[1], ARGV[1], "NX", "PX", ARGV[3]) then
	return 0
end
redis.call("SET", KEYS[2], ARGV[2], "PX", ARGV[3])
return 1
`)

// Event is a message published on a game's channel, or a resync notice.
type Event struct {
	GameID  string
	Payload []byte
	// Resync reports that the subscription was restored after a lost
	// connection: the events published meanwhile are lost, so the reader
	// must reload the games it follows. GameID and Payload are then empty.
	Resync bool
}

// Connection is one open connection to a game, on any instance. ID tells
// apart the connections of a token, such as two tabs of the same viewer; it
// must not contain a colon.
type Connection struct {
	Token string
	ID    string
}

// record is the JSON value stored under a game key.
type record struct {
	Version int64      `json:"version"`
	Game    *game.Game `json:"game"`
}

// Store persists games in Redis, one JSON value per game under game:<id>, next
// to a small JSON summary of the game (see game.Summary) under
// game:<id>:info, written and expiring with it.
type Store struct {
	rdb *redis.Client
	ttl time.Duration
}

// New returns a Store whose games expire ttl after their last write or
// Touch: the server touches a game as long as somebody views it. An ended
// game expires after one hour instead.
func New(rdb *redis.Client, ttl time.Duration) *Store {
	return &Store{rdb: rdb, ttl: ttl}
}

// Create stores a new game at version 1, and its summary, atomically. It fails
// if the id is taken.
func (s *Store) Create(ctx context.Context, g *game.Game) error {
	data, err := json.Marshal(record{Version: 1, Game: g})
	if err != nil {
		return fmt.Errorf("encode game %s: %w", g.ID, err)
	}
	summary, err := encodeSummary(g)
	if err != nil {
		return err
	}
	keys := []string{gameKey(g.ID), infoKey(g.ID)}
	ttl := s.ttlFor(g.Phase).Milliseconds()
	created, err := createScript.Run(ctx, s.rdb, keys, data, summary, ttl).Int()
	if err != nil {
		return fmt.Errorf("create game %s: %w", g.ID, err)
	}
	if created == 0 {
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
// version incremented, along with its summary in the same transaction.
// Concurrent writers are handled optimistically: when the key changes under
// us, the whole load-fn-write cycle runs again, so fn must be safe to call
// several times. An error from fn aborts the update without writing and is
// returned as is.
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
		summary, err := encodeSummary(rec.Game)
		if err != nil {
			return err
		}
		ttl := s.ttlFor(rec.Game.Phase)
		_, err = tx.TxPipelined(ctx, func(pipe redis.Pipeliner) error {
			pipe.Set(ctx, key, data, ttl)
			pipe.Set(ctx, infoKey(id), summary, ttl)
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

// Touch resets the expiry of a game and of its summary without changing them,
// in one MULTI/EXEC: both expiries change together or not at all. Like Create's
// script and Update's transaction, it always gives both keys the same expiry
// at once. A game without a summary, such as one stored before summaries
// existed, is touched all the same.
func (s *Store) Touch(ctx context.Context, id string) error {
	g, _, err := s.Load(ctx, id)
	if err != nil {
		return err
	}
	ttl := s.ttlFor(g.Phase)
	var touched *redis.BoolCmd
	_, err = s.rdb.TxPipelined(ctx, func(pipe redis.Pipeliner) error {
		touched = pipe.Expire(ctx, gameKey(id), ttl)
		pipe.Expire(ctx, infoKey(id), ttl)
		return nil
	})
	if err != nil {
		return fmt.Errorf("touch game %s: %w", id, err)
	}
	if !touched.Val() {
		return fmt.Errorf("touch game %s: %w", id, ErrNotFound)
	}
	return nil
}

// GameSummaries returns the summary of every game that has not expired, in
// any phase and in no particular order: one per game:*:info key,
// deduplicated. It walks those keys with SCAN, which never blocks Redis the
// way KEYS would, and reads their small values with one MGET per round: it
// reads no game value. SCAN may return a key twice while Redis resizes its
// table; such a key is read once, so each game appears once. A game stored before summaries existed has none and is
// left out, and so is a summary that expires during the walk or that cannot
// be decoded: one bad value must not fail the whole statistics.
func (s *Store) GameSummaries(ctx context.Context) ([]game.Summary, error) {
	var (
		summaries []game.Summary
		seen      = make(map[string]bool)
		cursor    uint64
	)
	for {
		keys, next, err := s.rdb.Scan(ctx, cursor, infoPattern, infoScanBatch).Result()
		if err != nil {
			return nil, fmt.Errorf("scan game summaries: %w", err)
		}
		keys = unseen(keys, seen)
		if len(keys) > 0 {
			values, err := s.rdb.MGet(ctx, keys...).Result()
			if err != nil {
				return nil, fmt.Errorf("read game summaries: %w", err)
			}
			for _, value := range values {
				if summary, ok := decodeSummary(value); ok {
					summaries = append(summaries, summary)
				}
			}
		}
		if next == 0 {
			return summaries, nil
		}
		cursor = next
	}
}

// Publish sends payload to every instance subscribed to the game's events.
func (s *Store) Publish(ctx context.Context, id string, payload []byte) error {
	if err := s.rdb.Publish(ctx, eventsChannel(id), payload).Err(); err != nil {
		return fmt.Errorf("publish event of game %s: %w", id, err)
	}
	return nil
}

// KeepOnline records the connections as open until now+lease, and drops the
// connections of the game whose lease has passed, such as those of an
// instance that stopped without closing them. The whole set expires after
// lease without a call. conns must not be empty. It returns how many
// connections were dropped.
func (s *Store) KeepOnline(
	ctx context.Context, gameID string, conns []Connection, now time.Time, lease time.Duration,
) (int64, error) {
	key := onlineKey(gameID)
	// The score of a connection is the end of its lease, in Unix milliseconds.
	deadline := float64(now.Add(lease).UnixMilli())
	members := make([]redis.Z, 0, len(conns))
	for _, c := range conns {
		members = append(members, redis.Z{Score: deadline, Member: connectionMember(c)})
	}

	var dropped *redis.IntCmd
	_, err := s.rdb.TxPipelined(ctx, func(pipe redis.Pipeliner) error {
		// Added first, so that a lease of conns that just passed is renewed
		// rather than counted as dropped.
		pipe.ZAdd(ctx, key, members...)
		dropped = pipe.ZRemRangeByScore(ctx, key, "-inf", strconv.FormatInt(now.UnixMilli(), 10))
		pipe.PExpire(ctx, key, lease)
		return nil
	})
	if err != nil {
		return 0, fmt.Errorf("keep connections of game %s online: %w", gameID, err)
	}
	return dropped.Val(), nil
}

// SetOffline forgets a connection that closed.
func (s *Store) SetOffline(ctx context.Context, gameID string, c Connection) error {
	if err := s.rdb.ZRem(ctx, onlineKey(gameID), connectionMember(c)).Err(); err != nil {
		return fmt.Errorf("set connection of game %s offline: %w", gameID, err)
	}
	return nil
}

// Online returns the tokens of the game with at least one connection whose
// lease has not passed at now. Leases that passed count as closed even before
// KeepOnline drops them.
func (s *Store) Online(ctx context.Context, gameID string, now time.Time) (map[string]bool, error) {
	members, err := s.rdb.ZRangeArgs(ctx, redis.ZRangeArgs{
		Key:     onlineKey(gameID),
		Start:   "(" + strconv.FormatInt(now.UnixMilli(), 10),
		Stop:    "+inf",
		ByScore: true,
	}).Result()
	if err != nil {
		return nil, fmt.Errorf("read online connections of game %s: %w", gameID, err)
	}
	tokens := make(map[string]bool, len(members))
	for _, member := range members {
		_, token, _ := strings.Cut(member, connectionSeparator)
		tokens[token] = true
	}
	return tokens, nil
}

// Subscribe receives the events of every game. The returned function stops
// the subscription and closes the channel; the channel also closes when ctx
// ends, releasing the Redis connection. A reader that falls behind loses
// events: go-redis buffers 100 messages and drops one it cannot hand over
// within a minute, with no Resync to tell. The server's online rounds send
// every local game again, which heals a lost update. The subscription
// survives a lost connection: once it is back, the reader gets an Event with
// Resync set.
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
		// The subscription messages show when go-redis subscribes again after
		// a lost connection; the first one was read above.
		messages := sub.ChannelWithSubscriptions()
		for {
			var message any
			select {
			case m, ok := <-messages:
				if !ok {
					return
				}
				message = m
			case <-quit:
				return
			case <-ctx.Done():
				return
			}
			ev, relevant := eventOf(message)
			if !relevant {
				continue
			}
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

// eventOf turns a message of the subscription into an Event. It reports
// false for the messages the reader has no use for.
func eventOf(message any) (Event, bool) {
	switch m := message.(type) {
	case *redis.Message:
		return Event{GameID: gameIDFromChannel(m.Channel), Payload: []byte(m.Payload)}, true
	case *redis.Subscription:
		// Only a new subscription matters, not the end of one.
		if m.Kind != "psubscribe" {
			return Event{}, false
		}
		return Event{Resync: true}, true
	default:
		return Event{}, false
	}
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

func infoKey(id string) string {
	return gamePrefix + id + infoSuffix
}

func onlineKey(id string) string {
	return onlinePrefix + id
}

func connectionMember(c Connection) string {
	return c.ID + connectionSeparator + c.Token
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

func encodeSummary(g *game.Game) ([]byte, error) {
	data, err := json.Marshal(g.Summary())
	if err != nil {
		return nil, fmt.Errorf("encode summary of game %s: %w", g.ID, err)
	}
	return data, nil
}

// decodeSummary decodes a value read by MGET. It reports false for a key that
// no longer exists (a nil value) and for a value that is not a summary.
func decodeSummary(value any) (game.Summary, bool) {
	data, ok := value.(string)
	if !ok {
		return game.Summary{}, false
	}
	var summary game.Summary
	if err := json.Unmarshal([]byte(data), &summary); err != nil {
		return game.Summary{}, false
	}
	return summary, true
}

// unseen returns the keys not in seen, and adds them to it.
func unseen(keys []string, seen map[string]bool) []string {
	fresh := make([]string, 0, len(keys))
	for _, key := range keys {
		if seen[key] {
			continue
		}
		seen[key] = true
		fresh = append(fresh, key)
	}
	return fresh
}
