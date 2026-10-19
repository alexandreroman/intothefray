package store

import (
	"context"
	"errors"
	"maps"
	"sync"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"

	"github.com/alexandreroman/intothefray/internal/game"
)

const testTTL = 24 * time.Hour

func newTestStore(t *testing.T) (*Store, *miniredis.Miniredis) {
	t.Helper()
	mr := miniredis.RunT(t)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rdb.Close() })
	return New(rdb, testTTL), mr
}

func newGame(id string) *game.Game {
	return &game.Game{ID: id, Phase: game.PhaseLobby}
}

func TestCreateLoadRoundTrip(t *testing.T) {
	s, mr := newTestStore(t)
	ctx := t.Context()

	if err := s.Create(ctx, newGame("abc")); err != nil {
		t.Fatalf("Create: %v", err)
	}
	g, version, err := s.Load(ctx, "abc")
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if g.ID != "abc" || g.Phase != game.PhaseLobby {
		t.Errorf("loaded game = %+v", g)
	}
	if version != 1 {
		t.Errorf("version = %d, want 1", version)
	}
	if ttl := mr.TTL("game:abc"); ttl != testTTL {
		t.Errorf("ttl = %v, want %v", ttl, testTTL)
	}
}

func TestCreateExistingGameFails(t *testing.T) {
	s, _ := newTestStore(t)
	ctx := t.Context()

	if err := s.Create(ctx, newGame("abc")); err != nil {
		t.Fatalf("Create: %v", err)
	}
	if err := s.Create(ctx, newGame("abc")); !errors.Is(err, ErrExists) {
		t.Errorf("second Create: err = %v, want ErrExists", err)
	}
}

func TestLoadUnknownGame(t *testing.T) {
	s, _ := newTestStore(t)

	_, _, err := s.Load(t.Context(), "nope")
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("err = %v, want ErrNotFound", err)
	}
}

func TestUpdateUnknownGame(t *testing.T) {
	s, _ := newTestStore(t)

	_, _, err := s.Update(t.Context(), "nope", func(*game.Game) error { return nil })
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("err = %v, want ErrNotFound", err)
	}
}

func TestUpdateIncrementsVersionAndTTL(t *testing.T) {
	s, mr := newTestStore(t)
	ctx := t.Context()
	if err := s.Create(ctx, newGame("abc")); err != nil {
		t.Fatalf("Create: %v", err)
	}
	mr.FastForward(time.Hour)

	g, version, err := s.Update(ctx, "abc", func(g *game.Game) error {
		g.Phase = game.PhasePlaying
		return nil
	})
	if err != nil {
		t.Fatalf("Update: %v", err)
	}
	if version != 2 || g.Phase != game.PhasePlaying {
		t.Errorf("Update returned version %d, phase %q", version, g.Phase)
	}
	if ttl := mr.TTL("game:abc"); ttl != testTTL {
		t.Errorf("ttl = %v, want %v (reset by the write)", ttl, testTTL)
	}

	loaded, loadedVersion, err := s.Load(ctx, "abc")
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if loadedVersion != 2 || loaded.Phase != game.PhasePlaying {
		t.Errorf("Load returned version %d, phase %q", loadedVersion, loaded.Phase)
	}
}

func TestUpdateRetriesOnConflict(t *testing.T) {
	s, _ := newTestStore(t)
	ctx := t.Context()
	if err := s.Create(ctx, newGame("abc")); err != nil {
		t.Fatalf("Create: %v", err)
	}

	const writers = 20
	var wg sync.WaitGroup
	errs := make(chan error, writers)
	for range writers {
		wg.Go(func() {
			_, _, err := s.Update(ctx, "abc", func(g *game.Game) error {
				g.Log = append(g.Log, game.LogEntry{Text: "line"})
				return nil
			})
			errs <- err
		})
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Errorf("Update: %v", err)
		}
	}

	g, version, err := s.Load(ctx, "abc")
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if len(g.Log) != writers {
		t.Errorf("log has %d lines, want %d", len(g.Log), writers)
	}
	if version != writers+1 {
		t.Errorf("version = %d, want %d", version, writers+1)
	}
}

func TestUpdateFnErrorWritesNothing(t *testing.T) {
	s, _ := newTestStore(t)
	ctx := t.Context()
	if err := s.Create(ctx, newGame("abc")); err != nil {
		t.Fatalf("Create: %v", err)
	}
	wantErr := errors.New("refused")

	_, _, err := s.Update(ctx, "abc", func(g *game.Game) error {
		g.Phase = game.PhasePlaying
		return wantErr
	})
	if !errors.Is(err, wantErr) {
		t.Errorf("err = %v, want %v", err, wantErr)
	}

	g, version, err := s.Load(ctx, "abc")
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if version != 1 || g.Phase != game.PhaseLobby {
		t.Errorf("stored game changed: version %d, phase %q", version, g.Phase)
	}
}

