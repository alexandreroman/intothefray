package images

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/alexandreroman/intothefray/internal/pack"
)

func TestCheckUsesCacheAndHead(t *testing.T) {
	var mu sync.Mutex
	var methods []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		methods = append(methods, r.Method)
		mu.Unlock()
		if r.URL.Path == "/ok.jpg" {
			return
		}
		http.NotFound(w, r)
	}))
	defer srv.Close()

	ok, gone := srv.URL+"/ok.jpg", srv.URL+"/gone.jpg"
	checker := &Checker{CachePath: filepath.Join(t.TempDir(), "images.json")}

	got, err := checker.Check(context.Background(), []string{ok, gone})
	if err != nil {
		t.Fatalf("Check: %v", err)
	}
	if len(got) != 2 || !got[ok] || got[gone] {
		t.Errorf("result = %v, want {ok: true, gone: false}", got)
	}
	if len(methods) != 2 || slices.ContainsFunc(methods, func(m string) bool { return m != http.MethodHead }) {
		t.Errorf("methods = %v, want only HEAD", methods)
	}

	methods = nil
	got, err = checker.Check(context.Background(), []string{ok, gone})
	if err != nil {
		t.Fatalf("second Check: %v", err)
	}
	if len(methods) != 0 {
		t.Errorf("second Check made %d requests, want 0", len(methods))
	}
	if !got[ok] || got[gone] {
		t.Errorf("cached result = %v, want {ok: true, gone: false}", got)
	}
}

func TestCheckDoesNotCacheNetworkErrors(t *testing.T) {
	srv := httptest.NewServer(http.NotFoundHandler())
	url := srv.URL + "/a.jpg"
	srv.Close() // connections are now refused

	checker := &Checker{CachePath: filepath.Join(t.TempDir(), "images.json"), baseBackoff: time.Millisecond}
	got, err := checker.Check(context.Background(), []string{url})
	if !errors.Is(err, ErrInconclusive) {
		t.Fatalf("err = %v, want ErrInconclusive", err)
	}
	if got[url] {
		t.Fatalf("unreachable URL reported alive")
	}

	cached, err := checker.loadCache()
	if err != nil {
		t.Fatalf("loadCache: %v", err)
	}
	if _, found := cached[url]; found {
		t.Errorf("network error was cached")
	}
}

func TestCheckRetriesTransientAnswers(t *testing.T) {
	var mu sync.Mutex
	hits := map[string]int{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		hits[r.URL.Path]++
		n := hits[r.URL.Path]
		mu.Unlock()
		switch r.URL.Path {
		case "/flaky.jpg":
			if n == 1 {
				w.WriteHeader(http.StatusServiceUnavailable)
			}
		case "/throttled.jpg":
			w.Header().Set("Retry-After", "0")
			w.WriteHeader(http.StatusTooManyRequests)
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	flaky, throttled, gone := srv.URL+"/flaky.jpg", srv.URL+"/throttled.jpg", srv.URL+"/gone.jpg"
	checker := &Checker{CachePath: filepath.Join(t.TempDir(), "images.json"), baseBackoff: time.Millisecond}

	got, err := checker.Check(context.Background(), []string{flaky, throttled, gone})
	if !errors.Is(err, ErrInconclusive) || !strings.Contains(err.Error(), throttled) {
		t.Fatalf("err = %v, want ErrInconclusive naming %s", err, throttled)
	}
	if !got[flaky] || got[throttled] || got[gone] {
		t.Errorf("result = %v", got)
	}
	if hits["/flaky.jpg"] != 2 || hits["/throttled.jpg"] != 3 || hits["/gone.jpg"] != 1 {
		t.Errorf("hits = %v, want flaky 2, throttled 3, gone 1", hits)
	}

	cached, err := checker.loadCache()
	if err != nil {
		t.Fatalf("loadCache: %v", err)
	}
	if !cached[flaky] || cached[gone] {
		t.Errorf("cache = %v, want flaky alive and gone dead", cached)
	}
	if _, found := cached[throttled]; found {
		t.Errorf("inconclusive URL was cached")
	}
	if _, found := cached[gone]; !found {
		t.Errorf("404 was not cached")
	}
}

func TestDropDeadImages(t *testing.T) {
	face := func(name string, images ...string) pack.Face { return pack.Face{Name: name, Images: images} }
	cards := []pack.Card{
		{Code: "01", Faces: []pack.Face{face("Partial", "gone", "ok")}},
		{Code: "02", Faces: []pack.Face{face("Blank", "gone")}},
		{Code: "03", Faces: []pack.Face{face("Front", "ok"), face("Back", "gone")}},
	}
	alive := map[string]bool{"ok": true, "gone": false}

	kept, dropped := DropDead(cards, alive)

	if len(kept) != 1 || kept[0].Code != "01" {
		t.Fatalf("kept = %+v, want only card 01", kept)
	}
	if got := kept[0].Faces[0].Images; !slices.Equal(got, []string{"ok"}) {
		t.Errorf("images = %v, want [ok]", got)
	}
	if len(dropped) != 2 || dropped[0].Code != "02" || dropped[0].Name != "Blank" || dropped[0].Reason != "no image" ||
		dropped[1].Code != "03" || dropped[1].Name != "Front" {
		t.Errorf("dropped = %+v", dropped)
	}
	if len(cards[0].Faces[0].Images) != 2 {
		t.Errorf("input card was modified")
	}
}
