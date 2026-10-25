// Package packs embeds the generated card packs shipped with the server.
package packs

import (
	"embed"
	"fmt"
	"io/fs"
	"sync"

	"github.com/alexandreroman/intothefray/internal/pack"
)

// FS holds the generated packs, laid out as dist/<lang>/*.json.
//
//go:embed dist
var FS embed.FS

// Catalog returns the English packs decoded from the embedded files. It
// decodes them on the first call only: every caller shares the same catalog,
// which is read-only and must never be modified.
var Catalog = sync.OnceValues(func() (*pack.Catalog, error) {
	dist, err := fs.Sub(FS, "dist")
	if err != nil {
		return nil, fmt.Errorf("open embedded packs: %w", err)
	}
	return pack.Load(dist, "en")
})
