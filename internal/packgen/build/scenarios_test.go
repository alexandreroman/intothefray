package build

import (
	"reflect"
	"slices"
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
	cards, unsupported := buildCards(records, nil, manifestFor(records))
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

	scenarios, refs, problems := buildScenarios([]curated.ScenarioDef{rhinoDef()}, nil, f.cards, f.sets, f.cb)

	if len(problems) != 0 {
		t.Fatalf("got problems %+v, want none", problems)
	}
	ref := findRef(t, refs, "rhino")
	want := pack.ScenarioRef{
		ID:          "rhino",
		Name:        "Rhino",
		Pack:        "core",
		Image:       imageURL("01094", "en"),
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

	scenarios, refs, problems := buildScenarios(nil, nil, f.cards, f.sets, f.cb)

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

	scenarios, refs, problems := buildScenarios([]curated.ScenarioDef{def}, nil, f.cards, f.sets, f.cb)

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

	_, _, problems := buildScenarios([]curated.ScenarioDef{def}, nil, f.cards, f.sets, f.cb)

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

	_, _, problems := buildScenarios([]curated.ScenarioDef{def}, nil, f.cards, f.sets, f.cb)

	if len(problems) != 1 || !strings.Contains(problems[0].Reason, "nobody") {
		t.Errorf("got problems %+v, want one mentioning nobody", problems)
	}
}

func TestScenarioRefsFollowVillainCardOrder(t *testing.T) {
	f := newScenarioFixture(t)

	_, refs, _ := buildScenarios(nil, nil, f.cards, f.sets, f.cb)

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

	_, refs, _ := buildScenarios(nil, nil, cards, sets, nil)

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

	scenarios, refs, problems := buildScenarios([]curated.ScenarioDef{def}, nil, cards, sets, nil)

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

	_, _, problems := buildScenarios([]curated.ScenarioDef{def}, nil, cards, sets, nil)

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
	def.Decks = []pack.ScenarioDeck{
		{Key: "d", Label: "D", Sets: []string{"rhino"}, Encounter: true, Discard: pack.DiscardOwn, Compact: true},
	}
	def.SelfContained = true
	def.Active = "villain"

	scenarios, refs, _ := buildScenarios([]curated.ScenarioDef{def}, nil, f.cards, f.sets, f.cb)

	got := scenarios["core"][0]
	if !reflect.DeepEqual(got.Decks, def.Decks) || !got.SelfContained || got.Active != "villain" {
		t.Errorf("got scenario %+v, want decks, selfContained and active copied", got)
	}
	if !findRef(t, refs, "rhino").SelfContained {
		t.Error("got ref not self-contained, want it")
	}
}

func TestScenarioCopiesAreas(t *testing.T) {
	f := newScenarioFixture(t)
	def := rhinoDef()
	def.Areas = []pack.ScenarioArea{{Key: "collection", Label: "The Collection"}}

	scenarios, _, _ := buildScenarios([]curated.ScenarioDef{def}, nil, f.cards, f.sets, f.cb)

	if got := scenarios["core"][0].Areas; !reflect.DeepEqual(got, def.Areas) {
		t.Errorf("got areas %+v, want %+v", got, def.Areas)
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

	_, refs, _ := buildScenarios([]curated.ScenarioDef{def}, nil, cards, sets, nil)

	if got := findRef(t, refs, "crew").Image; got != "https://x/07002" {
		t.Errorf("got image %q, want the one of 07002", got)
	}
}

func TestScenarioImageFromCuratedVillainSets(t *testing.T) {
	card := func(code, set, kind string) pack.Card {
		return pack.Card{Code: code, Set: set, Faces: []pack.Face{{Type: kind, Images: []string{"https://x/" + code}}}}
	}
	// As Morlock Siege, whose villains are the Marauders of another set.
	cards := map[string][]pack.Card{"p": {
		card("40077", "morlock_siege", "main_scheme"), card("40071", "marauders", "villain"),
		card("40070", "marauders", "villain"),
	}}
	sets := map[string][]pack.Set{"p": {
		{Code: "morlock_siege", Name: "Morlock Siege", Kind: "villain", Cards: []string{"40077"}},
		{Code: "marauders", Name: "Marauders", Kind: "villain", Cards: []string{"40070", "40071"}},
	}}
	setDefs := map[string]curated.SetDef{"morlock_siege": {Villains: []string{"marauders"}}}

	scenarios, refs, problems := buildScenarios(nil, setDefs, cards, sets, nil)

	ref := findRef(t, refs, "morlock_siege")
	if ref.Image != "https://x/40070" {
		t.Errorf("got image %q, want the one of 40070", ref.Image)
	}
	if ref.Supported {
		t.Error("got morlock_siege supported, want unsupported")
	}
	if len(refs) != 1 {
		t.Errorf("got refs %+v, want morlock_siege only", refs)
	}
	if len(scenarios) != 0 || len(problems) != 0 {
		t.Errorf("got scenarios %+v and problems %+v, want none", scenarios, problems)
	}
}

func TestScenarioImageFromCuratedImageCard(t *testing.T) {
	card := func(code, set, kind string) pack.Card {
		return pack.Card{Code: code, Set: set, Faces: []pack.Face{{Type: kind, Images: []string{"https://x/" + code}}}}
	}
	// As On the Run, which shows Harpoon rather than the lowest-code Marauder.
	cards := map[string][]pack.Card{"p": {
		card("40084", "on_the_run", "main_scheme"), card("40070", "marauders", "villain"),
		card("40074", "marauders", "villain"),
	}}
	sets := map[string][]pack.Set{"p": {
		{Code: "on_the_run", Name: "On the Run", Kind: "villain", Cards: []string{"40084"}},
		{Code: "marauders", Name: "Marauders", Kind: "villain", Cards: []string{"40070", "40074"}},
	}}
	setDefs := map[string]curated.SetDef{"on_the_run": {Villains: []string{"marauders"}, ImageCard: "40074"}}

	_, refs, _ := buildScenarios(nil, setDefs, cards, sets, nil)

	if got := findRef(t, refs, "on_the_run").Image; got != "https://x/40074" {
		t.Errorf("got image %q, want the one of 40074", got)
	}
}

func TestScenarioWithUnknownDeckCardIsUnsupported(t *testing.T) {
	f := newScenarioFixture(t)
	def := rhinoDef()
	def.Decks = []pack.ScenarioDeck{{Key: "d", Label: "D", Cards: []string{"01098", "55555"}}}

	scenarios, refs, problems := buildScenarios([]curated.ScenarioDef{def}, nil, f.cards, f.sets, f.cb)

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

	scenarios, refs, problems := buildScenarios([]curated.ScenarioDef{def}, nil, f.cards, f.sets, f.cb)

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

func TestScenarioCopiesSetsAndDropsThemFromRecommended(t *testing.T) {
	f := newScenarioFixture(t)
	def := rhinoDef()
	def.Sets = []string{"bomb_scare"}

	scenarios, refs, problems := buildScenarios([]curated.ScenarioDef{def}, nil, f.cards, f.sets, f.cb)

	if len(problems) != 0 {
		t.Fatalf("got problems %+v, want none", problems)
	}
	ref := findRef(t, refs, "rhino")
	if !reflect.DeepEqual(ref.Sets, []string{"bomb_scare"}) || !reflect.DeepEqual(ref.Recommended, []string{}) {
		t.Errorf("got ref sets %v, recommended %v; want [bomb_scare] and []", ref.Sets, ref.Recommended)
	}
	got := scenarios["core"]
	if len(got) != 1 {
		t.Fatalf("got %d scenarios, want 1", len(got))
	}
	if !reflect.DeepEqual(got[0].Sets, []string{"bomb_scare"}) || len(got[0].Recommended) != 0 {
		t.Errorf("got scenario sets %v, recommended %v; want [bomb_scare] and none", got[0].Sets, got[0].Recommended)
	}
}

func TestScenarioRefListsTheSetsOfSetAsideCards(t *testing.T) {
	f := newScenarioFixture(t)
	tests := []struct {
		name     string
		sets     []string
		setAside []string
		want     []string
	}{
		// The Break-In! is of Rhino's own villain set.
		{"villain set card", nil, []string{"01097"}, nil},
		{"set aside whole", nil, []string{"01097", "01109", "01110"}, []string{"bomb_scare"}},
		{"also required", []string{"bomb_scare"}, []string{"01109"}, []string{"bomb_scare"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			def := rhinoDef()
			def.Sets = tt.sets
			def.SetAside = tt.setAside

			scenarios, refs, problems := buildScenarios([]curated.ScenarioDef{def}, nil, f.cards, f.sets, f.cb)

			if len(problems) != 0 {
				t.Fatalf("got problems %+v, want none", problems)
			}
			ref := findRef(t, refs, "rhino")
			if !reflect.DeepEqual(ref.Sets, tt.want) {
				t.Errorf("got ref sets %v, want %v", ref.Sets, tt.want)
			}
			// A set that comes with the scenario is not a modular set to recommend.
			if slices.ContainsFunc(tt.want, func(code string) bool { return slices.Contains(ref.Recommended, code) }) {
				t.Errorf("got recommended %v, want none of %v", ref.Recommended, tt.want)
			}
			// The scenario's own sets stay the ones its rules require.
			if got := scenarios["core"][0].Sets; !reflect.DeepEqual(got, tt.sets) {
				t.Errorf("got scenario sets %v, want %v", got, tt.sets)
			}
		})
	}
}

func TestScenarioWithUnknownSetIsUnsupported(t *testing.T) {
	f := newScenarioFixture(t)
	def := rhinoDef()
	def.Sets = []string{"nowhere"}

	scenarios, refs, problems := buildScenarios([]curated.ScenarioDef{def}, nil, f.cards, f.sets, f.cb)

	if findRef(t, refs, "rhino").Supported {
		t.Error("rhino is supported despite an unknown encounter set")
	}
	if len(scenarios) != 0 {
		t.Errorf("got scenarios %v, want none", scenarios)
	}
	if len(problems) != 1 || problems[0].Code != "nowhere" ||
		!strings.Contains(problems[0].Reason, "unknown set nowhere") {
		t.Errorf("got problems %+v, want one about the unknown set nowhere", problems)
	}
}

// underlingFixture has an underling set with two villain cards and a main
// scheme set, in pack p.
func underlingFixture() (map[string][]pack.Card, map[string][]pack.Set) {
	card := func(code, set, kind string) pack.Card {
		return pack.Card{Code: code, Set: set, Faces: []pack.Face{{Type: kind, Images: []string{"https://x/" + code}}}}
	}
	cards := map[string][]pack.Card{"p": {
		card("60065", "bullseye", "villain"), card("60066", "bullseye", "villain"),
		card("60121", "heist", "main_scheme"),
	}}
	sets := map[string][]pack.Set{"p": {
		{Code: "bullseye", Name: "Bullseye", Kind: "underling", Cards: []string{"60065", "60066"}},
		{Code: "heist", Name: "Heist", Kind: "main_scheme", Cards: []string{"60121"}},
	}}
	return cards, sets
}

func underlingDef() curated.ScenarioDef {
	villain := pack.FaceRef{Card: "60065", Face: 0}
	return curated.ScenarioDef{
		ID:         "bullseye",
		VillainSet: "bullseye",
		Piles:      []pack.Pile{{Key: "villain", Label: "Villain", Cards: []string{"60065", "60066"}}},
		Start: map[pack.Difficulty]pack.Start{
			pack.Standard: {Top: map[string]pack.FaceRef{"villain": villain}},
			pack.Expert:   {Top: map[string]pack.FaceRef{"villain": villain}},
		},
		MainSchemes: []string{"heist"},
	}
}

func TestScenarioListsUnderlingSetsButNotMainSchemeSets(t *testing.T) {
	cards, sets := underlingFixture()

	_, refs, _ := buildScenarios(nil, nil, cards, sets, nil)

	if len(refs) != 1 || refs[0].ID != "bullseye" || refs[0].Supported || refs[0].Image != "https://x/60065" {
		t.Errorf("got refs %+v, want only the unsupported bullseye with the image of 60065", refs)
	}
}

func TestScenarioWithMainSchemes(t *testing.T) {
	cards, sets := underlingFixture()
	// Cerebro recommends a modular set for the villain: the main scheme set
	// brings the scenario's modular sets instead.
	sets["p"] = append(sets["p"], pack.Set{Code: "bomb_scare", Name: "Bomb Scare", Kind: "modular"})
	cb := []cerebro.Set{
		{ID: "b", Name: "Bomb Scare", Type: "Modular Set"},
		{ID: "u", Name: "Bullseye", Type: "Villain Set", Recommends: []string{"b"}},
	}

	scenarios, refs, problems := buildScenarios([]curated.ScenarioDef{underlingDef()}, nil, cards, sets, cb)

	if len(problems) != 0 {
		t.Fatalf("got problems %+v, want none", problems)
	}
	ref := findRef(t, refs, "bullseye")
	if !ref.Supported || !reflect.DeepEqual(ref.MainSchemes, []string{"heist"}) ||
		ref.Recommended == nil || len(ref.Recommended) != 0 {
		t.Errorf("got ref %+v, want supported with main scheme heist and an empty recommended list", ref)
	}
	got := scenarios["p"]
	if len(got) != 1 || !reflect.DeepEqual(got[0].MainSchemes, []string{"heist"}) || len(got[0].Recommended) != 0 {
		t.Errorf("got scenarios %+v, want bullseye with main scheme heist and no recommended set", got)
	}
}

func TestScenarioWithBadMainSchemeIsUnsupported(t *testing.T) {
	cards, sets := underlingFixture()
	def := underlingDef()
	// bullseye is a set of the catalog, but not a main scheme set.
	def.MainSchemes = []string{"heist", "nowhere", "bullseye"}

	scenarios, refs, problems := buildScenarios([]curated.ScenarioDef{def}, nil, cards, sets, nil)

	if findRef(t, refs, "bullseye").Supported {
		t.Error("bullseye is supported despite bad main scheme sets")
	}
	if len(scenarios) != 0 {
		t.Errorf("got scenarios %v, want none", scenarios)
	}
	var codes []string
	for _, problem := range problems {
		codes = append(codes, problem.Code)
		if !strings.Contains(problem.Reason, "is not a main scheme set") {
			t.Errorf("got problem %+v, want one about a set that is not a main scheme set", problem)
		}
	}
	if want := []string{"bullseye", "nowhere"}; !reflect.DeepEqual(codes, want) {
		t.Errorf("got problem codes %v, want %v", codes, want)
	}
}
