// Package cdn holds the contracts packgen shares with the intothefray-img pipeline: the sources.json packgen
// writes, and the manifest.json the pipeline writes back with the image URLs on the CDN.
package cdn

import (
	"bytes"
	"cmp"
	"encoding/json"
	"fmt"
	"os"
	"slices"
	"strings"

	"github.com/alexandreroman/intothefray/internal/packgen/fetch"
)

// manifestVersion and sourcesVersion are the contract versions this package reads and writes.
const (
	manifestVersion = 1
	sourcesVersion  = 1
)

// Manifest maps card faces to their published images, per language.
type Manifest struct {
	Version int    `json:"version"`
	Base    string `json:"base"`
	// Faces maps a face code to its images, keyed by language ("en", "fr").
	Faces map[string]map[string]ManifestImage `json:"faces"`
}

// ManifestImage is one published image of a face.
type ManifestImage struct {
	// Key is the object key under Manifest.Base, such as "cards/fr/12001a.9b1d07c4e2aa.avif".
	Key string `json:"key"`
}

// SourceFace lists the candidate image sources of one card face.
type SourceFace struct {
	Code      string `json:"code"`
	Landscape bool   `json:"landscape"`
	Cerebro   string `json:"cerebro,omitempty"`
	Record    string `json:"record,omitempty"`
	Octgn     string `json:"octgn,omitempty"`
}

// sourcesFile is the layout of sources.json.
type sourcesFile struct {
	Version int          `json:"version"`
	Faces   []SourceFace `json:"faces"`
}

// OctgnStem returns the OCTGN image file stem of a face. The OCTGN packs name the image of a face after its OCTGN
// id. When several faces of a card share one id (sharedID), the first face keeps the bare id and the others add
// ".<letter>" (suffix b, c, ...). A face with an id of its own always has the bare id, whatever its letter. It
// returns "" when the face has no OCTGN id.
func OctgnStem(octgnID string, faceCode string, sharedID bool) string {
	if octgnID == "" || faceCode == "" || !sharedID {
		return octgnID
	}
	suffix := faceCode[len(faceCode)-1]
	if suffix >= 'b' && suffix <= 'z' {
		return octgnID + "." + string(suffix)
	}
	return octgnID
}

// LoadManifest reads the image manifest at path. A missing file gives an error wrapping fs.ErrNotExist.
func LoadManifest(path string) (Manifest, error) {
	data, err := os.ReadFile(path) //nolint:gosec // path is the generator's own input file
	if err != nil {
		return Manifest{}, fmt.Errorf("read image manifest: %w", err)
	}
	var m Manifest
	if err := json.Unmarshal(data, &m); err != nil {
		return Manifest{}, fmt.Errorf("decode image manifest %s: %w", path, err)
	}
	if m.Version != manifestVersion {
		return Manifest{}, fmt.Errorf("image manifest %s: unsupported manifest version %d", path, m.Version)
	}
	// Image URLs are the base and the key put end to end, so a base without a trailing slash, or an empty key,
	// would give broken URLs: refuse the file rather than build broken packs.
	if m.Base == "" {
		return Manifest{}, fmt.Errorf("image manifest %s: no base URL", path)
	}
	if !strings.HasSuffix(m.Base, "/") {
		return Manifest{}, fmt.Errorf("image manifest %s: base URL %q does not end with /", path, m.Base)
	}
	for faceCode, images := range m.Faces {
		for lang, image := range images {
			if image.Key == "" {
				return Manifest{}, fmt.Errorf("image manifest %s: face %s has an empty %s key", path, faceCode, lang)
			}
		}
	}
	return m, nil
}

// Image returns the CDN URL of a face in a language, and whether the manifest holds one.
func (m Manifest) Image(faceCode string, lang string) (string, bool) {
	image, ok := m.Faces[faceCode][lang]
	if !ok {
		return "", false
	}
	return m.Base + image.Key, true
}

// WriteSources writes the image sources of faces to path as sources.json, sorted by face code. It leaves the
// order of faces itself untouched.
func WriteSources(path string, faces []SourceFace) error {
	// make, unlike slices.Clone, gives an empty slice for nil faces, so the file says "faces": [] and not null.
	sorted := make([]SourceFace, len(faces))
	copy(sorted, faces)
	slices.SortStableFunc(sorted, func(a, b SourceFace) int {
		return cmp.Compare(a.Code, b.Code)
	})

	// An Encoder, unlike json.Marshal, can keep "&" and "<" literal in URLs instead of & escapes.
	var buf bytes.Buffer
	encoder := json.NewEncoder(&buf)
	encoder.SetEscapeHTML(false)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(sourcesFile{Version: sourcesVersion, Faces: sorted}); err != nil {
		return fmt.Errorf("encode image sources: %w", err)
	}
	if err := fetch.WriteFileAtomic(path, buf.Bytes()); err != nil {
		return fmt.Errorf("write image sources: %w", err)
	}
	return nil
}
