package packs_test

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"maps"
	"slices"
	"strings"
	"testing"

	"github.com/alexandreroman/intothefray/internal/pack"
	"github.com/alexandreroman/intothefray/packs"
)

func TestEmbeddedCoreSet(t *testing.T) {
	catalog, err := packs.Catalog()
	if err != nil {
		t.Fatalf("Catalog() error = %v", err)
	}

	t.Run("rhino scenario", func(t *testing.T) {
		rhino, ok := catalog.Scenario("rhino")
		if !ok {
			t.Fatal("scenario rhino not found")
		}
		want := pack.FaceRef{Card: "01095", Face: 0}
		if got := rhino.Start[pack.Expert].Top["villain"]; got != want {
			t.Errorf("expert villain = %+v, want %+v", got, want)
		}
		if !slices.Contains(rhino.Recommended, "bomb_scare") {
			t.Errorf("Recommended = %v, want bomb_scare", rhino.Recommended)
		}
	})

	t.Run("main scheme back face", func(t *testing.T) {
		card, face, err := catalog.Card("01097b")
		if err != nil {
			t.Fatalf("Card(01097b) error = %v", err)
		}
		if face != 1 {
			t.Errorf("face = %d, want 1", face)
		}
		threat := card.Faces[face].StartingThreat
		if threat == nil || *threat != (pack.Threat{}) {
			t.Errorf("StartingThreat = %v, want {0 false}", threat)
		}
	})

	t.Run("curated face sizes", func(t *testing.T) {
		tests := []struct {
			code string
			want pack.Size
		}{
			{"12001c", pack.SizeDoubleStd},
			{"42001c", pack.SizeDoubleLand},
		}
		for _, tt := range tests {
			card, face, err := catalog.Card(tt.code)
			if err != nil {
				t.Fatalf("Card(%s) error = %v", tt.code, err)
			}
			if face != 2 {
				t.Errorf("Card(%s) face = %d, want 2", tt.code, face)
			}
			if got := card.Faces[2].Size; got != tt.want {
				t.Errorf("Card(%s) size = %q, want %q", tt.code, got, tt.want)
			}
		}
	})

	t.Run("lettered codes that are distinct cards", func(t *testing.T) {
		tests := []struct {
			code         string
			wantQuantity int
		}{
			{"01043a", 1},
			{"01043d", 2},
		}
		for _, tt := range tests {
			card, face, err := catalog.Card(tt.code)
			if err != nil {
				t.Fatalf("Card(%s) error = %v", tt.code, err)
			}
			if card.Code != tt.code || face != 0 || len(card.Faces) != 1 || card.Quantity != tt.wantQuantity {
				t.Errorf("Card(%s) = code %s, face %d, %d faces, quantity %d; want a single-face card of quantity %d",
					tt.code, card.Code, face, len(card.Faces), card.Quantity, tt.wantQuantity)
			}
		}
	})

	t.Run("hero obligation", func(t *testing.T) {
		hero, ok := catalog.HeroByIdentity("01001a")
		if !ok {
			t.Fatal("hero 01001a not found")
		}
		if hero.Obligation != "01165" {
			t.Errorf("Obligation = %q, want 01165", hero.Obligation)
		}
	})

	t.Run("index", func(t *testing.T) {
		scenarios := catalog.Index().Scenarios
		if len(scenarios) <= 40 {
			t.Errorf("scenario refs = %d, want more than 40", len(scenarios))
		}
		supported := 0
		for _, ref := range scenarios {
			if ref.Supported {
				supported++
			}
		}
		if supported != 3 {
			t.Errorf("supported scenarios = %d, want 3", supported)
		}
	})
}

// loadPackFiles decodes every embedded English pack file.
func loadPackFiles(t *testing.T) []pack.PackFile {
	t.Helper()
	catalog, err := packs.Catalog()
	if err != nil {
		t.Fatalf("Catalog() error = %v", err)
	}
	var files []pack.PackFile
	for _, ref := range catalog.Index().Packs {
		data, err := fs.ReadFile(packs.FS, "dist/en/"+ref.File)
		if err != nil {
			t.Fatal(err)
		}
		var file pack.PackFile
		if err := json.Unmarshal(data, &file); err != nil {
			t.Fatalf("decode %s: %v", ref.File, err)
		}
		files = append(files, file)
	}
	return files
}

