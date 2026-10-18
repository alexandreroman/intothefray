// Package write stores generated packs on disk.
package write

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/alexandreroman/intothefray/internal/packgen/build"
)

const (
	dirMode  = 0o755 // the files are served to clients
	fileMode = 0o644
)

// Dist writes <outDir>/<lang>/index.json and one file per pack. The files go
// to a temporary directory first, which then replaces <outDir>/<lang>: a
// failed run never leaves a half-written or stale mix of files behind.
func Dist(outDir, lang string, r build.Result) error {
	if err := os.MkdirAll(outDir, dirMode); err != nil { //nolint:gosec // generated files are public
		return fmt.Errorf("create output directory: %w", err)
	}
	tmpDir, err := os.MkdirTemp(outDir, ".tmp-"+lang+"-")
	if err != nil {
		return fmt.Errorf("create temporary directory: %w", err)
	}
	defer func() { _ = os.RemoveAll(tmpDir) }() // no-op once renamed

	if err := os.Chmod(tmpDir, dirMode); err != nil { //nolint:gosec // generated files are public
		return fmt.Errorf("set directory mode: %w", err)
	}

	index := r.Index
	index.Lang = lang
	if err := writeJSON(filepath.Join(tmpDir, "index.json"), index); err != nil {
		return err
	}
	for _, packFile := range r.Packs {
		if err := writeJSON(filepath.Join(tmpDir, packFile.Code+".json"), packFile); err != nil {
			return err
		}
	}
	return replaceDir(filepath.Join(outDir, lang), tmpDir)
}

// replaceDir moves newDir to target, restoring the previous target if the
// move fails.
func replaceDir(target, newDir string) error {
	backup := newDir + ".old"
	hadPrevious := true
	if err := os.Rename(target, backup); err != nil {
		if !os.IsNotExist(err) {
			return fmt.Errorf("move previous output aside: %w", err)
		}
		hadPrevious = false
	}

	if err := os.Rename(newDir, target); err != nil {
		if hadPrevious {
			_ = os.Rename(backup, target)
		}
		return fmt.Errorf("install new output: %w", err)
	}
	if hadPrevious {
		_ = os.RemoveAll(backup)
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