func TestEndedGameTTL(t *testing.T) {
	s, mr := newTestStore(t)
	ctx := t.Context()
	if err := s.Create(ctx, newGame("abc")); err != nil {
		t.Fatalf("Create: %v", err)
	}

	_, _, err := s.Update(ctx, "abc", func(g *game.Game) error {
		g.Phase = game.PhaseEnded
		return nil
	})
	if err != nil {
		t.Fatalf("Update: %v", err)
	}
	if ttl := mr.TTL("game:abc"); ttl != time.Hour {
		t.Errorf("ttl = %v, want 1h", ttl)
	}
}

func TestTouch(t *testing.T) {
	s, mr := newTestStore(t)
	ctx := t.Context()
	if err := s.Create(ctx, newGame("abc")); err != nil {
		t.Fatalf("Create: %v", err)
	}
	mr.FastForward(time.Hour)

	if err := s.Touch(ctx, "abc"); err != nil {
		t.Fatalf("Touch: %v", err)
	}
	if ttl := mr.TTL("game:abc"); ttl != testTTL {
		t.Errorf("ttl = %v, want %v", ttl, testTTL)
	}
	if err := s.Touch(ctx, "nope"); !errors.Is(err, ErrNotFound) {
		t.Errorf("Touch unknown: err = %v, want ErrNotFound", err)
	}
}

func TestTouchEndedGameKeepsShortTTL(t *testing.T) {
	s, mr := newTestStore(t)
	ctx := t.Context()
	if err := s.Create(ctx, newGame("abc")); err != nil {
		t.Fatalf("Create: %v", err)
	}
	_, _, err := s.Update(ctx, "abc", func(g *game.Game) error {
		g.Phase = game.PhaseEnded
		return nil
	})
	if err != nil {
		t.Fatalf("Update: %v", err)
	}
	mr.FastForward(30 * time.Minute)

	if err := s.Touch(ctx, "abc"); err != nil {
		t.Fatalf("Touch: %v", err)
	}
	if ttl := mr.TTL("game:abc"); ttl != time.Hour {
		t.Errorf("ttl = %v, want 1h", ttl)
	}
}

const testLease = 90 * time.Second

// online returns the online tokens of game abc at now, and fails the test on
// an error.
func online(t *testing.T, s *Store, now time.Time) map[string]bool {
	t.Helper()
	tokens, err := s.Online(t.Context(), "abc", now)
	if err != nil {
		t.Fatalf("Online: %v", err)
	}
	return tokens
}

func TestKeepOnline(t *testing.T) {
	s, mr := newTestStore(t)
	now := time.Now()
	conns := []Connection{{Token: "alex", ID: "tab1"}, {Token: "alex", ID: "tab2"}, {Token: "bob", ID: "tab1"}}

	dropped, err := s.KeepOnline(t.Context(), "abc", conns, now, testLease)
	if err != nil {
		t.Fatalf("KeepOnline: %v", err)
	}

	if dropped != 0 {
		t.Errorf("dropped = %d, want 0", dropped)
	}
	if got, want := online(t, s, now), map[string]bool{"alex": true, "bob": true}; !maps.Equal(got, want) {
		t.Errorf("online = %v, want %v", got, want)
	}
	if ttl := mr.TTL("online:abc"); ttl != testLease {
		t.Errorf("ttl = %v, want the lease %v", ttl, testLease)
	}
	if got := online(t, s, now.Add(testLease)); len(got) != 0 {
		t.Errorf("online once the lease passed = %v, want none", got)
	}
}

func TestKeepOnlineDropsPassedLeases(t *testing.T) {
	s, _ := newTestStore(t)
	ctx := t.Context()
	start := time.Now()
	if _, err := s.KeepOnline(ctx, "abc", []Connection{{Token: "gone", ID: "tab1"}}, start, testLease); err != nil {
		t.Fatalf("KeepOnline gone: %v", err)
	}
	if _, err := s.KeepOnline(ctx, "abc", []Connection{{Token: "alex", ID: "tab1"}}, start, testLease); err != nil {
		t.Fatalf("KeepOnline alex: %v", err)
	}

	// Only alex is renewed once the first leases passed.
	later := start.Add(testLease + time.Second)
	dropped, err := s.KeepOnline(ctx, "abc", []Connection{{Token: "alex", ID: "tab1"}}, later, testLease)
	if err != nil {
		t.Fatalf("KeepOnline: %v", err)
	}

	if dropped != 1 {
		t.Errorf("dropped = %d, want 1", dropped)
	}
	if got, want := online(t, s, later), map[string]bool{"alex": true}; !maps.Equal(got, want) {
		t.Errorf("online = %v, want %v", got, want)
	}
}

