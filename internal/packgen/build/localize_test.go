package build

import (
	"reflect"
	"slices"
	"testing"

	"github.com/alexandreroman/intothefray/internal/pack"
	"github.com/alexandreroman/intothefray/internal/packgen/curated"
	"github.com/alexandreroman/intothefray/internal/packgen/marvelcdb"
	"github.com/alexandreroman/intothefray/internal/packgen/mc4db"
)

const frenchImages = "https://mc4db.merlindumesnil.net/bundles/cards/FR/"

// faceOf returns one face of a built card.
func faceOf(t *testing.T, packs []pack.PackFile, code string, faceIndex int) pack.Face {
	t.Helper()
	for _, packFile := range packs {
		for _, card := range packFile.Cards {
			if card.Code == code {
				return card.Faces[faceIndex]
			}
		}
	}
	t.Fatalf("card %s not found", code)
	return pack.Face{}
}

func TestLocalizeCardsNames(t *testing.T) {
	mc := []marvelcdb.Card{
		{Code: "01002", Name: "Black Cat", Subname: "Felicia Hardy", TypeCode: "ally", PackCode: "core", ImageSrc: "/a.png"},
		{Code: "01094", Name: "Rhino", TypeCode: "villain", PackCode: "core", ImageSrc: "/b.png"},
		{Code: "01050", Name: "Hulk", Subname: "Bruce Banner", TypeCode: "hero", PackCode: "core", ImageSrc: "/c.png"},
		{Code: "01099", Name: "Charge", TypeCode: "attachment", PackCode: "core", ImageSrc: "/d.png"},
	}
	fr := frenchSourcesOf(Inputs{FrenchMC: []marvelcdb.Card{
		{Code: "01002", Name: "Chatte Noire", Subname: "Felicia Hardy"},
		{Code: "01094", Name: "Rhino"},
		{Code: "01050", Name: "Hulk", Subname: "Bruce Banner (FR)"},
	}})
	cards, _ := BuildCards(mc, nil, nil)

	localizeCards(cards, faceCodesOf(mc), fr)

	tests := []struct {
		code string
		want map[string]pack.Localized
	}{
		{"01002", map[string]pack.Localized{"fr": {Name: "Chatte Noire"}}},
		{"01094", nil}, // same name in French
		{"01050", map[string]pack.Localized{"fr": {Subname: "Bruce Banner (FR)"}}},
		{"01099", nil}, // no French record
	}
	for _, tt := range tests {
		got := findCard(t, cards, "core", tt.code).Faces[0].Localized
		if !reflect.DeepEqual(got, tt.want) {
			t.Errorf("card %s localized = %+v, want %+v", tt.code, got, tt.want)
		}
	}
}

func TestFrenchImageCandidates(t *testing.T) {
	fr := frenchSourcesOf(Inputs{MC4DB: []mc4db.Card{
		{Code: "01004", PackCode: "core", ImageSrc: "/bundles/cards/EN/core/01004.webp"},
		// A reprint stored with the image of its original.
		{Code: "16015", PackCode: "gmw", ImageSrc: "/bundles/cards/EN/core/01079.webp"},
		{Code: "01043b", PackCode: "core"},
		{
			Code: "26002", PackCode: "vision",
			ImageSrc: "/bundles/cards/EN/vision/26002.webp", BackImageSrc: "/bundles/cards/EN/vision/26002b.webp",
		},
	}})

	tests := []struct {
		name      string
		faceCode  string
		faceIndex int
		packCode  string
		want      string
	}{
		{"listed face", "01004", 0, "core", frenchImages + "core/01004.webp"},
		{"listed face with another path", "16015", 0, "gmw", frenchImages + "core/01079.webp"},
		{"listed face without image", "01043b", 0, "core", frenchImages + "core/01043b.webp"},
		{"front of a double-sided card", "26002a", 0, "vision", frenchImages + "vision/26002.webp"},
		{"back of a double-sided card", "26002b", 1, "vision", frenchImages + "vision/26002b.webp"},
		{"unlisted face", "01097a", 0, "core", frenchImages + "core/01097a.webp"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := fr.imageOf(tt.faceCode, tt.faceIndex, tt.packCode); got != tt.want {
				t.Errorf("imageOf(%s, %d) = %q, want %q", tt.faceCode, tt.faceIndex, got, tt.want)
			}
		})
	}
}

func TestLocalizeCardsWithoutMC4DB(t *testing.T) {
	mc := []marvelcdb.Card{{Code: "01004", Name: "Enhanced Spider-Sense", PackCode: "core", ImageSrc: "/a.png"}}
	cards, _ := BuildCards(mc, nil, nil)

	localizeCards(cards, faceCodesOf(mc), frenchSourcesOf(Inputs{}))

	if got := cards["core"][0].Faces[0].Localized; got != nil {
		t.Errorf("localized = %+v, want nil without French sources", got)
	}
}

