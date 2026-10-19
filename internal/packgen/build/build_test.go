package build

import (
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/alexandreroman/intothefray/internal/pack"
	"github.com/alexandreroman/intothefray/internal/packgen/curated"
	"github.com/alexandreroman/intothefray/internal/packgen/marvelcdb"
	"github.com/alexandreroman/intothefray/internal/packgen/report"
)

// allAlive marks every image of the inputs as live.
func allAlive(in Inputs) Inputs {
	in.Alive = make(map[string]bool)
	for _, url := range ImageURLs(in) {
		in.Alive[url] = true
	}
	return in
}

func villainCard(code, packCode, setCode string) marvelcdb.Card {
	return marvelcdb.Card{
		Code: code, Name: "Villain " + code, TypeCode: "villain", PackCode: packCode,
		SetCode: setCode, SetName: "Set " + setCode, SetType: "villain",
		ImageSrc: "/bundles/cards/" + code + ".png", Quantity: 1,
	}
}

func TestBuildIndexOrder(t *testing.T) {
	// The pack with the lowest card code comes last in the release order.
	in := allAlive(Inputs{
		MC: []marvelcdb.Card{
			villainCard("01001", "late", "v_late"),
			villainCard("02001", "early", "v_early"),
		},
		MCPacks: []marvelcdb.Pack{
			{Code: "late", Name: "Late", Position: 2},
			{Code: "early", Name: "Early", Position: 1},
		},
	})

	result, err := Build(in)
	if err != nil {
		t.Fatal(err)
	}

	if result.Index.Version != 1 {
		t.Errorf("got version %d, want 1", result.Index.Version)
	}
	var packCodes []string
	for _, ref := range result.Index.Packs {
		packCodes = append(packCodes, ref.Code)
		if ref.File != ref.Code+".json" {
			t.Errorf("got file %q for pack %q", ref.File, ref.Code)
		}
	}
	if want := []string{"early", "late"}; !slices.Equal(packCodes, want) {
		t.Errorf("got packs %v, want %v", packCodes, want)
	}
	var scenarioPacks []string
	for _, ref := range result.Index.Scenarios {
		scenarioPacks = append(scenarioPacks, ref.Pack)
	}
	if want := []string{"early", "late"}; !slices.Equal(scenarioPacks, want) {
		t.Errorf("got scenario packs %v, want %v", scenarioPacks, want)
	}
}

func TestBuildSetsInIndex(t *testing.T) {
	mc := setsFixture(t)
	for kind, code := range map[string]string{"standard": "09001", "expert": "09002"} {
		mc = append(mc, marvelcdb.Card{
			Code: code, Name: kind, TypeCode: "encounter", PackCode: "core",
			SetCode: kind, SetName: kind, SetType: kind, ImageSrc: "/" + code + ".png",
		})
	}

	result, err := Build(allAlive(Inputs{MC: mc, MCPacks: corePacks}))
	if err != nil {
		t.Fatal(err)
	}

	var kinds []string
	for _, ref := range result.Index.Sets {
		kinds = append(kinds, ref.Kind)
		if ref.Pack != "core" {
			t.Errorf("got pack %q for set %q", ref.Pack, ref.Code)
		}
	}
	slices.Sort(kinds)
	if want := []string{"expert", "modular", "standard"}; !slices.Equal(kinds, want) {
		t.Errorf("got kinds %v, want %v", kinds, want)
	}
}

func TestBuildDropsDeadCardsFromSetsAndHeroes(t *testing.T) {
	in := allAlive(Inputs{MC: setsFixture(t), MCPacks: corePacks})
	// The identity card of the hero and the Rhino scheme lose their images.
	delete(in.Alive, "https://marvelcdb.com/bundles/cards/01001a.png")
	delete(in.Alive, "https://marvelcdb.com/bundles/cards/01097.png")

	result, err := Build(in)
	if err != nil {
		t.Fatal(err)
	}

	core := result.Packs[0]
	if len(core.Heroes) != 0 {
		t.Errorf("got heroes %+v, want none", core.Heroes)
	}
	for _, set := range core.Sets {
		if slices.Contains(set.Cards, "01097") {
			t.Errorf("set %s still lists the dropped card", set.Code)
		}
	}
	var reasons []string
	for _, entry := range result.Report {
		if entry.Pack != "core" {
			t.Errorf("entry %+v has no pack", entry)
		}
		reasons = append(reasons, entry.Code+": "+entry.Reason)
	}
	for _, want := range []string{"01097: no image", "01001: hero identity card is missing"} {
		if !slices.Contains(reasons, want) {
			t.Errorf("report %v lacks %q", reasons, want)
		}
	}
}

func TestBuildClearsMissingObligation(t *testing.T) {
	in := allAlive(Inputs{MC: setsFixture(t), MCPacks: corePacks})
	delete(in.Alive, "https://marvelcdb.com/bundles/cards/01165.png")

	result, err := Build(in)
	if err != nil {
		t.Fatal(err)
	}

	heroes := result.Packs[0].Heroes
	if len(heroes) != 1 || heroes[0].Obligation != "" {
		t.Errorf("got heroes %+v, want one hero without obligation", heroes)
	}
	if !slices.ContainsFunc(result.Report, func(e report.Unsupported) bool {
		return e.Code == "01165" && strings.Contains(e.Reason, "obligation")
	}) {
		t.Errorf("report %+v does not mention the obligation", result.Report)
	}
}

