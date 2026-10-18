// Package packs embeds the generated card packs shipped with the server.
package packs

import (
	"embed"
	"fmt"
	"io/fs"

	"github.com/alexandreroman/intothefray/internal/pack"
)

// FS holds the generated packs, laid out as dist/<lang>/*.json.
//
//go:embed dist
var FS embed.FS

// Catalog loads the English packs from the embedded files.
func Catalog() (*pack.Catalog, error) {
	dist, err := fs.Sub(FS, "dist")
	if err != nil {
		return nil, fmt.Errorf("open embedded packs: %w", err)
	}
	return pack.Load(dist, "en")
}