// frenchInputs returns the core fixture with French names for the Rhino
// scheme, the pack and the sets, and mc4db paths for every card.
func frenchInputs(t *testing.T) Inputs {
	t.Helper()
	mc := setsFixture(t)
	frenchMC := []marvelcdb.Card{
		{Code: "01094", Name: "Rhino", SetCode: "rhino", SetName: "Rhino"},
		{Code: "01097", Name: "L'Effraction !", SetCode: "rhino", SetName: "Rhino"},
		{Code: "01109", Name: "Alerte à la Bombe", SetCode: "bomb_scare", SetName: "Alerte à la Bombe"},
		{Code: "01113", Name: "Klaw", SetCode: "klaw", SetName: "Klaw (FR)"},
	}
	var mc4dbCards []mc4db.Card
	for _, card := range mc {
		mc4dbCards = append(mc4dbCards, mc4db.Card{
			Code: card.Code, PackCode: "core", ImageSrc: "/bundles/cards/EN/core/" + card.Code + ".webp",
		})
	}
	return Inputs{
		MC:            mc,
		MCPacks:       corePacks,
		FrenchMC:      frenchMC,
		FrenchMCPacks: []marvelcdb.Pack{{Code: "core", Name: "Boîte de base", Position: 1}},
		MC4DB:         mc4dbCards,
		Curated: curated.Curated{Scenarios: []curated.ScenarioDef{
			{ID: "rhino", VillainSet: "rhino"},
			{ID: "klaw_scenario", VillainSet: "klaw"},
		}},
	}
}

func TestBuildLocalizesFaces(t *testing.T) {
	in := allAlive(frenchInputs(t))
	if url := frenchImages + "core/01097.webp"; !slices.Contains(ImageURLs(in), url) {
		t.Fatalf("ImageURLs lacks the French candidate %s", url)
	}
	// The French scan of the scheme is missing, and so is the English one of
	// the Klaw villain card.
	in.Alive[frenchImages+"core/01097.webp"] = false
	in.Alive[frenchImages+"core/01098.webp"] = false
	in.Alive["https://marvelcdb.com/bundles/cards/01113.png"] = false

	result, err := Build(in)
	if err != nil {
		t.Fatal(err)
	}

	tests := []struct {
		code string
		want map[string]pack.Localized
	}{
		{"01094", map[string]pack.Localized{"fr": {Images: []string{frenchImages + "core/01094.webp"}}}},
		{"01097", map[string]pack.Localized{"fr": {Name: "L'Effraction !"}}},
		{"01098", nil},
		{"01109", map[string]pack.Localized{"fr": {
			Name: "Alerte à la Bombe", Images: []string{frenchImages + "core/01109.webp"},
		}}},
	}
	for _, tt := range tests {
		if got := faceOf(t, result.Packs, tt.code, 0).Localized; !reflect.DeepEqual(got, tt.want) {
			t.Errorf("card %s localized = %+v, want %+v", tt.code, got, tt.want)
		}
	}
	// A live French image never saves a card without English image.
	for _, card := range result.Packs[0].Cards {
		if card.Code == "01113" {
			t.Error("card 01113 has no English image but was kept")
		}
	}
}

func TestBuildLocalizesIndex(t *testing.T) {
	result, err := Build(allAlive(frenchInputs(t)))
	if err != nil {
		t.Fatal(err)
	}

	index := result.Index
	if got, want := index.Packs[0].Localized, map[string]pack.Localized{"fr": {Name: "Boîte de base"}}; !reflect.DeepEqual(got, want) {
		t.Errorf("pack localized = %+v, want %+v", got, want)
	}
	for _, ref := range index.Sets {
		want := map[string]pack.Localized(nil)
		if ref.Code == "bomb_scare" {
			want = map[string]pack.Localized{"fr": {Name: "Alerte à la Bombe"}}
		}
		if !reflect.DeepEqual(ref.Localized, want) {
			t.Errorf("set %s localized = %+v, want %+v", ref.Code, ref.Localized, want)
		}
	}
	scenarios := make(map[string]map[string]pack.Localized)
	for _, ref := range index.Scenarios {
		scenarios[ref.ID] = ref.Localized
	}
	want := map[string]map[string]pack.Localized{
		"rhino":         nil, // same name in French
		"klaw_scenario": {"fr": {Name: "Klaw (FR)"}},
	}
	if !reflect.DeepEqual(scenarios, want) {
		t.Errorf("scenario localized = %+v, want %+v", scenarios, want)
	}
}

func TestBuildReportsFrenchCoverage(t *testing.T) {
	in := frenchInputs(t)
	in.MCPacks = append(in.MCPacks, marvelcdb.Pack{Code: "other", Name: "Other", Position: 2})
	in.MC = append(in.MC, marvelcdb.Card{
		Code: "02001", Name: "Other", TypeCode: "ally", PackCode: "other", ImageSrc: "/02001.png",
	})
	in = allAlive(in)
	in.Alive[frenchImages+"core/01097.webp"] = false
	in.Alive[frenchImages+"other/02001.webp"] = false

	result, err := Build(in)
	if err != nil {
		t.Fatal(err)
	}

	faces := len(in.MC) // one face per record
	got := result.Coverage
	if len(got) != 1 {
		t.Fatalf("coverage = %+v, want one language", got)
	}
	if got[0].Lang != "fr" || got[0].Faces != faces || got[0].Names != 4 || got[0].Images != faces-2 {
		t.Errorf("coverage = %+v, want fr with %d faces, 4 names and %d images", got[0], faces, faces-2)
	}
	if want := []string{"other"}; !slices.Equal(got[0].PacksWithoutImages, want) {
		t.Errorf("packs without images = %v, want %v", got[0].PacksWithoutImages, want)
	}
}
