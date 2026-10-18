// Command intothefray runs the Into The Fray game server.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/redis/go-redis/v9"
	"golang.org/x/sync/errgroup"

	"github.com/alexandreroman/intothefray/internal/config"
	"github.com/alexandreroman/intothefray/internal/decks"
	"github.com/alexandreroman/intothefray/internal/server"
	"github.com/alexandreroman/intothefray/internal/store"
	"github.com/alexandreroman/intothefray/packs"
)

const (
	readHeaderTimeout  = 10 * time.Second
	idleTimeout        = 2 * time.Minute
	shutdownTimeout    = 10 * time.Second
	redisPingTimeout   = 5 * time.Second
	healthcheckTimeout = 3 * time.Second
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))

	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		if err := healthcheck(os.Getenv("PORT")); err != nil {
			slog.Error("healthcheck failed", "error", err)
			os.Exit(1)
		}
		return
	}

	if err := run(); err != nil {
		slog.Error("server failed", "error", err)
		os.Exit(1)
	}
}

// run wires the application and blocks until it fails or receives
// SIGINT/SIGTERM, in which case it shuts down gracefully.
func run() error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	cfg, err := config.Load(os.Getenv)
	if err != nil {
		return fmt.Errorf("load config: %w", err)
	}

	rdb, err := connectRedis(ctx, cfg.RedisURL)
	if err != nil {
		return err
	}
	defer func() { _ = rdb.Close() }()

	catalog, err := packs.Catalog()
	if err != nil {
		return fmt.Errorf("load card packs: %w", err)
	}

	app := server.New(server.Deps{
		Config:  cfg,
		Store:   store.New(rdb, cfg.GameTTL),
		Catalog: catalog,
		Decks:   &decks.Importer{BaseURL: cfg.MarvelcdbURL},
		Now:     time.Now,
		Logger:  slog.Default(),
	})

	addr := net.JoinHostPort("0.0.0.0", cfg.Port)
	httpServer := newHTTPServer(addr, app.Handler())

	group, groupCtx := errgroup.WithContext(ctx)
	group.Go(func() error {
		slog.Info("server listening", "addr", addr)
		// ListenAndServe only returns ErrServerClosed after a shutdown.
		if err := httpServer.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
			return fmt.Errorf("listen on %s: %w", addr, err)
		}
		return nil
	})
	group.Go(func() error {
		return app.Run(groupCtx)
	})
	group.Go(func() error {
		<-groupCtx.Done()
		// Restore default signal handling so that a second signal kills the process immediately.
		stop()
		slog.Info("shutting down", "timeout", shutdownTimeout.String())

		shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
		defer cancel()
		if err := httpServer.Shutdown(shutdownCtx); err != nil {
			return fmt.Errorf("shut down server: %w", err)
		}
		return nil
	})

	if err := group.Wait(); err != nil {
		return err
	}
	slog.Info("server stopped")
	return nil
}

// newHTTPServer configures the HTTP server. It sets no ReadTimeout nor
// WriteTimeout: they would also cut the WebSocket connections, which outlive
// any request. The create-game handler bounds its body read itself.
func newHTTPServer(addr string, handler http.Handler) *http.Server {
	return &http.Server{
		Addr:    addr,
		Handler: handler,
		// Bounds how long a client may take to send headers (Slowloris protection).
		ReadHeaderTimeout: readHeaderTimeout,
		// Closes the keep-alive connections nobody uses any more.
		IdleTimeout: idleTimeout,
	}
}

// connectRedis opens the Redis client and fails fast when the server is
// unreachable.
func connectRedis(ctx context.Context, url string) (*redis.Client, error) {
	options, err := redis.ParseURL(url)
	if err != nil {
		return nil, fmt.Errorf("parse REDIS_URL: %w", err)
	}
	rdb := redis.NewClient(options)

	pingCtx, cancel := context.WithTimeout(ctx, redisPingTimeout)
	defer cancel()
	if err := rdb.Ping(pingCtx).Err(); err != nil {
		_ = rdb.Close()
		return nil, fmt.Errorf("ping redis: %w", err)
	}
	return rdb, nil
}

// healthcheck probes the local server. It backs the container healthcheck,
// as the image has no curl. An empty port selects the default one.
func healthcheck(port string) error {
	if port == "" {
		port = config.DefaultPort
	}
	ctx, cancel := context.WithTimeout(context.Background(), healthcheckTimeout)
	defer cancel()

	url := "http://" + net.JoinHostPort("127.0.0.1", port) + "/healthz"
	// The target is always the loopback address; only the port comes from the environment.
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, http.NoBody) //nolint:gosec // loopback target
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	resp, err := http.DefaultClient.Do(req) //nolint:gosec // loopback target, see above
	if err != nil {
		return fmt.Errorf("get %s: %w", url, err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("get %s: status %d", url, resp.StatusCode)
	}
	return nil
}