func TestSetOfflineKeepsOtherConnections(t *testing.T) {
	s, _ := newTestStore(t)
	ctx := t.Context()
	now := time.Now()
	conns := []Connection{{Token: "alex", ID: "tab1"}, {Token: "alex", ID: "tab2"}, {Token: "bob", ID: "tab1"}}
	if _, err := s.KeepOnline(ctx, "abc", conns, now, testLease); err != nil {
		t.Fatalf("KeepOnline: %v", err)
	}

	for _, c := range []Connection{{Token: "alex", ID: "tab1"}, {Token: "bob", ID: "tab1"}} {
		if err := s.SetOffline(ctx, "abc", c); err != nil {
			t.Fatalf("SetOffline %+v: %v", c, err)
		}
	}

	if got, want := online(t, s, now), map[string]bool{"alex": true}; !maps.Equal(got, want) {
		t.Errorf("online = %v, want alex, still connected in another tab", got)
	}
}

func TestOnlineOfGameWithoutConnections(t *testing.T) {
	s, _ := newTestStore(t)

	if got := online(t, s, time.Now()); len(got) != 0 {
		t.Errorf("online = %v, want none", got)
	}
}

func TestPublishSubscribe(t *testing.T) {
	s, _ := newTestStore(t)
	events, closeSub := subscribe(t.Context(), t, s)

	if err := s.Publish(t.Context(), "abc", []byte("hello")); err != nil {
		t.Fatalf("Publish: %v", err)
	}

	select {
	case ev := <-events:
		if ev.GameID != "abc" || string(ev.Payload) != "hello" {
			t.Errorf("event = %+v", ev)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("no event received")
	}

	if err := closeSub(); err != nil {
		t.Errorf("close: %v", err)
	}
	select {
	case _, ok := <-events:
		if ok {
			t.Error("event after close, want a closed channel")
		}
	case <-time.After(5 * time.Second):
		t.Fatal("channel not closed")
	}
}

func subscribe(ctx context.Context, t *testing.T, s *Store) (<-chan Event, func() error) {
	t.Helper()
	events, closeSub, err := s.Subscribe(ctx)
	if err != nil {
		t.Fatalf("Subscribe: %v", err)
	}
	return events, closeSub
}

// returnsWithin fails the test when fn does not return in time.
func returnsWithin(t *testing.T, what string, fn func()) {
	t.Helper()
	returned := make(chan struct{})
	go func() {
		fn()
		close(returned)
	}()
	select {
	case <-returned:
	case <-time.After(5 * time.Second):
		t.Fatalf("%s did not return", what)
	}
}

func TestCloseWithUnreadEvent(t *testing.T) {
	s, _ := newTestStore(t)
	_, closeSub := subscribe(t.Context(), t, s)
	if err := s.Publish(t.Context(), "abc", []byte("unread")); err != nil {
		t.Fatalf("Publish: %v", err)
	}
	time.Sleep(50 * time.Millisecond) // let the forwarder block on the send

	returnsWithin(t, "close", func() { _ = closeSub() })
}

func TestContextCancelClosesChannel(t *testing.T) {
	s, _ := newTestStore(t)
	ctx, cancel := context.WithCancel(t.Context())
	events, closeSub := subscribe(ctx, t, s)

	cancel()
	select {
	case _, ok := <-events:
		if ok {
			t.Fatal("event after cancel, want a closed channel")
		}
	case <-time.After(5 * time.Second):
		t.Fatal("channel not closed after cancel")
	}
	returnsWithin(t, "close after cancel", func() { _ = closeSub() })
}

func TestSubscribeFailsWhenRedisIsDown(t *testing.T) {
	s, mr := newTestStore(t)
	mr.Close()

	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()
	if _, _, err := s.Subscribe(ctx); err == nil {
		t.Error("Subscribe succeeded without Redis, want an error")
	}
}

func TestResubscribeSendsResync(t *testing.T) {
	s, mr := newTestStore(t)
	events, _ := subscribe(t.Context(), t, s)

	mr.Close()
	if err := mr.Restart(); err != nil {
		t.Fatalf("restart Redis: %v", err)
	}

	select {
	case ev := <-events:
		if !ev.Resync || ev.GameID != "" || ev.Payload != nil {
			t.Errorf("event = %+v, want a resync notice", ev)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("no resync notice after the connection came back")
	}

	if err := s.Publish(t.Context(), "abc", []byte("hello")); err != nil {
		t.Fatalf("Publish: %v", err)
	}
	select {
	case ev := <-events:
		if ev.Resync || ev.GameID != "abc" || string(ev.Payload) != "hello" {
			t.Errorf("event = %+v, want the published one", ev)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("no event received after the resync")
	}
}
