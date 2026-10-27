package fetch

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"
)

func TestJSONUsesCache(t *testing.T) {
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		requests.Add(1)
		_, _ = w.Write([]byte(`{"name":"Rhino"}`))
	}))
	t.Cleanup(server.Close)

	client := &Client{HTTP: server.Client(), CacheDir: t.TempDir()}
	url := server.URL + "/sets"

	for range 2 {
		var got struct{ Name string }
		if err := client.JSON(context.Background(), url, &got); err != nil {
			t.Fatal(err)
		}
		if got.Name != "Rhino" {
			t.Fatalf("Name = %q, want Rhino", got.Name)
		}
	}
	if n := requests.Load(); n != 1 {
		t.Fatalf("requests after two cached calls = %d, want 1", n)
	}

	client.Refresh = true
	var got struct{ Name string }
	if err := client.JSON(context.Background(), url, &got); err != nil {
		t.Fatal(err)
	}
	if n := requests.Load(); n != 2 {
		t.Fatalf("requests after refresh = %d, want 2", n)
	}
}

func TestJSONHTTPError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "boom", http.StatusInternalServerError)
	}))
	t.Cleanup(server.Close)

	cacheDir := t.TempDir()
	client := &Client{HTTP: server.Client(), CacheDir: cacheDir}
	url := server.URL + "/cards"

	var v any
	err := client.JSON(context.Background(), url, &v)
	if err == nil {
		t.Fatal("expected an error")
	}
	if !strings.Contains(err.Error(), url) || !strings.Contains(err.Error(), "500") {
		t.Errorf("error %q should name the URL and the status", err)
	}

	entries, readErr := os.ReadDir(cacheDir)
	if readErr != nil {
		t.Fatal(readErr)
	}
	if len(entries) != 0 {
		t.Errorf("cache dir has %d entries, want none", len(entries))
	}
}

func TestJSONDoesNotCacheInvalidBody(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("<html>maintenance</html>"))
	}))
	t.Cleanup(server.Close)

	cacheDir := t.TempDir()
	client := &Client{HTTP: server.Client(), CacheDir: cacheDir}
	url := server.URL + "/cards"

	var v any
	err := client.JSON(context.Background(), url, &v)
	if err == nil || !strings.Contains(err.Error(), url) {
		t.Fatalf("error = %v, want one naming the URL", err)
	}

	entries, readErr := os.ReadDir(cacheDir)
	if readErr != nil {
		t.Fatal(readErr)
	}
	if len(entries) != 0 {
		t.Errorf("cache dir has %d entries, want none", len(entries))
	}
}

func TestJSONSendsUserAgent(t *testing.T) {
	var agent atomic.Value
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		agent.Store(r.UserAgent())
		_, _ = w.Write([]byte(`{}`))
	}))
	t.Cleanup(server.Close)
	client := &Client{HTTP: server.Client(), CacheDir: t.TempDir(), UserAgent: "packgen-test"}

	var v any
	if err := client.JSON(context.Background(), server.URL+"/cards", &v); err != nil {
		t.Fatal(err)
	}
	if got := agent.Load(); got != "packgen-test" {
		t.Errorf("User-Agent = %v, want packgen-test", got)
	}
}

func acceptAll([]byte) error { return nil }

func TestBytesUsesCacheAndUserAgent(t *testing.T) {
	var requests atomic.Int32
	var agent atomic.Value
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		agent.Store(r.UserAgent())
		_, _ = w.Write([]byte("<html>Rhino</html>"))
	}))
	t.Cleanup(server.Close)

	cacheDir := t.TempDir()
	client := &Client{HTTP: server.Client(), CacheDir: cacheDir, UserAgent: "packgen-test"}
	url := server.URL + "/cycle/"

	for range 2 {
		got, err := client.Bytes(context.Background(), url, acceptAll)
		if err != nil {
			t.Fatal(err)
		}
		if string(got) != "<html>Rhino</html>" {
			t.Fatalf("body = %q, want the page", got)
		}
	}
	if n := requests.Load(); n != 1 {
		t.Errorf("requests after two cached calls = %d, want 1", n)
	}
	if got := agent.Load(); got != "packgen-test" {
		t.Errorf("User-Agent = %v, want packgen-test", got)
	}

	entries, err := os.ReadDir(cacheDir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 || strings.Contains(entries[0].Name(), ".") {
		t.Errorf("cache entries = %v, want one file without extension", entries)
	}
}

func TestBytesHTTPError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.NotFound(w, r)
	}))
	t.Cleanup(server.Close)

	cacheDir := t.TempDir()
	client := &Client{HTTP: server.Client(), CacheDir: cacheDir}
	url := server.URL + "/liste_carte/99/"

	if _, err := client.Bytes(context.Background(), url, acceptAll); err == nil || !strings.Contains(err.Error(), "404") {
		t.Fatalf("error = %v, want one naming the status", err)
	}
	entries, err := os.ReadDir(cacheDir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Errorf("cache dir has %d entries, want none", len(entries))
	}
}

func TestBytesDoesNotCacheRejectedBody(t *testing.T) {
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		requests.Add(1)
		_, _ = w.Write([]byte("<html>maintenance</html>"))
	}))
	t.Cleanup(server.Close)

	cacheDir := t.TempDir()
	client := &Client{HTTP: server.Client(), CacheDir: cacheDir}
	url := server.URL + "/cycle/"
	errRejected := errors.New("no pack on the page")
	reject := func([]byte) error { return errRejected }

	for range 2 {
		if _, err := client.Bytes(context.Background(), url, reject); !errors.Is(err, errRejected) {
			t.Fatalf("error = %v, want the check error", err)
		}
	}
	if n := requests.Load(); n != 2 {
		t.Errorf("requests = %d, want 2: a rejected page must not be cached", n)
	}
	entries, err := os.ReadDir(cacheDir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Errorf("cache dir has %d entries, want none", len(entries))
	}
}
