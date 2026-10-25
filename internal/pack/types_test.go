package pack

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

func TestPackFileRoundTrip(t *testing.T) {
	want := PackFile{
		Code:     "core",
		Name:     "Core Set",
		Position: 1,
		Cards: []Card{{
			Code: "01097",
			Faces: []Face{
				{
					Name:           "Rhino",
					Type:           "main_scheme",
					Stage:          "1A",
					Size:           SizeLand,
					Images:         []string{"https://marvelcdb.com/bundles/cards/01097.png"},
					StartingThreat: &Threat{Value: 0, PerPlayer: false},
					Localized: map[string]Localized{
						"fr": {
							Name:   "Le Rhino",
							Images: []string{"https://mc4db.merlindumesnil.net/bundles/cards/FR/core/01097.webp"},
						},
					},
				},
				{
					Name:   "Rhino",
					Type:   "main_scheme",
					Stage:  "1B",
					Size:   SizeLand,
					Images: []string{"https://marvelcdb.com/bundles/cards/01097b.png"},
				},
			},
			Set:      "rhino",
			Back:     BackEncounter,
			Quantity: 1,
			Aliases:  []string{"01097a", "01097b"},
		}},
		Sets: []Set{
			{Code: "rhino", Name: "Rhino", Kind: "villain", Cards: []string{"01097"}},
			{
				Code: "standard_ii", Name: "Standard II", Kind: "standard", Cards: []string{"24049"},
				InPlay: map[Difficulty][]FaceRef{Standard: {{Card: "24049", Face: 0}}, Expert: {{Card: "24049", Face: 1}}},
			},
			{Code: "standard_pvp", Name: "Standard PVP", Kind: "standard", Cards: []string{}, Unlisted: true},
			{Code: "valk", Name: "Valkyrie", Kind: "hero", Cards: []string{"25001", "25002"}, SetAside: []string{"25002"}},
			{
				Code: "doctor_strange_invocation_deck", Name: "Invocation", Kind: "hero_special", Cards: []string{"09032"},
				Side: &SideDeck{Label: "Invocation", TopFaceUp: true, Discard: true},
			},
			{
				Code: "storm_weather_deck", Name: "Weather", Kind: "hero_special", Cards: []string{"36002"},
				Side: &SideDeck{Label: "Weather"},
			},
		},
		Heroes: []Hero{
			{Identity: "09001", Set: "doctor_strange", SideDecks: []string{"doctor_strange_invocation_deck"}},
			{Identity: "25001", Set: "valk"},
		},
	}

	data, err := json.Marshal(want)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	fragments := []string{
		`"startingThreat":{"value":0,"perPlayer":false}`,
		`"size":"land"`,
		// A set without curated setup data keeps its original shape.
		`{"code":"rhino","name":"Rhino","kind":"villain","cards":["01097"]}`,
		// Empty overrides, such as the subname here, are left out.
		`"localized":{"fr":{"name":"Le Rhino",` +
			`"images":["https://mc4db.merlindumesnil.net/bundles/cards/FR/core/01097.webp"]}}`,
		`"side":{"label":"Weather"}`,
		`"setAside":["25002"]`,
		`"sideDecks":["doctor_strange_invocation_deck"]`,
		// A hero without side decks keeps its original shape.
		`{"identity":"25001","set":"valk"}`,
	}
	for _, fragment := range fragments {
		if !strings.Contains(string(data), fragment) {
			t.Errorf("JSON %s does not contain %s", data, fragment)
		}
	}
	// Only the first face carries overrides: the second one emits no localized key.
	if count := strings.Count(string(data), `"localized"`); count != 1 {
		t.Errorf("JSON %s has %d localized keys, want 1", data, count)
	}

	var got PackFile
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if !reflect.DeepEqual(want, got) {
		t.Errorf("round trip mismatch:\nwant %+v\ngot  %+v", want, got)
	}
}

func TestIndexRoundTrip(t *testing.T) {
	french := map[string]Localized{"fr": {Name: "Boîte de base"}}
	want := Index{
		Version: 1,
		Lang:    "en",
		Packs: []PackRef{
			{Code: "core", Name: "Core Set", File: "core.json", Position: 1, Localized: french},
			{Code: "gob", Name: "Green Goblin", File: "gob.json", Position: 2},
		},
		Scenarios: []ScenarioRef{{
			ID: "rhino", Name: "Rhino", Pack: "core", Image: "https://example.com/rhino.png",
			Supported: true, Recommended: []string{"bomb_scare"},
			Localized: map[string]Localized{"fr": {Name: "Le Rhino"}},
		}},
		Sets: []SetRef{{
			Code: "bomb_scare", Name: "Bomb Scare", Pack: "core", Kind: "modular",
			Localized: map[string]Localized{"fr": {Name: "Alerte à la bombe"}},
		}},
	}

	data, err := json.Marshal(want)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	fragments := []string{
		`"position":1,"localized":{"fr":{"name":"Boîte de base"}}`,
		`"localized":{"fr":{"name":"Le Rhino"}}`,
		`"localized":{"fr":{"name":"Alerte à la bombe"}}`,
		// An entry without overrides emits no localized key.
		`"position":2}`,
	}
	for _, fragment := range fragments {
		if !strings.Contains(string(data), fragment) {
			t.Errorf("JSON %s does not contain %s", data, fragment)
		}
	}

	var got Index
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if !reflect.DeepEqual(want, got) {
		t.Errorf("round trip mismatch:\nwant %+v\ngot  %+v", want, got)
	}
}

func TestLocalizedIsZero(t *testing.T) {
	tests := []struct {
		name      string
		localized Localized
		want      bool
	}{
		{"empty", Localized{}, true},
		{"empty images", Localized{Images: []string{}}, true},
		{"name", Localized{Name: "Le Rhino"}, false},
		{"subname", Localized{Subname: "Bruce Banner"}, false},
		{"images", Localized{Images: []string{"https://example.com/01097.webp"}}, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			if got := tt.localized.IsZero(); got != tt.want {
				t.Errorf("IsZero() = %v, want %v", got, tt.want)
			}
		})
	}
}
