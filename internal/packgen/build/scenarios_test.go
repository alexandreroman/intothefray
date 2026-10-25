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
	cards, unsupported := buildCards(records, nil, nil)
	if len(unsupported) != 0 {
		t.Fatalf("fixture cards unsupported: %+v", unsupported)
	}
	return scenarioFixture{
		cards: cards,
		sets:  buildSets(records, corePacks),
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

	scenarios, refs, problems := buildScenarios([]curated.ScenarioDef{rhinoDef()}, f.cards, f.sets, f.cb)

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

	scenarios, refs, problems := buildScenarios(nil, f.cards, f.sets, f.cb)

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

	scenarios, refs, problems := buildScenarios([]curated.ScenarioDef{def}, f.cards, f.sets, f.cb)

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

	_, _, problems := buildScenarios([]curated.ScenarioDef{def}, f.cards, f.sets, f.cb)

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

	_, _, problems := buildScenarios([]curated.ScenarioDef{def}, f.cards, f.sets, f.cb)

	if len(problems) != 1 || !strings.Contains(problems[0].Reason, "nobody") {
		t.Errorf("got problems %+v, want one mentioning nobody", problems)
	}
}

func TestScenarioRefsFollowVillainCardOrder(t *testing.T) {
	f := newScenarioFixture(t)

	_, refs, _ := buildScenarios(nil, f.cards, f.sets, f.cb)

	var ids []string
	for _, ref := range refs {
		ids = append(ids, ref.ID)
	}
	if want := []string{"rhino", "klaw"}; !reflect.DeepEqual(ids, want) {
		t.Errorf("got order %v, want %v", ids, want)
	}
}

// leaderFixture has two leader sets, each with a leader card, in pack p.
func leaderFixture() (map[string][]pack.Card, map[string][]pack.Set) {
	leader := func(code, set string) pack.Card {
		return pack.Card{Code: code, Set: set, Faces: []pack.Face{{Type: "leader", Images: []string{"https://x/" + code}}}}
	}
	cards := map[string][]pack.Card{"p": {leader("50001", "boss"), leader("50002", "lieutenant")}}
	sets := map[string][]pack.Set{"p": {
		{Code: "boss", Name: "Boss", Kind: "leader", Cards: []string{"50001"}},
		{Code: "lieutenant", Name: "Lieutenant", Kind: "leader", Cards: []string{"50002"}},
	}}
	return cards, sets
}

func TestScenarioListsLeaderSets(t *testing.T) {
	cards, sets := leaderFixture()

	_, refs, _ := buildScenarios(nil, cards, sets, nil)

	if len(refs) != 2 || refs[0].ID != "boss" || refs[0].Image != "https://x/50001" {
		t.Errorf("got refs %+v, want boss then lieutenant", refs)
	}
}

func TestScenarioDefCoversOtherSets(t *testing.T) {
	cards, sets := leaderFixture()
	def := curated.ScenarioDef{
		ID:         "gang",
		VillainSet: "boss",
		Covers:     []string{"lieutenant"},
		Piles:      []pack.Pile{{Key: "villain", Label: "Villain", Cards: []string{"50001", "50002"}}},
	}

	scenarios, refs, problems := buildScenarios([]curated.ScenarioDef{def}, cards, sets, nil)

	if len(problems) != 0 {
		t.Errorf("got problems %+v, want none", problems)
	}
	if len(refs) != 1 || refs[0].ID != "gang" || !refs[0].Supported {
		t.Errorf("got refs %+v, want only the supported gang", refs)
	}
	if len(scenarios["p"]) != 1 {
		t.Errorf("got scenarios %+v, want gang", scenarios)
	}
}

func TestScenarioDefCoveringUnknownSetIsReported(t *testing.T) {
	cards, sets := leaderFixture()
	def := curated.ScenarioDef{ID: "gang", VillainSet: "boss", Covers: []string{"nobody"}}

	_, _, problems := buildScenarios([]curated.ScenarioDef{def}, cards, sets, nil)

	if len(problems) != 1 || !strings.Contains(problems[0].Reason, "nobody") {
		t.Errorf("got problems %+v, want one mentioning nobody", problems)
	}
}

