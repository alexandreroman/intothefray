package build

import (
	"reflect"
	"slices"
	"testing"

	"github.com/alexandreroman/intothefray/internal/pack"
	"github.com/alexandreroman/intothefray/internal/packgen/curated"
	"github.com/alexandreroman/intothefray/internal/packgen/marvelcdb"
)

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
	cards, _ := buildCards(mc, nil, manifestFor(mc))

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

func TestLocalizeCardsWithoutFrench(t *testing.T) {
	mc := []marvelcdb.Card{{Code: "01004", Name: "Enhanced Spider-Sense", PackCode: "core", ImageSrc: "/a.png"}}
	cards, _ := buildCards(mc, nil, manifestFor(mc))

	localizeCards(cards, faceCodesOf(mc), frenchSourcesOf(Inputs{}))

	if got := cards["core"][0].Faces[0].Localized; got != nil {
		t.Errorf("localized = %+v, want nil without French sources", got)
	}
}

// frenchInputs returns the core fixture with French names for the Rhino
// scheme, the pack and the sets, and an English image for every face.
func frenchInputs(t *testing.T) Inputs {
	t.Helper()
	mc := setsFixture(t)
	frenchMC := []marvelcdb.Card{
		{Code: "01094", Name: "Rhino", SetCode: "rhino", SetName: "Rhino"},
		{Code: "01097", Name: "L'Effraction !", SetCode: "rhino", SetName: "Rhino"},
		{Code: "01109", Name: "Alerte à la Bombe", SetCode: "bomb_scare", SetName: "Alerte à la Bombe"},
		{Code: "01113", Name: "Klaw", SetCode: "klaw", SetName: "Klaw (FR)"},
	}
	return withManifest(Inputs{
		MC:            mc,
		MCPacks:       corePacks,
		FrenchMC:      frenchMC,
		FrenchMCPacks: []marvelcdb.Pack{{Code: "core", Name: "Boîte de base", Position: 1}},
		Curated: curated.Curated{Scenarios: []curated.ScenarioDef{
			{ID: "rhino", VillainSet: "rhino"},
			{ID: "klaw_scenario", VillainSet: "klaw"},
		}},
	})
}

func TestBuildLocalizesFaces(t *testing.T) {
	in := frenchInputs(t)
	// The scheme has no French scan, and the Klaw villain card no English one.
	for _, code := range []string{"01094", "01109", "01113"} {
		addImage(in.Manifest, code, "fr")
	}
	delete(in.Manifest.Faces["01113"], "en")

	result, err := Build(in)
	if err != nil {
		t.Fatal(err)
	}

	tests := []struct {
		code string
		want map[string]pack.Localized
	}{
		{"01094", map[string]pack.Localized{"fr": {Images: []string{imageURL("01094", "fr")}}}},
		{"01097", map[string]pack.Localized{"fr": {Name: "L'Effraction !"}}},
		{"01098", nil},
		{"01109", map[string]pack.Localized{"fr": {
			Name: "Alerte à la Bombe", Images: []string{imageURL("01109", "fr")},
		}}},
	}
	for _, tt := range tests {
		if got := faceOf(t, result.Packs, tt.code, 0).Localized; !reflect.DeepEqual(got, tt.want) {
			t.Errorf("card %s localized = %+v, want %+v", tt.code, got, tt.want)
		}
	}
	// A French image never saves a card without English image.
	for _, card := range result.Packs[0].Cards {
		if card.Code == "01113" {
			t.Error("card 01113 has no English image but was kept")
		}
	}
}

func TestBuildNoFrenchKeepsNames(t *testing.T) {
	result, err := Build(frenchInputs(t))
	if err != nil {
		t.Fatal(err)
	}

	want := map[string]pack.Localized{"fr": {Name: "L'Effraction !"}}
	if got := faceOf(t, result.Packs, "01097", 0).Localized; !reflect.DeepEqual(got, want) {
		t.Errorf("scheme localized = %+v, want %+v", got, want)
	}
	for _, card := range result.Packs[0].Cards {
		for _, face := range card.Faces {
			if images := face.Localized["fr"].Images; len(images) > 0 {
				t.Errorf("card %s has French images %v without a French scan", card.Code, images)
			}
		}
	}
}

func TestBuildLocalizesIndex(t *testing.T) {
	result, err := Build(frenchInputs(t))
	if err != nil {
		t.Fatal(err)
	}

	index := result.Index
	wantPack := map[string]pack.Localized{"fr": {Name: "Boîte de base"}}
	if got := index.Packs[0].Localized; !reflect.DeepEqual(got, wantPack) {
		t.Errorf("pack localized = %+v, want %+v", got, wantPack)
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
	addImage(in.Manifest, "02001", "en")
	// Every face has a French scan but the scheme and the card of "other".
	for _, record := range in.MC {
		if record.Code != "01097" && record.Code != "02001" {
			addImage(in.Manifest, record.Code, "fr")
		}
	}

	result, err := Build(in)
	if err != nil {
		t.Fatal(err)
	}

	faces := len(in.MC) // one face per record
	// Of the four French names, only the scheme and the side scheme differ
	// from English: Rhino and Klaw keep theirs, so they are not translated.
	const translated = 2
	got := result.Coverage
	if len(got) != 1 {
		t.Fatalf("coverage = %+v, want one language", got)
	}
	if got[0].Lang != "fr" || got[0].Faces != faces || got[0].Names != translated || got[0].Images != faces-2 {
		t.Errorf("coverage = %+v, want fr with %d faces, %d names and %d images", got[0], faces, translated, faces-2)
	}
	if want := []string{"other"}; !slices.Equal(got[0].PacksWithoutImages, want) {
		t.Errorf("packs without images = %v, want %v", got[0].PacksWithoutImages, want)
	}
}
