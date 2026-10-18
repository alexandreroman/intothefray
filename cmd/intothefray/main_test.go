package main

import (
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/alicebob/miniredis/v2"
)

func TestHealthcheck(t *testing.T) {
	tests := []struct {
		name    string
		status  int
		wantErr bool
	}{
		{"healthy", http.StatusOK, false},
		{"unhealthy", http.StatusServiceUnavailable, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// The healthcheck dials a fixed 127.0.0.1 address: httptest
			// listens there too, so only the port is passed along.
			ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != "/healthz" {
					t.Errorf("path = %q, want /healthz", r.URL.Path)
				}
				w.WriteHeader(tt.status)
			}))
			t.Cleanup(ts.Close)

			err := healthcheck(portOf(t, ts.URL))

			if (err != nil) != tt.wantErr {
				t.Errorf("healthcheck() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestHealthcheckNothingListening(t *testing.T) {
	ts := httptest.NewServer(http.NotFoundHandler())
	port := portOf(t, ts.URL)
	ts.Close()

	if err := healthcheck(port); err == nil {
		t.Error("healthcheck() = nil, want an error")
	}
}

func TestConnectRedis(t *testing.T) {
	mr := miniredis.RunT(t)
	redisURL := "redis://" + mr.Addr() + "/0"

	rdb, err := connectRedis(t.Context(), redisURL)
	if err != nil {
		t.Fatalf("connectRedis: %v", err)
	}
	_ = rdb.Close()

	mr.Close()
	if _, err := connectRedis(t.Context(), redisURL); err == nil {
		t.Error("connectRedis on a stopped server = nil, want an error")
	}
}

func TestConnectRedisInvalidURL(t *testing.T) {
	if _, err := connectRedis(t.Context(), "not a url"); err == nil {
		t.Error("connectRedis(invalid) = nil, want an error")
	}
}

func portOf(t *testing.T, rawURL string) string {
	t.Helper()

	u, err := url.Parse(rawURL)
	if err != nil {
		t.Fatal(err)
	}
	_, port, err := net.SplitHostPort(u.Host)
	if err != nil {
		t.Fatal(err)
	}
	return port
}

func TestHTTPServerTimeouts(t *testing.T) {
	srv := newHTTPServer("127.0.0.1:0", http.NotFoundHandler())

	if srv.ReadHeaderTimeout <= 0 {
		t.Errorf("ReadHeaderTimeout = %v, want a bound on slow headers", srv.ReadHeaderTimeout)
	}
	if srv.IdleTimeout <= 0 {
		t.Errorf("IdleTimeout = %v, want idle keep-alive connections closed", srv.IdleTimeout)
	}
	// Both would also cut the WebSocket connections, which outlive any request.
	if srv.ReadTimeout != 0 || srv.WriteTimeout != 0 {
		t.Errorf("ReadTimeout = %v, WriteTimeout = %v, want none", srv.ReadTimeout, srv.WriteTimeout)
	}
}
