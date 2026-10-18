package build

import (
	"reflect"
	"strings"
	"testing"

	"github.com/alexandreroman/intothefray/internal/pack"
	"github.com/alexandreroman/intothefray/internal/packgen/cerebro"
	"github.com/alexandreroman/intothefray/internal/packgen/curated"
)

func rhinoDef() curated.ScenarioDef {
	villain := pack.FaceRef{Card: "01094", Face: 0}
	return curated.ScenarioDef{
		ID:         "rhino",
		VillainSet: "rhino",
		Piles: []pack.Pile{
			{Key: "villain", Label: "Villain", Cards: []string{"01094", "01095", "01096"}},
			{Key: "encounter", Label: "Encounter", Cards: []string{"01098", "01104"}},
		},
		Start: map[pack.Difficulty]pack.Start{
			pack.Standard: {Top: map[string]pack.FaceRef{"villain": villain}},
			pack.Expert: {
				Top:    map[string]pack.FaceRef{"villain": {Card: "01095", Face: 0}},
				InPlay: []pack.FaceRef{{Card: "01107", Face: 0}},
			},
		},
		SetAside: []string{"01097"},
	}
}

type scenarioFixture struct {
	cards map[string][]pack.Card
	sets  map[string][]pack.Set
	cb    []cerebro.Set
}

func newScenarioFixture(t *testing.T) scenarioFixture {
	t.Helper()
	records := setsFixture(t)
	cards, unsupported := BuildCards(records, nil, nil)
	if len(unsupported) != 0 {
		t.Fatalf("fixture cards unsupported: %+v", unsupported)
	}
	return scenarioFixture{
		cards: cards,
		sets:  BuildSets(records, corePacks),
		cb:    readJSON[cerebro.Set](t, "testdata/sets_cerebro.json"),
	}
}

func findRef(t *testing.T, refs []pack.ScenarioRef, id string) pack.ScenarioRef {
	t.Helper()
	for _, ref := range refs {
		if ref.ID == id {
			return ref
		}
	}
	t.Fatalf("no scenario ref %q in %+v", id, refs)
	return pack.ScenarioRef{}
}

func TestScenarioSupportedWithCuratedDef(t *testing.T) {
	f := newScenarioFixture(t)

	scenarios, refs, problems := BuildScenarios([]curated.ScenarioDef{rhinoDef()}, f.cards, f.sets, f.cb)

	if len(problems) != 0 {
		t.Fatalf("got problems %+v, want none", problems)
	}
	ref := findRef(t, refs, "rhino")
	want := pack.ScenarioRef{
		ID:          "rhino",
		Name:        "Rhino",
		Pack:        "core",
		Image:       "https://marvelcdb.com/bundles/cards/01094.png",
		Supported:   true,
		Recommended: []string{"bomb_scare"},
	}
	if !reflect.DeepEqual(ref, want) {
		t.Errorf("got ref %+v, want %+v", ref, want)
	}

	got := scenarios["core"]
	if len(got) != 1 {
		t.Fatalf("got %d scenarios, want 1", len(got))
	}
	if got[0].Name != "Rhino" || got[0].Pack != "core" || got[0].VillainSet != "rhino" ||
		!reflect.DeepEqual(got[0].Recommended, []string{"bomb_scare"}) ||
		!reflect.DeepEqual(got[0].SetAside, []string{"01097"}) {
		t.Errorf("got scenario %+v", got[0])
	}
}

func TestScenarioWithoutDefIsListedUnsupported(t *testing.T) {
	f := newScenarioFixture(t)

	scenarios, refs, problems := BuildScenarios(nil, f.cards, f.sets, f.cb)

	ref := findRef(t, refs, "klaw")
	if ref.Supported || ref.Name != "Klaw" || ref.Pack != "core" {
		t.Errorf("got ref %+v, want unsupported Klaw of core", ref)
	}
	if ref.Recommended == nil {
		t.Error("got nil Recommended, want an empty list for stable JSON")
	}
	if len(scenarios) != 0 || len(problems) != 0 {
		t.Errorf("got scenarios %v and problems %v, want none", scenarios, problems)
	}
}

func TestScenarioWithUnknownCardIsUnsupported(t *testing.T) {
	f := newScenarioFixture(t)
	def := rhinoDef()
	def.Piles[0].Cards = append(def.Piles[0].Cards, "99999")

	scenarios, refs, problems := BuildScenarios([]curated.ScenarioDef{def}, f.cards, f.sets, f.cb)

	if findRef(t, refs, "rhino").Supported {
		t.Error("rhino is supported despite an unknown card")
	}
	if len(scenarios) != 0 {
		t.Errorf("got scenarios %v, want none", scenarios)
	}
	if len(problems) != 1 || !strings.Contains(problems[0].Reason, "99999") {
		t.Errorf("got problems %+v, want one mentioning 99999", problems)
	}
}

func TestScenarioReportsUnknownStartAndSetAsideCards(t *testing.T) {
	f := newScenarioFixture(t)
	def := rhinoDef()
	def.Start[pack.Standard] = pack.Start{
		Top:    map[string]pack.FaceRef{"villain": {Card: "88888", Face: 0}},
		InPlay: []pack.FaceRef{{Card: "77777", Face: 0}},
	}
	def.SetAside = []string{"66666"}

	_, _, problems := BuildScenarios([]curated.ScenarioDef{def}, f.cards, f.sets, f.cb)

	var reasons []string
	for _, problem := range problems {
		reasons = append(reasons, problem.Reason)
	}
	joined := strings.Join(reasons, "\n")
	for _, code := range []string{"88888", "77777", "66666"} {
		if !strings.Contains(joined, code) {
			t.Errorf("no problem mentions %s: %q", code, joined)
		}
	}
}

func TestScenarioWithUnknownVillainSetIsReported(t *testing.T) {
	f := newScenarioFixture(t)
	def := rhinoDef()
	def.VillainSet = "nobody"

	_, _, problems := BuildScenarios([]curated.ScenarioDef{def}, f.cards, f.sets, f.cb)

	if len(problems) != 1 || !strings.Contains(problems[0].Reason, "nobody") {
		t.Errorf("got problems %+v, want one mentioning nobody", problems)
	}
}

func TestScenarioRefsFollowVillainCardOrder(t *testing.T) {
	f := newScenarioFixture(t)

	_, refs, _ := BuildScenarios(nil, f.cards, f.sets, f.cb)

	var ids []string
	for _, ref := range refs {
		ids = append(ids, ref.ID)
	}
	if want := []string{"rhino", "klaw"}; !reflect.DeepEqual(ids, want) {
		t.Errorf("got order %v, want %v", ids, want)
	}
}