func TestEmbeddedDataInvariants(t *testing.T) {
	catalog, err := packs.Catalog()
	if err != nil {
		t.Fatalf("Catalog() error = %v", err)
	}
	files := loadPackFiles(t)

	setCards := make(map[string][]string)
	for _, file := range files {
		for _, set := range file.Sets {
			setCards[set.Code] = set.Cards
		}
	}

	requireCard := func(t *testing.T, what, code string) {
		t.Helper()
		if _, _, err := catalog.Card(code); err != nil {
			t.Errorf("%s: %v", what, err)
		}
	}
	requireFace := func(t *testing.T, what string, ref pack.FaceRef) {
		t.Helper()
		card, _, err := catalog.Card(ref.Card)
		if err != nil {
			t.Errorf("%s: %v", what, err)
			return
		}
		if ref.Face < 0 || ref.Face >= len(card.Faces) {
			t.Errorf("%s: card %s has no face %d", what, ref.Card, ref.Face)
		}
	}

	t.Run("cards belong to their set", func(t *testing.T) {
		for _, file := range files {
			for _, card := range file.Cards {
				if card.Set != "" && !slices.Contains(setCards[card.Set], card.Code) {
					t.Errorf("card %s is not listed in its set %s", card.Code, card.Set)
				}
			}
		}
	})

	t.Run("set cards resolve", func(t *testing.T) {
		for set, codes := range setCards {
			for _, code := range codes {
				requireCard(t, "set "+set, code)
			}
		}
	})

	t.Run("heroes resolve", func(t *testing.T) {
		for _, file := range files {
			for _, hero := range file.Heroes {
				requireCard(t, "hero identity of "+hero.Set, hero.Identity)
				if hero.Obligation != "" {
					requireCard(t, "hero obligation of "+hero.Set, hero.Obligation)
				}
			}
		}
	})

	t.Run("scenarios resolve", func(t *testing.T) {
		for _, file := range files {
			for _, scenario := range file.Scenarios {
				what := "scenario " + scenario.ID
				for _, pile := range scenario.Piles {
					for _, code := range pile.Cards {
						requireCard(t, what, code)
					}
				}
				for _, code := range scenario.SetAside {
					requireCard(t, what, code)
				}
				for _, start := range scenario.Start {
					for _, ref := range start.Top {
						requireFace(t, what, ref)
					}
					for _, ref := range start.InPlay {
						requireFace(t, what, ref)
					}
				}
			}
		}
	})

	t.Run("set in-play cards resolve", func(t *testing.T) {
		for _, file := range files {
			for _, set := range file.Sets {
				for _, refs := range set.InPlay {
					for _, ref := range refs {
						requireFace(t, "set "+set.Code, ref)
						if !slices.Contains(set.Cards, ref.Card) {
							t.Errorf("set %s starts card %s in play, which it does not list", set.Code, ref.Card)
						}
					}
				}
			}
		}
	})

	t.Run("unlisted sets stay out of the index", func(t *testing.T) {
		for _, file := range files {
			for _, set := range file.Sets {
				listed := slices.ContainsFunc(catalog.Index().Sets, func(ref pack.SetRef) bool {
					return ref.Code == set.Code
				})
				if set.Unlisted && listed {
					t.Errorf("unlisted set %s is in the index", set.Code)
				}
			}
		}
	})

	t.Run("set-aside cards resolve", func(t *testing.T) {
		for _, file := range files {
			for _, set := range file.Sets {
				for _, code := range set.SetAside {
					requireCard(t, "set-aside card of "+set.Code, code)
				}
			}
		}
	})

	t.Run("hero side decks are side-deck sets", func(t *testing.T) {
		sets := make(map[string]pack.Set)
		for _, file := range files {
			for _, set := range file.Sets {
				sets[set.Code] = set
			}
		}
		for _, file := range files {
			for _, hero := range file.Heroes {
				for _, code := range hero.SideDecks {
					if set := sets[code]; set.Side == nil || set.Kind != "hero_special" {
						t.Errorf("hero %s lists side deck %s, which is not a hero_special side-deck set", hero.Identity, code)
					}
				}
			}
		}
	})

	t.Run("ultron set lists its lettered cards", func(t *testing.T) {
		for _, code := range []string{"01144a", "01144b", "01144c"} {
			if !slices.Contains(setCards["ultron"], code) {
				t.Errorf("set ultron does not list %s", code)
			}
		}
	})
}

