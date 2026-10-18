package fetch

import (
	"context"
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
