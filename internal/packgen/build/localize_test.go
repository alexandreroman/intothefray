package build

import (
	"reflect"
	"strings"
	"testing"

	"github.com/alexandreroman/intothefray/internal/pack"
	"github.com/alexandreroman/intothefray/internal/packgen/cgbuilder"
	"github.com/alexandreroman/intothefray/internal/packgen/curated"
	"github.com/alexandreroman/intothefray/internal/packgen/marvelcdb"
	"github.com/alexandreroman/intothefray/internal/packgen/mc4db"
	"github.com/alexandreroman/intothefray/internal/packgen/report"
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
	return withManifest(t, Inputs{
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
	if want := (report.Coverage{Lang: "fr", Faces: faces, Names: translated}); got[0] != want {
		t.Errorf("coverage = %+v, want %+v", got[0], want)
	}
}

func TestTranslationPrecedence(t *testing.T) {
	sources := func(names ...string) frenchSources {
		var fr frenchSources
		for _, name := range names {
			fr.names = append(fr.names, nameSource{packs: map[string]string{"core": name}})
		}
		return fr
	}
	tests := []struct {
		name    string
		sources frenchSources
		want    string
	}{
		{"first source wins", sources("Boîte de base", "Coffret de base"), "Boîte de base"},
		{"empty name skipped", sources("", "Coffret de base"), "Coffret de base"},
		{"English does not mask a lower French name", sources("Core Set", "Coffret de base"), "Coffret de base"},
		{"English only", sources("Core Set", ""), ""},
		{"no source", sources(), ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.sources.packName("core", "Core Set"); got != tt.want {
				t.Errorf("packName = %q, want %q", got, tt.want)
			}
		})
	}
}

// allFrenchSources returns the core fixture with a name for the Bomb Scare set
// and the core pack in each French source: curated, mc4db, fr.marvelcdb and
// cgbuilder. The cgbuilder pack joins core by the names of the Bomb Scare
// cards, which French keeps or which the other sources translate.
func allFrenchSources(t *testing.T) Inputs {
	t.Helper()
	return Inputs{
		MC:      setsFixture(t),
		MCPacks: corePacks,
		Curated: curated.Curated{Names: map[string]curated.Names{"fr": {
			Packs: map[string]string{"core": "Base (curated)"},
			Sets:  map[string]string{"bomb_scare": "Alerte (curated)"},
		}}},
		FrenchMC4DBPacks: []marvelcdb.Pack{{Code: "core", Name: "Base (mc4db)"}},
		MC4DBPacks:       []marvelcdb.Pack{{Code: "core", Name: "Core Set"}},
		FrenchMC4DBSets:  []mc4db.Set{{Code: "bomb_scare", Name: "Alerte (mc4db)"}},
		FrenchMCPacks:    []marvelcdb.Pack{{Code: "core", Name: "Base (fr.marvelcdb)"}},
		FrenchMC: []marvelcdb.Card{
			{Code: "01109", Name: "Alerte à la Bombe", SetCode: "bomb_scare", SetName: "Alerte (fr.marvelcdb)"},
		},
		CGBuilder: cgbuilder.Site{
			Packs: []cgbuilder.Pack{{ID: 1, Name: "Base (cgbuilder)"}},
			Cards: []cgbuilder.Card{
				{Pack: 1, Number: 109, Names: []string{"Alerte à la Bombe"}, Set: 7},
				{Pack: 1, Number: 110, Names: []string{"Hydra Bomber"}, Set: 7},
				{Pack: 1, Number: 111, Names: []string{"Explosion"}, Set: 7},
			},
			Sets: []cgbuilder.Set{{ID: 7, Name: "Alerte (cgbuilder)"}},
		},
	}
}

func TestFrenchSourcesPrecedence(t *testing.T) {
	tests := []struct {
		name     string
		change   func(in *Inputs)
		wantPack string
		wantSet  string
	}{
		{"curated first", func(*Inputs) {}, "Base (curated)", "Alerte (curated)"},
		{
			"then mc4db",
			func(in *Inputs) { in.Curated = curated.Curated{} },
			"Base (mc4db)", "Alerte (mc4db)",
		},
		{
			"then fr.marvelcdb, under an English mc4db name",
			func(in *Inputs) {
				in.Curated = curated.Curated{}
				in.FrenchMC4DBPacks[0].Name = "Core Set"
				in.FrenchMC4DBSets[0].Name = "Bomb Scare"
			},
			"Base (fr.marvelcdb)", "Alerte (fr.marvelcdb)",
		},
		{
			"then cgbuilder, under English names",
			func(in *Inputs) {
				in.Curated = curated.Curated{}
				in.FrenchMC4DBPacks, in.FrenchMC4DBSets = nil, nil
				in.FrenchMCPacks[0].Name = "Core Set"
				in.FrenchMC[0].SetName = "Bomb Scare"
			},
			"Base (cgbuilder)", "Alerte (cgbuilder)",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			in := allFrenchSources(t)
			tt.change(&in)

			fr := frenchSourcesOf(in)

			if got := fr.packName("core", "Core Set"); got != tt.wantPack {
				t.Errorf("pack name = %q, want %q", got, tt.wantPack)
			}
			if got := fr.setName("bomb_scare", "Bomb Scare"); got != tt.wantSet {
				t.Errorf("set name = %q, want %q", got, tt.wantSet)
			}
		})
	}
}