func TestEmbeddedHeroSetup(t *testing.T) {
	files := loadPackFiles(t)
	sets := make(map[string]pack.Set)
	heroes := make(map[string]pack.Hero)
	for _, file := range files {
		for _, set := range file.Sets {
			sets[set.Code] = set
		}
		for _, hero := range file.Heroes {
			heroes[hero.Identity] = hero
		}
	}

	t.Run("side decks", func(t *testing.T) {
		tests := []struct {
			identity string
			want     map[string]pack.SideDeck
		}{
			{"09001", map[string]pack.SideDeck{
				"doctor_strange_invocation_deck": {Label: "Invocation", TopFaceUp: true, Discard: true},
			}},
			{"36001", map[string]pack.SideDeck{"storm_weather_deck": {Label: "Weather"}}},
			{"59001", map[string]pack.SideDeck{
				"hercules_gift_deck":  {Label: "Gift"},
				"hercules_labor_deck": {Label: "Labor"},
			}},
			{"60001", map[string]pack.SideDeck{"daredevil_sense_deck": {Label: "Sense"}}},
		}
		for _, tt := range tests {
			hero := heroes[tt.identity]
			// Pack order is set code order.
			if want := slices.Sorted(maps.Keys(tt.want)); !slices.Equal(hero.SideDecks, want) {
				t.Errorf("hero %s side decks = %v, want %v", tt.identity, hero.SideDecks, want)
			}
			for code, want := range tt.want {
				if got := sets[code].Side; got == nil || *got != want {
					t.Errorf("set %s side = %+v, want %+v", code, got, want)
				}
			}
		}
	})

	t.Run("set-aside cards", func(t *testing.T) {
		tests := []struct {
			set  string
			want []string
		}{
			{"iceman", []string{"46002"}},
			{"valk", []string{"25002"}},
			{"rogue", []string{"38002"}},
			{"ironheart", []string{"29002", "29003"}},
		}
		for _, tt := range tests {
			if got := sets[tt.set].SetAside; !slices.Equal(got, tt.want) {
				t.Errorf("set %s set-aside cards = %v, want %v", tt.set, got, tt.want)
			}
		}
	})
}

// TestDistHasNoNull guards the frontend, which types every list as a plain
// array: a nil Go slice would reach it as null.
func TestDistHasNoNull(t *testing.T) {
	err := fs.WalkDir(packs.FS, "dist", func(name string, entry fs.DirEntry, err error) error {
		if err != nil || entry.IsDir() || !strings.HasSuffix(name, ".json") {
			return err
		}
		data, err := fs.ReadFile(packs.FS, name)
		if err != nil {
			return err
		}
		var doc any
		if err := json.Unmarshal(data, &doc); err != nil {
			return fmt.Errorf("decode %s: %w", name, err)
		}
		if path, found := findNull(doc, "$"); found {
			t.Errorf("%s: null at %s", name, path)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

// findNull returns the path of the first JSON null in doc.
func findNull(doc any, path string) (string, bool) {
	switch v := doc.(type) {
	case nil:
		return path, true
	case []any:
		for i, item := range v {
			if p, found := findNull(item, fmt.Sprintf("%s[%d]", path, i)); found {
				return p, true
			}
		}
	case map[string]any:
		for key, item := range v {
			if p, found := findNull(item, path+"."+key); found {
				return p, true
			}
		}
	}
	return "", false
}
