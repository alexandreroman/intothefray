// Package storetest holds test helpers for the code that talks to Redis
// through the store.
package storetest

import (
	"context"
	"errors"
	"net"
	"sync/atomic"
	"testing"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

// RestartableClient returns a client of mr and a function that restarts mr.
// miniredis listens before it registers its commands, so a client that
// redials during the restart can reach a server that answers every command,
// PSUBSCRIBE included, with "unknown command". The client refuses to dial
// while the restart is in progress, as if the server were still down.
func RestartableClient(t testing.TB, mr *miniredis.Miniredis) (*redis.Client, func()) {
	t.Helper()

	var down atomic.Bool
	rdb := redis.NewClient(&redis.Options{
		Addr: mr.Addr(),
		Dialer: func(ctx context.Context, network, addr string) (net.Conn, error) {
			if down.Load() {
				return nil, errors.New("redis is restarting")
			}
			return (&net.Dialer{}).DialContext(ctx, network, addr)
		},
	})
	t.Cleanup(func() { _ = rdb.Close() })

	restart := func() {
		t.Helper()
		down.Store(true)
		mr.Close()
		if err := mr.Restart(); err != nil {
			t.Fatalf("restart Redis: %v", err)
		}
		down.Store(false)
	}
	return rdb, restart
}