func TestLocalizeCardsPrefersMC4DB(t *testing.T) {
	mc := []marvelcdb.Card{
		{Code: "50003", Name: "All-Points Bulletin", TypeCode: "event", PackCode: "aos", ImageSrc: "/a.png"},
		{Code: "50004", Name: "On the Double", TypeCode: "event", PackCode: "aos", ImageSrc: "/b.png"},
		{Code: "50005", Name: "Agent 13", Subname: "Sharon Carter", TypeCode: "ally", PackCode: "aos", ImageSrc: "/c.png"},
		{Code: "50006", Name: "Hard Choice", TypeCode: "event", PackCode: "aos", ImageSrc: "/d.png"},
	}
	official := func(code, name, subname, creator string) mc4db.Card {
		return mc4db.Card{Card: marvelcdb.Card{Code: code, Name: name, Subname: subname}, PackCreator: creator}
	}
	fr := frenchSourcesOf(Inputs{
		FrenchMC4DB: []mc4db.Card{
			official("50003", "Avis de Recherche", "", ""),
			official("50004", "On the Double", "", ""), // untranslated
			official("50005", "Agent 13", "", "FFG"),   // no subname
			official("50006", "Choix Fan-Made", "", "Designhacker"),
		},
		FrenchMC: []marvelcdb.Card{
			{Code: "50003", Name: "Bulletin (fr.marvelcdb)"},
			{Code: "50004", Name: "Intervention Éclair"},
			{Code: "50005", Name: "Agent 13", Subname: "Sharon Carter (FR)"},
		},
	})
	cards, _ := buildCards(mc, nil, manifestFor(mc))

	localizeCards(cards, faceCodesOf(mc), fr)

	tests := []struct {
		code string
		want map[string]pack.Localized
	}{
		{"50003", map[string]pack.Localized{"fr": {Name: "Avis de Recherche"}}},
		{"50004", map[string]pack.Localized{"fr": {Name: "Intervention Éclair"}}},
		{"50005", map[string]pack.Localized{"fr": {Subname: "Sharon Carter (FR)"}}},
		{"50006", nil}, // fan-made name left out
	}
	for _, tt := range tests {
		got := findCard(t, cards, "aos", tt.code).Faces[0].Localized
		if !reflect.DeepEqual(got, tt.want) {
			t.Errorf("card %s localized = %+v, want %+v", tt.code, got, tt.want)
		}
	}
}

