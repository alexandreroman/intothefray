package build

import (
	"reflect"
	"slices"
	"testing"

	"github.com/alexandreroman/intothefray/internal/pack"
	"github.com/alexandreroman/intothefray/internal/packgen/curated"
	"github.com/alexandreroman/intothefray/internal/packgen/marvelcdb"
	"github.com/alexandreroman/intothefray/internal/packgen/mc4db"
	"github.com/alexandreroman/intothefray/internal/packgen/report"
)

// fallbackInputs returns marvelcdb records that list Fear No Evil with one
// face of its hero only, and the mc4db records of testdata/fallback_mc4db.json.
func fallbackInputs(t *testing.T) Inputs {
	t.Helper()
	return Inputs{
		MC: []marvelcdb.Card{{
			Code: "60001a", Name: "Daredevil", TypeCode: "hero", FactionCode: "hero", PackCode: "fne",
			SetCode: "daredevil", SetName: "Daredevil", SetType: "hero",
			ImageSrc: "/bundles/cards/60001a.png", Quantity: 1, HandSize: 5,
		}},
		// The name differs from mc4db's in case only.
		MCPacks: []marvelcdb.Pack{
			{Code: "thor", Name: "Thor", Position: 6},
			{Code: "fne", Name: "Fear no Evil", Position: 60},
		},
		MC4DB: readJSON[mc4db.Card](t, "testdata/fallback_mc4db.json"),
		MC4DBPacks: []mc4db.Pack{
			{Code: "thor", Name: "Thor", Position: 6, Creator: "FFG"},
			{Code: "thor_by_ffg", Name: "Thor Hero Pack", Position: 6, Creator: "FFG"},
			{Code: "fear_no_evil_by_ffg", Name: "Fear No Evil", Position: 60, Creator: "FFG"},
			{Code: "next_box_by_ffg", Name: "Next Box", Position: 61, Creator: "FFG"},
			{Code: "mighty_thor_by_rainy", Name: "Mighty Thor", Position: 2021, Creator: "Rainy"},
		},
	}
}

func TestWithFallbackAddsMissingRecords(t *testing.T) {
	in := fallbackInputs(t)
	cards, _, _, _ := withFallback(in.MC, in.MCPacks, in.MC4DB, in.MC4DBPacks)
	added := make(map[string]marvelcdb.Card)
	for _, card := range cards[len(in.MC):] {
		added[card.Code] = card
	}

	tests := []struct {
		name     string
		code     string
		wantPack string // empty when the record is not added
		wantSet  string
	}{
		{"missing card, pack mapped by name", "60159a", "fne", "kingpin"},
		{"other face of a missing card", "60159b", "fne", "kingpin"},
		{"nemesis set", "60030", "fne", "daredevil_nemesis"},
		{"pack mapped by code", "06099", "thor", "thor_modular"},
		{"pack mapped by code without the official tag", "06098", "thor", "thor_modular"},
		{"pack missing from marvelcdb", "61001", "next_box", "next_villain"},
		{"both faces under one code", "63001", "", ""},
		{"other face of a base code marvelcdb has", "60001b", "", ""},
		{"fan-made card in an official pack", "06035a", "", ""},
		{"fan-made pack", "99001", "", ""},
		{"pack listed by neither source", "62001", "", ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			card, found := added[tt.code]
			if tt.wantPack == "" {
				if found {
					t.Fatalf("added %+v, want it left out", card)
				}
				return
			}
			if !found {
				t.Fatalf("%s not added", tt.code)
			}
			if card.PackCode != tt.wantPack || card.SetCode != tt.wantSet {
				t.Errorf("got pack %q, set %q, want %q, %q", card.PackCode, card.SetCode, tt.wantPack, tt.wantSet)
			}
			if card.ImageHost != mc4db.BaseURL {
				t.Errorf("got image host %q, want %q", card.ImageHost, mc4db.BaseURL)
			}
		})
	}
}

func TestWithFallbackPacksAndReport(t *testing.T) {
	in := fallbackInputs(t)
	mcPacks := slices.Clone(in.MCPacks)

	_, packs, added, unsupported := withFallback(in.MC, in.MCPacks, in.MC4DB, in.MC4DBPacks)

	wantPacks := append(slices.Clone(mcPacks), marvelcdb.Pack{Code: "next_box", Name: "Next Box", Position: 61})
	if !reflect.DeepEqual(packs, wantPacks) {
		t.Errorf("got packs %+v, want %+v", packs, wantPacks)
	}
	if !reflect.DeepEqual(in.MCPacks, mcPacks) {
		t.Errorf("marvelcdb packs changed to %+v", in.MCPacks)
	}

	fallback := func(packCode, code, name string) report.Fallback {
		return report.Fallback{Source: "mc4db", Pack: packCode, Code: code, Name: name}
	}
	wantAdded := []report.Fallback{
		fallback("fne", "60030", "Bullseye"),
		fallback("fne", "60159a", "Kingpin"),
		fallback("fne", "60159b", "Kingpin"),
		fallback("fne", "60161a", "The King's Gambit"),
		fallback("fne", "60161b", "The King's Gambit"),
		fallback("fne", "60163a", "Public Support"),
		fallback("fne", "60163b", "Public Support"),
		fallback("fne", "60164", "Bear Hug"),
		fallback("next_box", "61001", "Next Villain"),
		fallback("thor", "06098", "Other Thor Card"),
		fallback("thor", "06099", "Lost Thor Card"),
	}
	if !reflect.DeepEqual(added, wantAdded) {
		t.Errorf("got report %+v, want %+v", added, wantAdded)
	}

	wantUnsupported := []report.Unsupported{{
		Code: "63001", Name: "Two-Faced Card", Pack: "fne", Reason: "mc4db record holds both faces under one code",
	}}
	if !reflect.DeepEqual(unsupported, wantUnsupported) {
		t.Errorf("got unsupported %+v, want %+v", unsupported, wantUnsupported)
	}
}

