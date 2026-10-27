// Package fetch downloads documents and caches the raw responses on disk.
package fetch

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
)

// Client fetches documents, reusing responses cached in CacheDir.
type Client struct {
	// HTTP performs the requests; http.DefaultClient is used when nil.
	HTTP *http.Client
	// CacheDir holds one file per URL. It is created on first write.
	CacheDir string
	// Refresh ignores existing cache files and downloads again.
	Refresh bool
	// UserAgent identifies the requests; Go's default is sent when empty.
	UserAgent string
}

// JSON decodes the JSON document served at url into v. The raw response is
// cached in CacheDir/<sha256(url)>.json, so repeated runs do not hit the network.
func (c *Client) JSON(ctx context.Context, url string, v any) error {
	// Cache only a body that decodes, so an error page is never replayed.
	decodeInto := func(body []byte) error { return decode(url, body, v) }
	_, err := c.get(ctx, url, c.cachePath(url, ".json"), decodeInto)
	return err
}

// Bytes returns the document served at url as is, e.g. an HTML page. The
// response is cached in CacheDir/<sha256(url)>, without an extension since its
// type is unknown.
func (c *Client) Bytes(ctx context.Context, url string) ([]byte, error) {
	accept := func([]byte) error { return nil }
	return c.get(ctx, url, c.cachePath(url, ""), accept)
}

// get returns the body served at url, from the cache file at path when there
// is one. A downloaded body is cached only when check accepts it; a cached one
// is checked too, so a check error always reaches the caller.
func (c *Client) get(ctx context.Context, url, path string, check func([]byte) error) ([]byte, error) {
	body, err := c.readCache(path)
	if err != nil {
		return nil, err
	}
	if body != nil {
		return body, check(body)
	}

	body, err = c.download(ctx, url)
	if err != nil {
		return nil, err
	}
	if err := check(body); err != nil {
		return nil, err
	}
	if err := WriteFileAtomic(path, body); err != nil {
		return nil, fmt.Errorf("cache %s: %w", url, err)
	}
	return body, nil
}

func decode(url string, body []byte, v any) error {
	if err := json.Unmarshal(body, v); err != nil {
		return fmt.Errorf("decode %s: %w", url, err)
	}
	return nil
}

// cachePath returns the cache file of url, named after the hash of url and
// ending with ext.
func (c *Client) cachePath(url, ext string) string {
	sum := sha256.Sum256([]byte(url))
	return filepath.Join(c.CacheDir, hex.EncodeToString(sum[:])+ext)
}

// readCache returns nil, nil when there is nothing usable in the cache.
func (c *Client) readCache(path string) ([]byte, error) {
	if c.Refresh {
		return nil, nil
	}
	body, err := os.ReadFile(path) //nolint:gosec // path is derived from a hash under CacheDir
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read cache: %w", err)
	}
	return body, nil
}

func (c *Client) download(ctx context.Context, url string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("build request for %s: %w", url, err)
	}
	if c.UserAgent != "" {
		req.Header.Set("User-Agent", c.UserAgent)
	}

	httpClient := c.HTTP
	if httpClient == nil {
		httpClient = http.DefaultClient
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("get %s: %w", url, err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("get %s: unexpected status %s", url, resp.Status)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", url, err)
	}
	return body, nil
}

// WriteFileAtomic writes data to path through a temp file and a rename, so an
// interrupted run never leaves a truncated cache file behind. It creates the
// directory of path when missing.
func WriteFileAtomic(path string, data []byte) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, ".tmp-*")
	if err != nil {
		return err
	}
	defer func() { _ = os.Remove(tmp.Name()) }() // no-op once renamed

	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), path)
}
