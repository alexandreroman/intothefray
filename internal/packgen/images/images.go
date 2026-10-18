// Package images checks that card image URLs are alive, so that no card is
// ever shown blank.
package images

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"golang.org/x/sync/errgroup"

	"github.com/alexandreroman/intothefray/internal/pack"
	"github.com/alexandreroman/intothefray/internal/packgen/report"
)

const (
	defaultConcurrency = 16
	defaultTimeout     = 15 * time.Second
	reasonNoImage      = "no image"
)

// Checker verifies image URLs with HEAD requests.
type Checker struct {
	// HTTP performs the requests; a client with a 15 s timeout is used when nil.
	HTTP *http.Client
	// CachePath is a JSON file mapping URL to liveness. Empty disables caching.
	CachePath string
	// Concurrency bounds parallel requests; 16 when zero.
	Concurrency int
}

// Check returns, for each URL, whether it answers with a 2xx status. Results
// found in the cache are reused without any request. Definitive answers (any
// HTTP status) are cached; a network error counts as dead for this run only.
func (c *Checker) Check(ctx context.Context, urls []string) (map[string]bool, error) {
	cache, err := c.loadCache()
	if err != nil {
		return nil, err
	}

	result := make(map[string]bool, len(urls))
	var pending []string
	for _, url := range urls {
		if alive, found := cache[url]; found {
			result[url] = alive
		} else if _, seen := result[url]; !seen {
			result[url] = false // placeholder, so a duplicate URL is probed once
			pending = append(pending, url)
		}
	}

	var mu sync.Mutex // guards result and cache
	group, groupCtx := errgroup.WithContext(ctx)
	group.SetLimit(c.concurrency())
	for _, url := range pending {
		group.Go(func() error {
			alive, definitive := c.probe(groupCtx, url)
			mu.Lock()
			defer mu.Unlock()
			result[url] = alive
			if definitive {
				cache[url] = alive
			}
			return nil
		})
	}
	_ = group.Wait() // goroutines never fail; cancellation is reported below

	// Persist what was learned even when interrupted, to resume cheaply.
	if err := c.saveCache(cache); err != nil {
		return nil, err
	}
	if err := ctx.Err(); err != nil {
		return nil, fmt.Errorf("check images: %w", err)
	}
	return result, nil
}

// probe sends a HEAD request. definitive is false when no HTTP answer was
// received, in which case the outcome must not be remembered.
func (c *Checker) probe(ctx context.Context, url string) (alive, definitive bool) {
	req, err := http.NewRequestWithContext(ctx, http.MethodHead, url, nil)
	if err != nil {
		return false, false
	}
	resp, err := c.httpClient().Do(req)
	if err != nil {
		return false, false
	}
	_ = resp.Body.Close()
	return resp.StatusCode >= 200 && resp.StatusCode < 300, true
}

func (c *Checker) httpClient() *http.Client {
	if c.HTTP != nil {
		return c.HTTP
	}
	return &http.Client{Timeout: defaultTimeout}
}

func (c *Checker) concurrency() int {
	if c.Concurrency > 0 {
		return c.Concurrency
	}
	return defaultConcurrency
}

func (c *Checker) loadCache() (map[string]bool, error) {
	cache := map[string]bool{}
	if c.CachePath == "" {
		return cache, nil
	}
	data, err := os.ReadFile(c.CachePath)
	if errors.Is(err, os.ErrNotExist) {
		return cache, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read image cache: %w", err)
	}
	if err := json.Unmarshal(data, &cache); err != nil {
		return nil, fmt.Errorf("decode image cache %s: %w", c.CachePath, err)
	}
	return cache, nil
}

// saveCache writes through a temp file and a rename, so an interrupted run
// never leaves a truncated cache behind.
func (c *Checker) saveCache(cache map[string]bool) error {
	if c.CachePath == "" {
		return nil
	}
	data, err := json.MarshalIndent(cache, "", "  ") // map keys are sorted: stable diffs
	if err != nil {
		return fmt.Errorf("encode image cache: %w", err)
	}
	dir := filepath.Dir(c.CachePath)
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return fmt.Errorf("write image cache: %w", err)
	}
	tmp, err := os.CreateTemp(dir, ".tmp-*")
	if err != nil {
		return fmt.Errorf("write image cache: %w", err)
	}
	defer func() { _ = os.Remove(tmp.Name()) }() // no-op once renamed

	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		return fmt.Errorf("write image cache: %w", err)
	}
	if err := tmp.Close(); err != nil {
		return fmt.Errorf("write image cache: %w", err)
	}
	if err := os.Rename(tmp.Name(), c.CachePath); err != nil {
		return fmt.Errorf("write image cache: %w", err)
	}
	return nil
}

// DropDead removes the URLs that are not alive from every face. A card with a
// face left without any image is dropped and reported. A URL missing from
// alive counts as dead. The input cards are not modified.
func DropDead(cards []pack.Card, alive map[string]bool) (kept []pack.Card, dropped []report.Unsupported) {
	for _, card := range cards {
		filtered, ok := withLiveImages(card, alive)
		if !ok {
			dropped = append(dropped, report.Unsupported{
				Code:   card.Code,
				Name:   card.Faces[0].Name,
				Reason: reasonNoImage,
			})
			continue
		}
		kept = append(kept, filtered)
	}
	return kept, dropped
}

// withLiveImages returns a copy of card keeping only live images; ok is false
// when a face has none left.
func withLiveImages(card pack.Card, alive map[string]bool) (filtered pack.Card, ok bool) {
	filtered = card
	filtered.Faces = make([]pack.Face, len(card.Faces))
	for i, face := range card.Faces {
		face.Images = liveOnly(face.Images, alive)
		if len(face.Images) == 0 {
			return pack.Card{}, false
		}
		filtered.Faces[i] = face
	}
	return filtered, true
}

func liveOnly(urls []string, alive map[string]bool) []string {
	var live []string
	for _, url := range urls {
		if alive[url] {
			live = append(live, url)
		}
	}
	return live
}