func TestModularCodesKeepLowestCodeOfDuplicatedName(t *testing.T) {
	sets := map[string][]pack.Set{
		"b": {{Code: "campaign_a", Name: "Campaign", Kind: "modular"}},
		"a": {{Code: "campaign_b", Name: "Campaign", Kind: "modular"}},
	}

	for range 20 { // map iteration order is random
		if got := modularCodesByName(sets)["campaign"]; got != "campaign_a" {
			t.Fatalf("got %q, want campaign_a", got)
		}
	}
}

func TestScenarioCopiesDecksSelfContainedAndActive(t *testing.T) {
	f := newScenarioFixture(t)
	def := rhinoDef()
	def.Decks = []pack.ScenarioDeck{{Key: "d", Label: "D", Sets: []string{"rhino"}, Encounter: true, Discard: true}}
	def.SelfContained = true
	def.Active = "villain"

	scenarios, refs, _ := buildScenarios([]curated.ScenarioDef{def}, f.cards, f.sets, f.cb)

	got := scenarios["core"][0]
	if !reflect.DeepEqual(got.Decks, def.Decks) || !got.SelfContained || got.Active != "villain" {
		t.Errorf("got scenario %+v, want decks, selfContained and active copied", got)
	}
	if !findRef(t, refs, "rhino").SelfContained {
		t.Error("got ref not self-contained, want it")
	}
}

func TestScenarioImageFromCoveredVillain(t *testing.T) {
	card := func(code, set, kind string) pack.Card {
		return pack.Card{Code: code, Set: set, Faces: []pack.Face{{Type: kind, Images: []string{"https://x/" + code}}}}
	}
	cards := map[string][]pack.Card{"p": {
		card("07010", "wrecker", "minion"), card("07005", "thunderball", "leader"), card("07002", "piledriver", "leader"),
	}}
	sets := map[string][]pack.Set{"p": {
		{Code: "wrecker", Name: "Wrecker", Kind: "villain", Cards: []string{"07010"}},
		{Code: "thunderball", Name: "Thunderball", Kind: "leader", Cards: []string{"07005"}},
		{Code: "piledriver", Name: "Piledriver", Kind: "leader", Cards: []string{"07002"}},
	}}
	def := curated.ScenarioDef{
		ID: "crew", VillainSet: "wrecker", Covers: []string{"thunderball", "piledriver"},
		Piles: []pack.Pile{{Key: "villain", Label: "Villain", Cards: []string{"07002"}}},
	}

	_, refs, _ := buildScenarios([]curated.ScenarioDef{def}, cards, sets, nil)

	if got := findRef(t, refs, "crew").Image; got != "https://x/07002" {
		t.Errorf("got image %q, want the one of 07002", got)
	}
}

func TestScenarioWithUnknownDeckCardIsUnsupported(t *testing.T) {
	f := newScenarioFixture(t)
	def := rhinoDef()
	def.Decks = []pack.ScenarioDeck{{Key: "d", Label: "D", Cards: []string{"01098", "55555"}}}

	scenarios, refs, problems := buildScenarios([]curated.ScenarioDef{def}, f.cards, f.sets, f.cb)

	if findRef(t, refs, "rhino").Supported {
		t.Error("rhino is supported despite an unknown deck card")
	}
	if len(scenarios) != 0 {
		t.Errorf("got scenarios %v, want none", scenarios)
	}
	if len(problems) != 1 || !strings.Contains(problems[0].Reason, "55555") {
		t.Errorf("got problems %+v, want one mentioning 55555", problems)
	}
}

func TestScenarioWithUnknownDeckSetIsUnsupported(t *testing.T) {
	f := newScenarioFixture(t)
	def := rhinoDef()
	def.Decks = []pack.ScenarioDeck{{Key: "d", Label: "D", Sets: []string{"rhino", "nowhere"}}}

	scenarios, refs, problems := buildScenarios([]curated.ScenarioDef{def}, f.cards, f.sets, f.cb)

	if findRef(t, refs, "rhino").Supported {
		t.Error("rhino is supported despite an unknown deck set")
	}
	if len(scenarios) != 0 {
		t.Errorf("got scenarios %v, want none", scenarios)
	}
	if len(problems) != 1 || problems[0].Code != "nowhere" ||
		!strings.Contains(problems[0].Reason, "unknown set nowhere") {
		t.Errorf("got problems %+v, want one about the unknown set nowhere", problems)
	}
}
