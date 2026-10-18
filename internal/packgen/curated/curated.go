// Package curated holds the hand-written data that completes the card sources.
package curated

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"

	"github.com/alexandreroman/intothefray/internal/pack"
)

// CardOverride replaces values derived from the sources for one face code.
type CardOverride struct {
	Size pack.Size `json:"size,omitempty"`
}

// ScenarioDef is a hand-written scenario setup, completed at build time with
// the data derived from the sources.
type ScenarioDef struct {
	ID         string `json:"id"`
	VillainSet string `json:"villainSet"`
	// Covers lists other candidate sets whose scenario entries are merged
	// into this one, for scenarios made of several villain or leader sets.
	Covers   []string                       `json:"covers,omitempty"`
	Piles    []pack.Pile                    `json:"piles"`
	Start    map[pack.Difficulty]pack.Start `json:"start"`
	SetAside []string                       `json:"setAside,omitempty"`
}

// Curated is the content of a curated data directory.
type Curated struct {
	Scenarios []ScenarioDef
	Cards     map[string]CardOverride
}

// Load reads dir/scenarios/*.json and the optional dir/cards.json.
// Unknown fields are rejected so that typos in hand-written files surface.
func Load(dir string) (Curated, error) {
	var curated Curated

	paths, err := filepath.Glob(filepath.Join(dir, "scenarios", "*.json"))
	if err != nil {
		return Curated{}, fmt.Errorf("list curated scenarios: %w", err)
	}
	idFiles := make(map[string]string)
	villainSetFiles := make(map[string]string)
	for _, path := range paths { // Glob returns the paths sorted
		var def ScenarioDef
		if err := readStrict(path, &def); err != nil {
			return Curated{}, err
		}
		if other, taken := idFiles[def.ID]; taken {
			return Curated{}, fmt.Errorf("scenario id %q is defined in %s and %s", def.ID, other, path)
		}
		if other, taken := villainSetFiles[def.VillainSet]; taken {
			return Curated{}, fmt.Errorf("villain set %q is defined in %s and %s", def.VillainSet, other, path)
		}
		idFiles[def.ID] = path
		villainSetFiles[def.VillainSet] = path
		curated.Scenarios = append(curated.Scenarios, def)
	}

	err = readStrict(filepath.Join(dir, "cards.json"), &curated.Cards)
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return Curated{}, err
	}
	return curated, nil
}

func readStrict(path string, v any) error {
	data, err := os.ReadFile(path) //nolint:gosec // path built from the curated directory
	if err != nil {
		return fmt.Errorf("read %s: %w", path, err)
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(v); err != nil {
		return fmt.Errorf("decode %s: %w", path, err)
	}
	return nil
}
