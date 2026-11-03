// Package write stores generated packs on disk.
package write

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"slices"

	"github.com/alexandreroman/intothefray/internal/pack"
	"github.com/alexandreroman/intothefray/internal/packgen/build"
)

const (
	dirMode  = 0o755 // the files are served to clients
	fileMode = 0o644
	// indexFile lists the pack files; it is installed last.
	indexFile = "index.json"
)

// Dist writes index.json and one <code>.json file per pack into outDir.
//
// Every file is written to a temporary directory inside outDir first, then
// moved into outDir once all of them are written: a failed write leaves the
// previous output intact. The pack files listed by the previous index.json but
// not generated anymore are removed afterwards. Dist never touches the other
// files of outDir.
func Dist(outDir string, r build.Result) error {
	if err := os.MkdirAll(outDir, dirMode); err != nil { //nolint:gosec // generated files are public
		return fmt.Errorf("create output directory: %w", err)
	}
	previousFiles, err := listedPackFiles(outDir)
	if err != nil {
		return err
	}

	tmpDir, err := os.MkdirTemp(outDir, ".tmp-packs-")
	if err != nil {
		return fmt.Errorf("create temporary directory: %w", err)
	}
	defer func() { _ = os.RemoveAll(tmpDir) }()

	// The index comes last, so it never lists a pack file not installed yet.
	var names []string
	for _, packFile := range r.Packs {
		name := packFile.Code + ".json"
		if err := writeJSON(filepath.Join(tmpDir, name), packFile); err != nil {
			return err
		}
		names = append(names, name)
	}
	if err := writeJSON(filepath.Join(tmpDir, indexFile), r.Index); err != nil {
		return err
	}
	names = append(names, indexFile)

	// Each rename stays on one file system, so every file is replaced atomically.
	for _, name := range names {
		if err := os.Rename(filepath.Join(tmpDir, name), filepath.Join(outDir, name)); err != nil {
			return fmt.Errorf("install %s: %w", name, err)
		}
	}
	return removeStale(outDir, previousFiles, names)
}

// listedPackFiles returns the pack files listed by the index.json of dir, or
// nothing if dir has no index yet.
func listedPackFiles(dir string) ([]string, error) {
	data, err := os.ReadFile(filepath.Join(dir, indexFile)) //nolint:gosec // path built from the output directory
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read previous %s: %w", indexFile, err)
	}
	var index pack.Index
	if err := json.Unmarshal(data, &index); err != nil {
		return nil, fmt.Errorf("decode previous %s: %w", indexFile, err)
	}
	files := make([]string, 0, len(index.Packs))
	for _, ref := range index.Packs {
		files = append(files, ref.File)
	}
	return files, nil
}

// removeStale deletes the previous files of dir that are not current anymore.
func removeStale(dir string, previous, current []string) error {
	for _, name := range previous {
		if slices.Contains(current, name) {
			continue
		}
		// Only a plain JSON file name: a damaged index must not reach outside dir.
		if name != filepath.Base(name) || filepath.Ext(name) != ".json" {
			continue
		}
		err := os.Remove(filepath.Join(dir, name))
		if err != nil && !errors.Is(err, fs.ErrNotExist) {
			return fmt.Errorf("remove stale %s: %w", name, err)
		}
	}
	return nil
}

func writeJSON(path string, v any) error {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return fmt.Errorf("encode %s: %w", filepath.Base(path), err)
	}
	data = append(data, '\n')
	if err := os.WriteFile(path, data, fileMode); err != nil { //nolint:gosec // generated files are public
		return fmt.Errorf("write %s: %w", filepath.Base(path), err)
	}
	return nil
}
