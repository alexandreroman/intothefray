// Package curated holds the hand-written data that completes the card sources.
package curated

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"maps"
	"os"
	"path/filepath"
	"slices"

	"github.com/alexandreroman/intothefray/internal/pack"
)

// CardOverride replaces values derived from the sources for one card or face
// code.
type CardOverride struct {
	Size pack.Size `json:"size,omitempty"`
	// Cerebro is the Cerebro image id to use for the face instead of the one
	// matching its code, for cards whose Cerebro images are swapped.
	Cerebro string `json:"cerebro,omitempty"`
	// SetAside lists the cards that a deck containing this card puts aside,
	// out of play, at setup. It is only valid on the code of a card, not on
	// the code of one of its faces.
	SetAside []string `json:"setAside,omitempty"`
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
	// Decks are the scenario's own decks, laid out by the stage piles that name them.
	Decks []pack.ScenarioDeck `json:"decks,omitempty"`
	// SelfContained scenarios use only their own cards: no modular set is picked.
	SelfContained bool `json:"selfContained,omitempty"`
	// Active is the key of the stage the active counter starts under.
	Active string `json:"active,omitempty"`
}

// SetDef completes a generated set with hand-written setup data.
type SetDef struct {
	// InPlay lists, per difficulty, the cards of the set that start in play
	// instead of in the encounter deck (the "Setup." keyword).
	InPlay map[pack.Difficulty][]pack.FaceRef `json:"inPlay,omitempty"`
	// Unlisted keeps the set out of the lobby, e.g. the PvP standard set.
	Unlisted bool `json:"unlisted,omitempty"`
	// Side makes a hero_special set one of its hero's side decks.
	Side *pack.SideDeck `json:"side,omitempty"`
	// SetAside lists the cards a hero set puts aside, out of play, at setup.
	SetAside []string `json:"setAside,omitempty"`
}

// Curated is the content of a curated data directory.
type Curated struct {
	Scenarios []ScenarioDef
	Cards     map[string]CardOverride
	// Sets is keyed by set code. Whether each set and card exists is checked
	// at build time, against the generated catalog.
	Sets map[string]SetDef
}

// Load reads dir/scenarios/*.json and the optional dir/cards.json and
// dir/sets.json.
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
		if err := checkScenarioDef(def); err != nil {
			return Curated{}, fmt.Errorf("%s: %w", path, err)
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

	setsPath := filepath.Join(dir, "sets.json")
	err = readStrict(setsPath, &curated.Sets)
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return Curated{}, err
	}
	if err := checkSetDefs(curated.Sets); err != nil {
		return Curated{}, fmt.Errorf("%s: %w", setsPath, err)
	}
	return curated, nil
}

// checkScenarioDef rejects the decks, stages and starting layouts that setup
// could not lay out.
func checkScenarioDef(def ScenarioDef) error {
	decks := make(map[string]bool, len(def.Decks))
	encounter := false
	for _, deck := range def.Decks {
		switch {
		case deck.Key == "":
			return errors.New("deck has no key")
		case decks[deck.Key]:
			return fmt.Errorf("duplicate deck key %q", deck.Key)
		case deck.Label == "":
			return fmt.Errorf("deck %q has no label", deck.Key)
		case len(deck.Sets) == 0 && len(deck.Cards) == 0:
			return fmt.Errorf("deck %q has neither sets nor cards", deck.Key)
		}
		decks[deck.Key] = true
		encounter = encounter || deck.Encounter
	}
	if encounter && !def.SelfContained {
		return errors.New("an encounter deck needs a selfContained scenario")
	}

	stages := make(map[string]pack.Pile, len(def.Piles))
	for _, pile := range def.Piles {
		if _, taken := stages[pile.Key]; taken {
			return fmt.Errorf("duplicate stage key %q", pile.Key)
		}
		stages[pile.Key] = pile
	}
	linked := make(map[string]string)
	for _, pile := range def.Piles {
		if pile.Deck == "" {
			continue
		}
		if !decks[pile.Deck] {
			return fmt.Errorf("stage %q names unknown deck %q", pile.Key, pile.Deck)
		}
		if other, taken := linked[pile.Deck]; taken {
			return fmt.Errorf("deck %q is named by stages %q and %q", pile.Deck, other, pile.Key)
		}
		linked[pile.Deck] = pile.Key
	}
	if _, found := stages[def.Active]; def.Active != "" && !found {
		return fmt.Errorf("active names unknown stage %q", def.Active)
	}
	return checkStarts(def.Start, def.Piles, stages)
}

// checkStarts makes sure the scenario has a Standard and an Expert setup and
// nothing else, the only difficulties the lobby offers, and that each setup
// starts every stage on one of its own cards and puts in-play cards with
// existing stages.
func checkStarts(starts map[pack.Difficulty]pack.Start, piles []pack.Pile, stages map[string]pack.Pile) error {
	for _, difficulty := range slices.Sorted(maps.Keys(starts)) {
		if difficulty != pack.Standard && difficulty != pack.Expert {
			return fmt.Errorf("unknown difficulty %q", difficulty)
		}
	}
	for _, difficulty := range []pack.Difficulty{pack.Standard, pack.Expert} {
		start, found := starts[difficulty]
		if !found {
			return fmt.Errorf("no %s setup", difficulty)
		}
		for _, pile := range piles {
			if _, found := start.Top[pile.Key]; !found {
				return fmt.Errorf("%s setup has no top card for stage %q", difficulty, pile.Key)
			}
		}
		for _, key := range slices.Sorted(maps.Keys(start.Top)) {
			top := start.Top[key]
			stage, found := stages[key]
			if !found {
				return fmt.Errorf("%s top card %s names unknown stage %q", difficulty, top.Card, key)
			}
			if !slices.Contains(stage.Cards, top.Card) {
				return fmt.Errorf("%s top card %s is not in stage %q", difficulty, top.Card, key)
			}
		}
		for _, ref := range start.InPlay {
			if _, found := stages[ref.With]; ref.With != "" && !found {
				return fmt.Errorf("in-play card %q (%s) is with unknown stage %q", ref.Card, difficulty, ref.With)
			}
		}
	}
	return nil
}

// checkSetDefs rejects the in-play cards listed under an unknown difficulty,
// which setup would silently ignore, the side decks without a label, which
// the table could not name, and the side decks with an unknown back.
func checkSetDefs(defs map[string]SetDef) error {
	for _, code := range slices.Sorted(maps.Keys(defs)) {
		def := defs[code]
		for _, difficulty := range slices.Sorted(maps.Keys(def.InPlay)) {
			if difficulty != pack.Standard && difficulty != pack.Expert {
				return fmt.Errorf("set %q: unknown difficulty %q", code, difficulty)
			}
		}
		if def.Side != nil && def.Side.Label == "" {
			return fmt.Errorf("set %q: side deck has no label", code)
		}
		if def.Side != nil && !validSideBack(def.Side.Back) {
			return fmt.Errorf("set %q: side deck has an unknown back %q", code, def.Side.Back)
		}
	}
	return nil
}

// validSideBack reports whether back may be the shared back of a side deck:
// none, or one of the printed backs.
func validSideBack(back pack.Back) bool {
	switch back {
	case "", pack.BackPlayer, pack.BackEncounter, pack.BackVillain:
		return true
	default:
		return false
	}
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