func TestMC4DBFrenchCodes(t *testing.T) {
	in := Inputs{
		MCPacks: []marvelcdb.Pack{
			{Code: "core", Name: "Core Set"},
			{Code: "fne", Name: "Fear No Evil"},
			{Code: "thor", Name: "Thor"},
		},
		MC4DBPacks: []marvelcdb.Pack{
			{Code: "core", Name: "Core Set"},
			{Code: "fear_no_evil_by_ffg", Name: "Fear No Evil"},
			{Code: "thor_by_ffg", Name: "Thor Hero Pack"},
			{Code: "new_by_ffg", Name: "Brand New"},
		},
		FrenchMC4DBPacks: []marvelcdb.Pack{
			{Code: "core", Name: "Boîte de base"},
			{Code: "fear_no_evil_by_ffg", Name: "Peur de Rien"},
			{Code: "thor_by_ffg", Name: "Thor (FR)"},
			{Code: "new_by_ffg", Name: "Tout Neuf"},
			{Code: "lost_by_ffg", Name: "Perdu"}, // not in the English list
		},
		FrenchMC4DBSets: []mc4db.Set{
			{Code: "purple_man_by_ffg", Name: "L'Homme Pourpre"},
			{Code: "infiltrate_the_museum", Name: "Infiltrer le Musée"},
		},
	}

	source := mc4dbFrenchNames(in)

	wantPacks := map[string]string{
		"core": "Boîte de base", // by code
		"fne":  "Peur de Rien",  // by English name
		"thor": "Thor (FR)",     // by code without the official tag
		"new":  "Tout Neuf",     // a pack marvelcdb lacks
	}
	if !reflect.DeepEqual(source.packs, wantPacks) {
		t.Errorf("packs = %v, want %v", source.packs, wantPacks)
	}
	wantSets := map[string]string{"purple_man": "L'Homme Pourpre", "infiltrate_the_museum": "Infiltrer le Musée"}
	if !reflect.DeepEqual(source.sets, wantSets) {
		t.Errorf("sets = %v, want %v", source.sets, wantSets)
	}
}

func TestCardNumber(t *testing.T) {
	tests := []struct {
		code  string
		want  int
		found bool
	}{
		{"50184", 184, true},
		{"01001a", 1, true},
		{"0100", 0, false},
		{"ab123", 0, false},
	}
	for _, tt := range tests {
		got, found := cardNumber(tt.code)
		if got != tt.want || found != tt.found {
			t.Errorf("cardNumber(%q) = %d, %v, want %d, %v", tt.code, got, found, tt.want, tt.found)
		}
	}
}

func TestBuildCuratedNames(t *testing.T) {
	in := frenchInputs(t)
	in.Curated.Names = map[string]curated.Names{"fr": {
		Packs: map[string]string{"core": "Base (curated)"},
		Sets:  map[string]string{"klaw": "Klaw (curated)"},
	}}

	result, err := Build(in)
	if err != nil {
		t.Fatal(err)
	}

	if got := result.Index.Packs[0].Localized["fr"].Name; got != "Base (curated)" {
		t.Errorf("pack name = %q, want the curated one", got)
	}
	// The scenario takes the curated name of its villain set.
	for _, ref := range result.Index.Scenarios {
		if ref.ID == "klaw_scenario" && ref.Localized["fr"].Name != "Klaw (curated)" {
			t.Errorf("scenario localized = %+v, want the curated set name", ref.Localized)
		}
	}
}

func TestBuildRejectsUnknownCuratedNames(t *testing.T) {
	tests := []struct {
		name  string
		names map[string]curated.Names
		want  string
	}{
		{"unknown pack", map[string]curated.Names{"fr": {Packs: map[string]string{"nope": "Non"}}}, "pack nope"},
		{"unknown set", map[string]curated.Names{"fr": {Sets: map[string]string{"nope": "Non"}}}, "set nope"},
		{"unknown language", map[string]curated.Names{"de": {}}, `language "de"`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			in := frenchInputs(t)
			in.Curated.Names = tt.names

			_, err := Build(in)
			if err == nil || !strings.Contains(err.Error(), tt.want) {
				t.Fatalf("error = %v, want one naming %s", err, tt.want)
			}
		})
	}
}
