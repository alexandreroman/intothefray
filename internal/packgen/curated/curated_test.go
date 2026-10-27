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

	wantNames := map[string]Names{"fr": {
		Packs: map[string]string{"core": "Boîte de base"},
		Sets:  map[string]string{"rhino": "Rhino (FR)"},
	}}
	if !reflect.DeepEqual(loaded.Names, wantNames) {
		t.Errorf("got names %+v, want %+v", loaded.Names, wantNames)
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
	if len(loaded.Scenarios) != 0 || len(loaded.Cards) != 0 || len(loaded.Sets) != 0 || len(loaded.Names) != 0 {
		t.Errorf("got %+v, want nothing", loaded)
	}
}

func TestLoadRejectsUnknownField(t *testing.T) {
	dir := t.TempDir()
	scenarios := filepath.Join(dir, "scenarios")
	if err := os.Mkdir(scenarios, 0o750); err != nil {
		t.Fatal(err)
	}
	content := []byte(`{"id":"x","villianSet":"x"}`)
	if err := os.WriteFile(filepath.Join(scenarios, "bad.json"), content, 0o600); err != nil {
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
		{"same id", `{"id":"one","villainSet":"other",` + emptyStart + `}`, `scenario id "one"`},
		{"same villain set", `{"id":"other","villainSet":"one_set",` + emptyStart + `}`, `villain set "one_set"`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			dir := t.TempDir()
			scenarios := filepath.Join(dir, "scenarios")
			if err := os.Mkdir(scenarios, 0o750); err != nil {
				t.Fatal(err)
			}
			files := map[string]string{
				"a.json": `{"id":"one","villainSet":"one_set",` + emptyStart + `}`,
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
		{
			"unknown difficulty",
			`{"standard_ii":{"inPlay":{"heroic":[{"card":"24049","face":0}]}}}`,
			`unknown difficulty "heroic"`,
		},
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

func TestLoadRejectsInvalidNames(t *testing.T) {
	tests := []struct {
		name    string
		content string
		want    string
	}{
		{"empty pack name", `{"fr":{"packs":{"core":""}}}`, `fr pack "core": empty name`},
		{"empty set name", `{"fr":{"sets":{"rhino":""}}}`, `fr set "rhino": empty name`},
		{"unknown field", `{"fr":{"scenarios":{"rhino":"Rhino"}}}`, `unknown field "scenarios"`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			dir := t.TempDir()
			if err := os.Mkdir(filepath.Join(dir, "scenarios"), 0o750); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(filepath.Join(dir, "names.json"), []byte(tt.content), 0o600); err != nil {
				t.Fatal(err)
			}

			_, err := Load(dir)
			if err == nil || !strings.Contains(err.Error(), "names.json") || !strings.Contains(err.Error(), tt.want) {
				t.Fatalf("got error %v, want one naming names.json and %s", err, tt.want)
			}
		})
	}
}

// loadScenario loads a directory holding one scenario file, named scenario.json.
func loadScenario(t *testing.T, content string) error {
	t.Helper()
	dir := t.TempDir()
	scenarios := filepath.Join(dir, "scenarios")
	if err := os.Mkdir(scenarios, 0o750); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(scenarios, "scenario.json"), []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	_, err := Load(dir)
	return err
}

func wantScenarioError(t *testing.T, content, want string) {
	t.Helper()
	err := loadScenario(t, content)
	if err == nil || !strings.Contains(err.Error(), "scenario.json") || !strings.Contains(err.Error(), want) {
		t.Fatalf("got error %v, want one naming scenario.json and %q", err, want)
	}
}

const (
	deckA = `{"key":"a","label":"A","sets":["s"]}`
	// emptyStart is the setup of a scenario without stages.
	emptyStart = `"start":{"standard":{"top":{}},"expert":{"top":{}}}`
	// stageV is a stage whose top card is 1 in Standard and 2 in Expert, as startV sets it up.
	stageV = `{"key":"v","label":"V","cards":["1","2"]}`
	startV = `"start":{"standard":{"top":{"v":{"card":"1","face":0}}},"expert":{"top":{"v":{"card":"2","face":0}}}}`
)

func TestLoadRejectsEncounterDeckNotSelfContained(t *testing.T) {
	wantScenarioError(t, `{"id":"x","villainSet":"x","decks":[{"key":"a","label":"A","sets":["s"],"encounter":true}]}`,
		"selfContained")
	if err := loadScenario(t, `{"id":"x","villainSet":"x","selfContained":true,`+
		`"decks":[{"key":"a","label":"A","sets":["s"],"encounter":true}],`+emptyStart+`}`); err != nil {
		t.Fatalf("got error %v, want none for a self-contained scenario", err)
	}
}

func TestLoadRejectsUnknownWith(t *testing.T) {
	wantScenarioError(t, `{"id":"x","villainSet":"x","piles":[`+stageV+`],"start":{`+
		`"standard":{"top":{"v":{"card":"1","face":0}}},`+
		`"expert":{"top":{"v":{"card":"2","face":0}},"inPlay":[{"card":"3","face":0,"with":"nobody"}]}}}`, `"nobody"`)
}

func TestLoadRejectsBadDecks(t *testing.T) {
	tests := []struct{ name, content, want string }{
		{"duplicate key", `{"id":"x","villainSet":"x","decks":[` + deckA + `,` + deckA + `]}`, "duplicate deck key"},
		{"empty key", `{"id":"x","villainSet":"x","decks":[{"label":"A","sets":["s"]}]}`, "no key"},
		{"empty label", `{"id":"x","villainSet":"x","decks":[{"key":"a","sets":["s"]}]}`, "no label"},
		{"empty deck", `{"id":"x","villainSet":"x","decks":[{"key":"a","label":"A"}]}`, "neither sets nor cards"},
		{
			"stage naming no deck",
			`{"id":"x","villainSet":"x","piles":[{"key":"v","label":"V","cards":[],"deck":"b"}],"decks":[` + deckA + `]}`,
			`unknown deck "b"`,
		},
		{
			"deck named twice",
			`{"id":"x","villainSet":"x","piles":[{"key":"v","label":"V","cards":[],"deck":"a"},` +
				`{"key":"w","label":"W","cards":[],"deck":"a"}],"decks":[` + deckA + `]}`,
			`deck "a" is named by`,
		},
		{"active naming no stage", `{"id":"x","villainSet":"x","active":"nobody"}`, `unknown stage "nobody"`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) { wantScenarioError(t, tt.content, tt.want) })
	}
}

func TestLoadRejectsBadStarts(t *testing.T) {
	topV := `{"top":{"v":{"card":"1","face":0}}}`
	tests := []struct{ name, content, want string }{
		{
			"duplicate stage key",
			`{"id":"x","villainSet":"x","piles":[` + stageV + `,` + stageV + `],` + startV + `}`,
			`duplicate stage key "v"`,
		},
		{
			"no standard setup",
			`{"id":"x","villainSet":"x","piles":[` + stageV + `],"start":{"expert":` + topV + `}}`,
			"no standard setup",
		},
		{
			"no expert setup",
			`{"id":"x","villainSet":"x","piles":[` + stageV + `],"start":{"standard":` + topV + `}}`,
			"no expert setup",
		},
		{
			"unknown difficulty",
			`{"id":"x","villainSet":"x","piles":[` + stageV + `],` +
				`"start":{"standard":` + topV + `,"expert":` + topV + `,"heroic":` + topV + `}}`,
			`unknown difficulty "heroic"`,
		},
		{
			"stage without top card",
			`{"id":"x","villainSet":"x","piles":[` + stageV + `,{"key":"w","label":"W","cards":["3"]}],` + startV + `}`,
			`standard setup has no top card for stage "w"`,
		},
		{
			"top card of no stage",
			`{"id":"x","villainSet":"x","piles":[` + stageV + `],"start":{"standard":` + topV + `,` +
				`"expert":{"top":{"v":{"card":"2","face":0},"z":{"card":"2","face":0}}}}}`,
			`expert top card 2 names unknown stage "z"`,
		},
		{
			"top card out of its stage",
			`{"id":"x","villainSet":"x","piles":[` + stageV + `],"start":{"standard":` + topV + `,` +
				`"expert":{"top":{"v":{"card":"9","face":0}}}}}`,
			`expert top card 9 is not in stage "v"`,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) { wantScenarioError(t, tt.content, tt.want) })
	}
}

func TestLoadReadsMainSchemes(t *testing.T) {
	dir := t.TempDir()
	scenarios := filepath.Join(dir, "scenarios")
	if err := os.Mkdir(scenarios, 0o750); err != nil {
		t.Fatal(err)
	}
	files := map[string]string{
		filepath.Join(scenarios, "x.json"): `{"id":"x","villainSet":"x","mainSchemes":["a","b"],` + emptyStart + `}`,
		filepath.Join(dir, "sets.json"):    `{"a":{"mainScheme":true}}`,
	}
	for path, content := range files {
		if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
	}

	loaded, err := Load(dir)
	if err != nil {
		t.Fatal(err)
	}
	if got := loaded.Scenarios[0].MainSchemes; !reflect.DeepEqual(got, []string{"a", "b"}) {
		t.Errorf("got main schemes %v, want [a b]", got)
	}
	if !loaded.Sets["a"].MainScheme {
		t.Errorf("got set a %+v, want a main scheme set", loaded.Sets["a"])
	}
}

func TestLoadRejectsBadMainSchemes(t *testing.T) {
	tests := []struct{ name, content, want string }{
		{
			"duplicate main scheme set",
			`{"id":"x","villainSet":"x","mainSchemes":["a","b","a"],` + emptyStart + `}`,
			`duplicate main scheme set "a"`,
		},
		{
			"self-contained scenario",
			`{"id":"x","villainSet":"x","selfContained":true,"mainSchemes":["a"],` + emptyStart + `}`,
			"main scheme sets need a scenario that is not selfContained",
		},
		{
			"stage under the main scheme stage key",
			`{"id":"x","villainSet":"x","mainSchemes":["a"],` +
				`"piles":[{"key":"scheme","label":"S","cards":["1","2"]}],` +
				`"start":{"standard":{"top":{"scheme":{"card":"1","face":0}}},` +
				`"expert":{"top":{"scheme":{"card":"2","face":0}}}}}`,
			`main scheme sets need a scenario without a stage "scheme"`,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) { wantScenarioError(t, tt.content, tt.want) })
	}
}