func TestBuildRejectsScenarioWithInvalidFace(t *testing.T) {
	def := rhinoDef()
	start := def.Start[pack.Standard]
	start.Top = map[string]pack.FaceRef{"villain": {Card: "01094", Face: 3}}
	def.Start = map[pack.Difficulty]pack.Start{pack.Standard: start}
	in := allAlive(Inputs{
		MC:      setsFixture(t),
		MCPacks: corePacks,
		Curated: curated.Curated{Scenarios: []curated.ScenarioDef{def}},
	})

	result, err := Build(in)
	if err != nil {
		t.Fatal(err)
	}

	if len(result.Packs[0].Scenarios) != 0 {
		t.Errorf("got scenarios %+v, want none", result.Packs[0].Scenarios)
	}
	for _, ref := range result.Index.Scenarios {
		if ref.ID == "rhino" && ref.Supported {
			t.Error("rhino is still marked supported")
		}
	}
	if !slices.ContainsFunc(result.Report, func(e report.Unsupported) bool {
		return e.Code == "01094" && strings.Contains(e.Reason, "face 3")
	}) {
		t.Errorf("report %+v does not name the card and face", result.Report)
	}
}

func TestBuildKeepsValidScenario(t *testing.T) {
	in := allAlive(Inputs{
		MC:      setsFixture(t),
		MCPacks: corePacks,
		Curated: curated.Curated{Scenarios: []curated.ScenarioDef{rhinoDef()}},
	})

	result, err := Build(in)
	if err != nil {
		t.Fatal(err)
	}

	if got := result.Packs[0].Scenarios; len(got) != 1 || got[0].ID != "rhino" {
		t.Errorf("got scenarios %+v, want rhino", got)
	}
}

func TestBuildFailsWithoutAnyPack(t *testing.T) {
	if _, err := Build(Inputs{}); err == nil {
		t.Error("expected an error for empty inputs")
	}
}

// standardSetsInputs returns the core fixture plus a standard set whose
// two-sided card 09003 starts in play, and a PvP standard set.
func standardSetsInputs(t *testing.T, defs map[string]curated.SetDef) Inputs {
	t.Helper()
	standardCard := func(code, setCode, linkedTo string) marvelcdb.Card {
		return marvelcdb.Card{
			Code: code, Name: "Card " + code, TypeCode: "environment", PackCode: "core",
			SetCode: setCode, SetName: setCode, SetType: "standard",
			LinkedTo: linkedTo, ImageSrc: "/" + code + ".png", Quantity: 1,
		}
	}
	mc := append(setsFixture(t),
		standardCard("09003a", "standard_ii", "09003b"),
		standardCard("09003b", "standard_ii", ""),
		standardCard("09004", "standard_ii", ""),
		standardCard("09005", "standard_pvp", ""),
	)
	return allAlive(Inputs{MC: mc, MCPacks: corePacks, Curated: curated.Curated{Sets: defs}})
}

func TestBuildMergesCuratedSets(t *testing.T) {
	inPlay := map[pack.Difficulty][]pack.FaceRef{
		pack.Standard: {{Card: "09003", Face: 0}},
		pack.Expert:   {{Card: "09003", Face: 1}},
	}
	in := standardSetsInputs(t, map[string]curated.SetDef{
		"standard_ii":  {InPlay: inPlay},
		"standard_pvp": {Unlisted: true},
	})

	result, err := Build(in)
	if err != nil {
		t.Fatal(err)
	}

	sets := make(map[string]pack.Set)
	for _, set := range result.Packs[0].Sets {
		sets[set.Code] = set
	}
	if got := sets["standard_ii"]; !reflect.DeepEqual(got.InPlay, inPlay) || got.Unlisted {
		t.Errorf("got standard_ii %+v, want in-play %v and listed", got, inPlay)
	}
	if got := sets["standard_pvp"]; !got.Unlisted || got.InPlay != nil {
		t.Errorf("got standard_pvp %+v, want unlisted without in-play cards", got)
	}
	if got := sets["rhino"]; got.Unlisted || got.InPlay != nil {
		t.Errorf("got rhino %+v, want it untouched", got)
	}

	var indexed []string
	for _, ref := range result.Index.Sets {
		indexed = append(indexed, ref.Code)
	}
	if !slices.Contains(indexed, "standard_ii") || slices.Contains(indexed, "standard_pvp") {
		t.Errorf("got index sets %v, want standard_ii without standard_pvp", indexed)
	}
}

func TestBuildRejectsInvalidCuratedSets(t *testing.T) {
	inPlay := func(card string, face int) curated.SetDef {
		return curated.SetDef{InPlay: map[pack.Difficulty][]pack.FaceRef{
			pack.Standard: {{Card: card, Face: face}},
		}}
	}
	tests := []struct {
		name string
		defs map[string]curated.SetDef
		want string
	}{
		{"unknown set", map[string]curated.SetDef{"standard_iv": {Unlisted: true}}, "standard_iv is not in the catalog"},
		{"card of another set", map[string]curated.SetDef{"standard_ii": inPlay("09005", 0)}, "09005 is not in the set"},
		{"unknown card", map[string]curated.SetDef{"standard_ii": inPlay("09999", 0)}, "09999 is not in the set"},
		{"face out of range", map[string]curated.SetDef{"standard_ii": inPlay("09003", 2)}, "09003 has no face 2"},
		{"negative face", map[string]curated.SetDef{"standard_ii": inPlay("09004", -1)}, "09004 has no face -1"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := Build(standardSetsInputs(t, tt.defs))
			if err == nil || !strings.Contains(err.Error(), tt.want) {
				t.Fatalf("got error %v, want one containing %q", err, tt.want)
			}
		})
	}
}
