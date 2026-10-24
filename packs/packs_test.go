package packs_test

import (
	"encoding/json"
	"fmt"
	"io/fs"
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

	t.Run("swapped Cerebro images", func(t *testing.T) {
		card, _, err := catalog.Card("36001")
		if err != nil {
			t.Fatalf("Card(36001) error = %v", err)
		}
		tests := []struct {
			face     int
			faceType string
			image    string
		}{
			{0, "hero", "/36001B.jpg"},
			{1, "alter_ego", "/36001A.jpg"},
		}
		for _, tt := range tests {
			face := card.Faces[tt.face]
			if face.Type != tt.faceType || !strings.HasSuffix(face.Images[0], tt.image) {
				t.Errorf("Storm face %d = %s with first image %s, want %s ending in %s",
					tt.face, face.Type, face.Images[0], tt.faceType, tt.image)
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
		if supported != 6 {
			t.Errorf("supported scenarios = %d, want 6", supported)
		}
	})
}

// TestEmbeddedFearNoEvil checks the pack that marvelcdb lists only partly and
// mc4db completes.
func TestEmbeddedFearNoEvil(t *testing.T) {
	catalog, err := packs.Catalog()
	if err != nil {
		t.Fatalf("Catalog() error = %v", err)
	}

	t.Run("kingpin scenario", func(t *testing.T) {
		index := slices.IndexFunc(catalog.Index().Scenarios, func(ref pack.ScenarioRef) bool {
			return ref.ID == "kingpin"
		})
		if index < 0 {
			t.Fatal("scenario ref kingpin not found")
		}
		ref := catalog.Index().Scenarios[index]
		if !ref.Supported || ref.Pack != "fne" {
			t.Errorf("kingpin ref = supported %t in pack %q, want supported in pack fne", ref.Supported, ref.Pack)
		}
	})

	t.Run("villain and main scheme", func(t *testing.T) {
		tests := []struct {
			code      string
			wantFaces int
		}{
			{"60159", 2},
			{"60161", 2},
		}
		for _, tt := range tests {
			card, _, err := catalog.Card(tt.code)
			if err != nil {
				t.Fatalf("Card(%s) error = %v", tt.code, err)
			}
			if len(card.Faces) != tt.wantFaces {
				t.Errorf("Card(%s) faces = %d, want %d", tt.code, len(card.Faces), tt.wantFaces)
			}
		}
	})

	t.Run("underling set", func(t *testing.T) {
		set, ok := catalog.Set("bullseye")
		if !ok {
			t.Fatal("set bullseye not found")
		}
		if set.Kind != "underling" {
			t.Errorf("bullseye kind = %q, want underling", set.Kind)
		}
	})
}

// TestEmbeddedGreenGoblin checks the two scenarios of The Green Goblin.
func TestEmbeddedGreenGoblin(t *testing.T) {
	catalog, err := packs.Catalog()
	if err != nil {
		t.Fatalf("Catalog() error = %v", err)
	}

	t.Run("scenario refs", func(t *testing.T) {
		for _, id := range []string{"risky_business", "mutagen_formula"} {
			index := slices.IndexFunc(catalog.Index().Scenarios, func(ref pack.ScenarioRef) bool {
				return ref.ID == id
			})
			if index < 0 {
				t.Errorf("scenario ref %s not found", id)
				continue
			}
			ref := catalog.Index().Scenarios[index]
			if !ref.Supported || ref.Pack != "gob" {
				t.Errorf("%s ref = supported %t in pack %q, want supported in pack gob", id, ref.Supported, ref.Pack)
			}
		}
	})

	t.Run("starts", func(t *testing.T) {
		tests := []struct {
			scenario    string
			difficulty  pack.Difficulty
			wantVillain pack.FaceRef
			wantScheme  pack.FaceRef
			wantInPlay  []pack.FaceRef
		}{
			{
				scenario:    "risky_business",
				difficulty:  pack.Standard,
				wantVillain: pack.FaceRef{Card: "02001", Face: 0},
				wantScheme:  pack.FaceRef{Card: "02004", Face: 0},
				wantInPlay:  []pack.FaceRef{{Card: "02006", Face: 0}},
			},
			{
				scenario:    "risky_business",
				difficulty:  pack.Expert,
				wantVillain: pack.FaceRef{Card: "02002", Face: 0},
				wantScheme:  pack.FaceRef{Card: "02004", Face: 0},
				wantInPlay:  []pack.FaceRef{{Card: "02006", Face: 0}},
			},
			{
				scenario:    "mutagen_formula",
				difficulty:  pack.Standard,
				wantVillain: pack.FaceRef{Card: "02014", Face: 0},
				wantScheme:  pack.FaceRef{Card: "02017", Face: 0},
			},
			{
				scenario:    "mutagen_formula",
				difficulty:  pack.Expert,
				wantVillain: pack.FaceRef{Card: "02015", Face: 0},
				wantScheme:  pack.FaceRef{Card: "02017", Face: 0},
			},
		}
		for _, tt := range tests {
			scenario, ok := catalog.Scenario(tt.scenario)
			if !ok {
				t.Errorf("scenario %s not found", tt.scenario)
				continue
			}
			start := scenario.Start[tt.difficulty]
			if got := start.Top["villain"]; got != tt.wantVillain {
				t.Errorf("%s %s villain = %+v, want %+v", tt.scenario, tt.difficulty, got, tt.wantVillain)
			}
			if got := start.Top["scheme"]; got != tt.wantScheme {
				t.Errorf("%s %s scheme = %+v, want %+v", tt.scenario, tt.difficulty, got, tt.wantScheme)
			}
			if !slices.Equal(start.InPlay, tt.wantInPlay) {
				t.Errorf("%s %s in play = %v, want %v", tt.scenario, tt.difficulty, start.InPlay, tt.wantInPlay)
			}
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

	// Players resolve the stage 1A "Setup:" text themselves, so the main
	// scheme starts on its first face, never already advanced to 1B.
	t.Run("main schemes start on their first face", func(t *testing.T) {
		for _, file := range files {
			for _, scenario := range file.Scenarios {
				for difficulty, start := range scenario.Start {
					scheme, ok := start.Top["scheme"]
					if !ok {
						t.Errorf("scenario %s %s has no main scheme", scenario.ID, difficulty)
						continue
					}
					if scheme.Face != 0 {
						t.Errorf("scenario %s %s starts its main scheme %s on face %d, want face 0",
							scenario.ID, difficulty, scheme.Card, scheme.Face)
					}
				}
			}
		}
	})

	// The only cards placed in play are the environments the scenario puts
	// into play as it starts (Criminal Enterprise, Ultron Drones, Public
	// Support): any other card stays in the encounter deck for the players.
	t.Run("scenario in-play cards are environments", func(t *testing.T) {
		for _, file := range files {
			for _, scenario := range file.Scenarios {
				for difficulty, start := range scenario.Start {
					for _, ref := range start.InPlay {
						card, _, err := catalog.Card(ref.Card)
						if err != nil || ref.Face < 0 || ref.Face >= len(card.Faces) {
							continue // reported by "scenarios resolve"
						}
						if got := card.Faces[ref.Face].Type; got != "environment" {
							t.Errorf("scenario %s %s starts %s face %d in play, a %s, want an environment",
								scenario.ID, difficulty, ref.Card, ref.Face, got)
						}
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
	backs := make(map[string]pack.Back)
	for _, file := range files {
		for _, set := range file.Sets {
			sets[set.Code] = set
		}
		for _, card := range file.Cards {
			backs[card.Code] = card.Back
		}
		for _, hero := range file.Heroes {
			heroes[hero.Identity] = hero
		}
	}

	t.Run("side decks", func(t *testing.T) {
		type sideDeck struct {
			set  string
			side pack.SideDeck
		}
		tests := []struct {
			identity string
			want     []sideDeck // in printed order
		}{
			{"09001", []sideDeck{
				{"doctor_strange_invocation_deck", pack.SideDeck{
					Label: "Invocation", TopFaceUp: true, Discard: true, Back: pack.BackPlayer,
				}},
			}},
			{"36001", []sideDeck{{"storm_weather_deck", pack.SideDeck{Label: "Weather", Back: pack.BackPlayer}}}},
			{"59001", []sideDeck{
				{"hercules_labor_deck", pack.SideDeck{Label: "Labor", Back: pack.BackPlayer}},
				{"hercules_gift_deck", pack.SideDeck{Label: "Gift", Back: pack.BackEncounter}},
			}},
			{"60001", []sideDeck{{"daredevil_sense_deck", pack.SideDeck{Label: "Sense", TopFaceUp: true, Back: pack.BackPlayer}}}},
		}
		for _, tt := range tests {
			var wantCodes []string
			for _, want := range tt.want {
				wantCodes = append(wantCodes, want.set)
				if got := sets[want.set].Side; got == nil || *got != want.side {
					t.Errorf("set %s side = %+v, want %+v", want.set, got, want.side)
				}
			}
			if got := heroes[tt.identity].SideDecks; !slices.Equal(got, wantCodes) {
				t.Errorf("hero %s side decks = %v, want %v", tt.identity, got, wantCodes)
			}
		}
	})

	t.Run("side deck backs", func(t *testing.T) {
		// Protect Humanity (59004) comes with an encounter back from the
		// sources: in a face-down Labor deck of player backs it would stand
		// out.
		for _, set := range sets {
			if set.Side == nil {
				continue
			}
			want := pack.BackPlayer
			if set.Side.Back != "" {
				want = set.Side.Back
			}
			for _, code := range set.Cards {
				if backs[code] != want {
					t.Errorf("card %s of %s has back %q, want %q", code, set.Code, backs[code], want)
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
