// Package fetch downloads JSON documents and caches the raw responses on disk.
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

// Client fetches JSON documents, reusing responses cached in CacheDir.
type Client struct {
	// HTTP performs the requests; http.DefaultClient is used when nil.
	HTTP *http.Client
	// CacheDir holds one file per URL. It is created on first write.
	CacheDir string
	// Refresh ignores existing cache files and downloads again.
	Refresh bool
}

// JSON decodes the JSON document served at url into v. The raw response is
// cached in CacheDir/<sha256(url)>.json, so repeated runs do not hit the network.
func (c *Client) JSON(ctx context.Context, url string, v any) error {
	path := c.cachePath(url)

	body, err := c.readCache(path)
	if err != nil {
		return err
	}
	if body == nil {
		body, err = c.download(ctx, url)
		if err != nil {
			return err
		}
		if err := writeFileAtomic(path, body); err != nil {
			return fmt.Errorf("cache %s: %w", url, err)
		}
	}

	if err := json.Unmarshal(body, v); err != nil {
		return fmt.Errorf("decode %s: %w", url, err)
	}
	return nil
}

func (c *Client) cachePath(url string) string {
	sum := sha256.Sum256([]byte(url))
	return filepath.Join(c.CacheDir, hex.EncodeToString(sum[:])+".json")
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

// writeFileAtomic writes through a temp file and a rename, so an interrupted
// run never leaves a truncated cache entry behind.
func writeFileAtomic(path string, data []byte) error {
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
