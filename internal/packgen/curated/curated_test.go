package curated

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/alexandreroman/intothefray/internal/pack"
)

func TestLoad(t *testing.T) {
	loaded, err := Load("testdata")
	if err != nil {
		t.Fatal(err)
	}

	if len(loaded.Scenarios) != 1 {
		t.Fatalf("got %d scenarios, want 1", len(loaded.Scenarios))
	}
	def := loaded.Scenarios[0]
	if def.ID != "rhino" || def.VillainSet != "rhino" {
		t.Errorf("got def %q on set %q, want rhino on rhino", def.ID, def.VillainSet)
	}
	if got := def.Start[pack.Expert].InPlay; len(got) != 1 || got[0].Card != "01108" {
		t.Errorf("got expert in-play %v, want 01108", got)
	}
	if got := def.SetAside; len(got) != 1 || got[0] != "01097" {
		t.Errorf("got set-aside %v, want [01097]", got)
	}
	if got := loaded.Cards["01097a"].Size; got != pack.SizeLand {
		t.Errorf("got override size %q, want %q", got, pack.SizeLand)
	}
	if got := loaded.Cards["01001a"].Cerebro; got != "01001B" {
		t.Errorf("got override Cerebro image %q, want 01001B", got)
	}

	wantSets := map[string]SetDef{
		"standard_ii": {InPlay: map[pack.Difficulty][]pack.FaceRef{
			pack.Standard: {{Card: "24049", Face: 0}},
			pack.Expert:   {{Card: "24049", Face: 1}},
		}},
		"standard_pvp": {Unlisted: true},
		"doctor_strange_invocation_deck": {
			Side: &pack.SideDeck{Label: "Invocation", TopFaceUp: true, Discard: true},
		},
		"storm_weather_deck": {Side: &pack.SideDeck{Label: "Weather"}},
		"valk":               {SetAside: []string{"25002"}},
	}
	if !reflect.DeepEqual(loaded.Sets, wantSets) {
		t.Errorf("got sets %+v, want %+v", loaded.Sets, wantSets)
	}
}

func TestLoadWithoutOptionalFiles(t *testing.T) {
	dir := t.TempDir()
	if err := os.Mkdir(filepath.Join(dir, "scenarios"), 0o750); err != nil {
		t.Fatal(err)
	}

	loaded, err := Load(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(loaded.Scenarios) != 0 || len(loaded.Cards) != 0 || len(loaded.Sets) != 0 {
		t.Errorf("got %+v, want nothing", loaded)
	}
}

func TestLoadRejectsUnknownField(t *testing.T) {
	dir := t.TempDir()
	scenarios := filepath.Join(dir, "scenarios")
	if err := os.Mkdir(scenarios, 0o750); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(scenarios, "bad.json"), []byte(`{"id":"x","villianSet":"x"}`), 0o600); err != nil {
		t.Fatal(err)
	}

	_, err := Load(dir)
	if err == nil || !strings.Contains(err.Error(), "bad.json") {
		t.Fatalf("got error %v, want one naming bad.json", err)
	}
}

func TestLoadRejectsDuplicateDefs(t *testing.T) {
	tests := []struct {
		name   string
		second string
		want   string
	}{
		{"same id", `{"id":"one","villainSet":"other"}`, `scenario id "one"`},
		{"same villain set", `{"id":"other","villainSet":"one_set"}`, `villain set "one_set"`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			dir := t.TempDir()
			scenarios := filepath.Join(dir, "scenarios")
			if err := os.Mkdir(scenarios, 0o750); err != nil {
				t.Fatal(err)
			}
			files := map[string]string{
				"a.json": `{"id":"one","villainSet":"one_set"}`,
				"b.json": tt.second,
			}
			for name, content := range files {
				if err := os.WriteFile(filepath.Join(scenarios, name), []byte(content), 0o600); err != nil {
					t.Fatal(err)
				}
			}

			_, err := Load(dir)
			if err == nil || !strings.Contains(err.Error(), tt.want) ||
				!strings.Contains(err.Error(), "a.json") || !strings.Contains(err.Error(), "b.json") {
				t.Fatalf("got error %v, want one naming a.json, b.json and %s", err, tt.want)
			}
		})
	}
}

func TestLoadRejectsInvalidSets(t *testing.T) {
	tests := []struct {
		name    string
		content string
		want    string
	}{
		{"unknown difficulty", `{"standard_ii":{"inPlay":{"heroic":[{"card":"24049","face":0}]}}}`, `unknown difficulty "heroic"`},
		{"unknown field", `{"standard_pvp":{"hidden":true}}`, `unknown field "hidden"`},
		{
			"side deck without label",
			`{"storm_weather_deck":{"side":{"discard":true}}}`,
			`set "storm_weather_deck": side deck has no label`,
		},
		{"unknown side field", `{"storm_weather_deck":{"side":{"label":"Weather","faceUp":true}}}`, `unknown field "faceUp"`},
		{
			"side deck with an unknown back",
			`{"hercules_labor_deck":{"side":{"label":"Labor","back":"side"}}}`,
			`set "hercules_labor_deck": side deck has an unknown back "side"`,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			dir := t.TempDir()
			if err := os.Mkdir(filepath.Join(dir, "scenarios"), 0o750); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(filepath.Join(dir, "sets.json"), []byte(tt.content), 0o600); err != nil {
				t.Fatal(err)
			}

			_, err := Load(dir)
			if err == nil || !strings.Contains(err.Error(), "sets.json") || !strings.Contains(err.Error(), tt.want) {
				t.Fatalf("got error %v, want one naming sets.json and %s", err, tt.want)
			}
		})
	}
}
