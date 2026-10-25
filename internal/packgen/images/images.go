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
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/sync/errgroup"

	"github.com/alexandreroman/intothefray/internal/pack"
	"github.com/alexandreroman/intothefray/internal/packgen/report"
)

const (
	maxConcurrent  = 16 // parallel requests
	defaultTimeout = 15 * time.Second
	reasonNoImage  = "no image"
	maxAttempts    = 3
	defaultBackoff = 500 * time.Millisecond
	maxBackoff     = 10 * time.Second
)

// Checker verifies image URLs with HEAD requests.
type Checker struct {
	// HTTP performs the requests; a client with a 15 s timeout is used when nil.
	HTTP *http.Client
	// CachePath is a JSON file mapping URL to liveness. Empty disables caching.
	CachePath string
	// UserAgent identifies the requests; Go's default is sent when empty.
	// Some hosts, such as mc4db, throttle Go's default with 429 answers.
	UserAgent string

	baseBackoff time.Duration // delay unit between attempts; tests shrink it
}

// ErrInconclusive reports URLs that never gave a definitive answer.
var ErrInconclusive = errors.New("inconclusive image checks")

type verdict int

const (
	verdictAlive verdict = iota
	verdictDead
	verdictInconclusive
)

// Check returns, for each URL, whether it is alive. Only definitive answers
// count: 2xx is alive, 404 and 410 are dead, and only those are cached and
// reused without any request. Any other answer (429, 5xx, other 4xx) or a
// network error is retried, up to 3 attempts in total, and is never cached.
//
// When some URLs stay inconclusive, Check still returns the map (those URLs
// are false) together with an error wrapping ErrInconclusive, so the caller
// can fail the run instead of treating unknown as dead.
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

	var mu sync.Mutex // guards result, cache and inconclusive
	var inconclusive []string
	group, groupCtx := errgroup.WithContext(ctx)
	group.SetLimit(maxConcurrent)
	for _, url := range pending {
		group.Go(func() error {
			v := c.probeWithRetries(groupCtx, url)
			mu.Lock()
			defer mu.Unlock()
			switch v {
			case verdictAlive, verdictDead:
				result[url] = v == verdictAlive
				cache[url] = v == verdictAlive
			case verdictInconclusive:
				inconclusive = append(inconclusive, url)
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
	if len(inconclusive) > 0 {
		return result, inconclusiveError(inconclusive)
	}
	return result, nil
}

func inconclusiveError(urls []string) error {
	const maxExamples = 3
	slices.Sort(urls) // goroutines finish in random order
	examples := urls[:min(len(urls), maxExamples)]
	return fmt.Errorf("%w: %d URL(s) without a definitive answer, e.g. %s",
		ErrInconclusive, len(urls), strings.Join(examples, ", "))
}

// probeWithRetries retries inconclusive answers with a growing backoff.
func (c *Checker) probeWithRetries(ctx context.Context, url string) verdict {
	for attempt := 1; ; attempt++ {
		v, retryAfter := c.probe(ctx, url)
		if v != verdictInconclusive || attempt == maxAttempts {
			return v
		}
		if !sleep(ctx, c.backoff(attempt, retryAfter)) {
			return verdictInconclusive
		}
	}
}

// backoff honours the server's Retry-After when given, capped at maxBackoff.
func (c *Checker) backoff(attempt int, retryAfter time.Duration) time.Duration {
	delay := retryAfter
	if delay <= 0 {
		base := c.baseBackoff
		if base <= 0 {
			base = defaultBackoff
		}
		delay = base * time.Duration(attempt)
	}
	return min(delay, maxBackoff)
}

// sleep waits for d and reports false when ctx ended first.
func sleep(ctx context.Context, d time.Duration) bool {
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-timer.C:
		return true
	case <-ctx.Done():
		return false
	}
}

// probe sends one HEAD request. retryAfter is the delay requested by the
// server, zero when absent.
func (c *Checker) probe(ctx context.Context, url string) (v verdict, retryAfter time.Duration) {
	req, err := http.NewRequestWithContext(ctx, http.MethodHead, url, nil)
	if err != nil {
		return verdictInconclusive, 0
	}
	if c.UserAgent != "" {
		req.Header.Set("User-Agent", c.UserAgent)
	}
	resp, err := c.httpClient().Do(req)
	if err != nil {
		return verdictInconclusive, 0
	}
	_ = resp.Body.Close()

	switch {
	case resp.StatusCode >= 200 && resp.StatusCode < 300:
		return verdictAlive, 0
	case resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusGone:
		return verdictDead, 0
	}
	seconds, err := strconv.Atoi(resp.Header.Get("Retry-After"))
	if err != nil || seconds < 0 {
		return verdictInconclusive, 0
	}
	return verdictInconclusive, time.Duration(seconds) * time.Second
}

func (c *Checker) httpClient() *http.Client {
	if c.HTTP != nil {
		return c.HTTP
	}
	return &http.Client{Timeout: defaultTimeout}
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

// DropDead removes the URLs that are not alive from every face, localized
// images included. A card with a face left without any English image is
// dropped and reported; localized data never drops a card, since the English
// images are the fallback. A localized entry left empty is removed. A URL
// missing from alive counts as dead. The input cards are not modified.
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
		face.Localized = liveLocalized(face.Localized, alive)
		filtered.Faces[i] = face
	}
	return filtered, true
}

// liveLocalized returns a new map of the overrides keeping only live images.
// An override left empty is removed, and nil is returned when none remains, so
// no empty entry is ever written.
func liveLocalized(overrides map[string]pack.Localized, alive map[string]bool) map[string]pack.Localized {
	var live map[string]pack.Localized
	for lang, override := range overrides {
		override.Images = liveOnly(override.Images, alive)
		if override.IsZero() {
			continue
		}
		if live == nil {
			live = make(map[string]pack.Localized, len(overrides))
		}
		live[lang] = override
	}
	return live
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
