// Command intothefray runs the Into The Fray game server.
package main

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

const (
	defaultPort       = "8080"
	readHeaderTimeout = 10 * time.Second
	shutdownTimeout   = 10 * time.Second
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))

	if err := run(); err != nil {
		slog.Error("server failed", "error", err)
		os.Exit(1)
	}
}

// run starts the HTTP server and blocks until it fails or receives
// SIGINT/SIGTERM, in which case it shuts down gracefully.
func run() error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	addr := net.JoinHostPort("0.0.0.0", port())
	server := &http.Server{
		Addr:    addr,
		Handler: newMux(),
		// Bounds how long a client may take to send headers (Slowloris protection).
		ReadHeaderTimeout: readHeaderTimeout,
	}

	serveErr := make(chan error, 1)
	go func() {
		slog.Info("server listening", "addr", addr)
		serveErr <- server.ListenAndServe()
	}()

	select {
	case err := <-serveErr:
		// ListenAndServe only returns early on a real failure, such as a port already in use.
		return fmt.Errorf("listen on %s: %w", addr, err)
	case <-ctx.Done():
	}

	// Restore default signal handling so that a second signal kills the process immediately.
	stop()
	slog.Info("shutting down", "timeout", shutdownTimeout.String())

	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("shut down server: %w", err)
	}

	slog.Info("server stopped")
	return nil
}

// port returns the listen port from the PORT environment variable, or the default one.
func port() string {
	if p := os.Getenv("PORT"); p != "" {
		return p
	}
	return defaultPort
}

// newMux builds the HTTP routes served by the application.
func newMux() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", handleHealthz)
	return mux
}

func handleHealthz(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	// A failed write means the client is gone: there is nobody left to report it to.
	_, _ = io.WriteString(w, "ok")
}