func TestImagesOf(t *testing.T) {
	cerebroIDs := map[string]string{"60159A": "60159A"}
	tests := []struct {
		name  string
		entry marvelcdb.Card
		want  []string
	}{
		{
			"marvelcdb record",
			marvelcdb.Card{Code: "01097", ImageSrc: "/bundles/cards/01097.png"},
			[]string{"https://marvelcdb.com/bundles/cards/01097.png"},
		},
		{
			"mc4db record",
			marvelcdb.Card{Code: "60164", ImageSrc: "/bundles/cards/EN/fne/60164.webp", ImageHost: mc4db.BaseURL},
			[]string{"https://mc4db.merlindumesnil.net/bundles/cards/EN/fne/60164.webp"},
		},
		{
			"mc4db record with a Cerebro image",
			marvelcdb.Card{Code: "60159a", ImageSrc: "/bundles/cards/EN/fne/60159a.webp", ImageHost: mc4db.BaseURL},
			[]string{
				"https://pub-d27e6715f4ba4529bc9d8fd13938a5a1.r2.dev/cerebro-cards/official/60159A.jpg",
				"https://mc4db.merlindumesnil.net/bundles/cards/EN/fne/60159a.webp",
			},
		},
		{"no image", marvelcdb.Card{Code: "01098", ImageHost: mc4db.BaseURL}, nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			if got := imagesOf(tt.entry, cerebroIDs, ""); !reflect.DeepEqual(got, tt.want) {
				t.Errorf("imagesOf = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestBuildSupportsScenarioOverFallbackSet(t *testing.T) {
	villain := pack.FaceRef{Card: "60159", Face: 0}
	scheme := pack.FaceRef{Card: "60161", Face: 0}
	start := pack.Start{
		Top:    map[string]pack.FaceRef{"villain": villain, "scheme": scheme},
		InPlay: []pack.FaceRef{{Card: "60163", Face: 0}},
	}
	in := fallbackInputs(t)
	in.Curated.Scenarios = []curated.ScenarioDef{{
		ID:         "kingpin",
		VillainSet: "kingpin",
		Piles: []pack.Pile{
			{Key: "villain", Label: "Villain", Cards: []string{"60159"}},
			{Key: "scheme", Label: "Main scheme", Cards: []string{"60161"}},
		},
		Start: map[pack.Difficulty]pack.Start{pack.Standard: start, pack.Expert: start},
	}}

	result, err := Build(allAlive(in))
	if err != nil {
		t.Fatal(err)
	}

	var fne pack.PackFile
	for _, packFile := range result.Packs {
		if packFile.Code == "fne" {
			fne = packFile
		}
	}
	if len(fne.Scenarios) != 1 || fne.Scenarios[0].ID != "kingpin" {
		t.Fatalf("got scenarios %+v, want kingpin", fne.Scenarios)
	}
	setIndex := slices.IndexFunc(fne.Sets, func(set pack.Set) bool { return set.Code == "kingpin" })
	if setIndex < 0 {
		t.Fatalf("got sets %+v, want kingpin", fne.Sets)
	}
	if want := []string{"60159", "60161", "60163", "60164"}; !slices.Equal(fne.Sets[setIndex].Cards, want) {
		t.Errorf("got kingpin cards %v, want %v", fne.Sets[setIndex].Cards, want)
	}
	// The fallback nemesis set loses its official tag, so it joins its hero.
	wantHeroes := []pack.Hero{{Identity: "60001", Set: "daredevil", Nemesis: "daredevil_nemesis"}}
	if !reflect.DeepEqual(fne.Heroes, wantHeroes) {
		t.Errorf("got heroes %+v, want %+v", fne.Heroes, wantHeroes)
	}
	for _, ref := range result.Index.Scenarios {
		if ref.ID == "kingpin" && !ref.Supported {
			t.Errorf("kingpin scenario is unsupported: %+v", result.Report)
		}
	}
	if len(result.Fallback) == 0 {
		t.Error("got no fallback entry")
	}
	if !slices.ContainsFunc(result.Report, func(entry report.Unsupported) bool { return entry.Code == "63001" }) {
		t.Errorf("report %+v lacks the two-faced mc4db record 63001", result.Report)
	}
}
