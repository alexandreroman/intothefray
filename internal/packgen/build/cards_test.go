package build

import (
	"encoding/json"
	"os"
	"reflect"
	"slices"
	"testing"

	"github.com/alexandreroman/intothefray/internal/pack"
	"github.com/alexandreroman/intothefray/internal/packgen/cerebro"
	"github.com/alexandreroman/intothefray/internal/packgen/curated"
	"github.com/alexandreroman/intothefray/internal/packgen/marvelcdb"
	"github.com/alexandreroman/intothefray/internal/packgen/report"
)

const (
	cerebroImageB = "https://pub-d27e6715f4ba4529bc9d8fd13938a5a1.r2.dev/cerebro-cards/official/01097B.jpg"
	marvelcdbB    = "https://marvelcdb.com/bundles/cards/01097b.png"
)

func readJSON[T any](t *testing.T, path string) []T {
	t.Helper()
	data, err := os.ReadFile(path) //nolint:gosec // fixed fixture paths
	if err != nil {
		t.Fatal(err)
	}
	var records []T
	if err := json.Unmarshal(data, &records); err != nil {
		t.Fatal(err)
	}
	return records
}

// marvelcdbCards returns the fixture records whose code is listed.
func marvelcdbCards(t *testing.T, codes ...string) []marvelcdb.Card {
	t.Helper()
	var selected []marvelcdb.Card
	for _, card := range readJSON[marvelcdb.Card](t, "testdata/marvelcdb.json") {
		if slices.Contains(codes, card.Code) {
			selected = append(selected, card)
		}
	}
	if len(selected) != len(codes) {
		t.Fatalf("fixture has %d of the %d requested cards", len(selected), len(codes))
	}
	return selected
}

func cerebroCards(t *testing.T) []cerebro.Card {
	t.Helper()
	return readJSON[cerebro.Card](t, "testdata/cerebro.json")
}

func findCard(t *testing.T, cards map[string][]pack.Card, packCode, code string) pack.Card {
	t.Helper()
	for _, card := range cards[packCode] {
		if card.Code == code {
			return card
		}
	}
	t.Fatalf("card %s not found in pack %s: %+v", code, packCode, cards)
	return pack.Card{}
}

func TestGroupPrefersSuffixedEntries(t *testing.T) {
	entries := marvelcdbCards(t, "01097", "01097a", "01097b")

	cards, unsupported := BuildCards(entries, cerebroCards(t), nil)

	if len(unsupported) != 0 {
		t.Fatalf("unsupported = %+v", unsupported)
	}
	if len(cards["core"]) != 1 {
		t.Fatalf("core cards = %+v, want one card", cards["core"])
	}
	card := findCard(t, cards, "core", "01097")
	if len(card.Faces) != 2 {
		t.Fatalf("faces = %+v, want 2", card.Faces)
	}
	if card.Faces[0].Stage != "1A" || card.Faces[1].Stage != "1B" {
		t.Errorf("stages = %q, %q, want 1A, 1B", card.Faces[0].Stage, card.Faces[1].Stage)
	}
	if want := []string{"01097a", "01097b"}; !reflect.DeepEqual(card.Aliases, want) {
		t.Errorf("aliases = %v, want %v", card.Aliases, want)
	}
	if card.Faces[0].Size != pack.SizeLand {
		t.Errorf("size = %q, want %q", card.Faces[0].Size, pack.SizeLand)
	}
	if card.Back != pack.BackVillain {
		t.Errorf("back = %q, want %q", card.Back, pack.BackVillain)
	}
	if card.Set != "rhino" || card.Quantity != 1 {
		t.Errorf("set = %q, quantity = %d", card.Set, card.Quantity)
	}
}

func TestReprintBecomesAlias(t *testing.T) {
	entries := marvelcdbCards(t, "27049", "52022")

	cards, unsupported := BuildCards(entries, nil, nil)

	if len(unsupported) != 0 {
		t.Fatalf("unsupported = %+v", unsupported)
	}
	if len(cards["sm"]) != 1 || len(cards["silk"]) != 0 {
		t.Fatalf("cards = %+v, want only the original in pack sm", cards)
	}
	card := findCard(t, cards, "sm", "27049")
	if !slices.Contains(card.Aliases, "52022") {
		t.Errorf("aliases = %v, want 52022", card.Aliases)
	}
	if card.Back != pack.BackPlayer || card.Faces[0].Size != pack.SizeStd {
		t.Errorf("back = %q, size = %q", card.Back, card.Faces[0].Size)
	}
}

func TestReprintFaceKeepsItsLetter(t *testing.T) {
	entries := marvelcdbCards(t, "12001a", "12001b", "12001c")
	reprint := marvelcdb.Card{Code: "99001b", Name: "Scott Lang", TypeCode: "alter_ego", PackCode: "other", DuplicateOf: "12001b"}

	cards, _ := BuildCards(append(entries, reprint), nil, nil)

	card := findCard(t, cards, "ant", "12001")
	if !slices.Contains(card.Aliases, "99001b") {
		t.Errorf("aliases = %v, want 99001b", card.Aliases)
	}
	if len(cards["other"]) != 0 {
		t.Errorf("reprint produced a card: %+v", cards["other"])
	}
}

func TestImagesPreferCerebro(t *testing.T) {
	entries := marvelcdbCards(t, "01097a", "01097b")

	cards, _ := BuildCards(entries, cerebroCards(t), nil)

	faces := findCard(t, cards, "core", "01097").Faces
	if want := []string{cerebroImageB, marvelcdbB}; !reflect.DeepEqual(faces[1].Images, want) {
		t.Errorf("images = %v, want %v", faces[1].Images, want)
	}
	// 01097a has no marvelcdb image: Cerebro is the only source.
	if len(faces[0].Images) != 1 {
		t.Errorf("images = %v, want only the Cerebro URL", faces[0].Images)
	}
}

func TestCardWithoutImagesIsUnsupported(t *testing.T) {
	entries := marvelcdbCards(t, "27049")
	entries[0].ImageSrc = ""

	cards, unsupported := BuildCards(entries, nil, nil)

	if len(cards["sm"]) != 0 {
		t.Errorf("cards = %+v, want none", cards)
	}
	want := []report.Unsupported{{Code: "27049", Name: "Spider-Man", Pack: "sm", Reason: "no image"}}
	if !reflect.DeepEqual(unsupported, want) {
		t.Errorf("unsupported = %+v, want %+v", unsupported, want)
	}
}

func TestSizeOverride(t *testing.T) {
	entries := marvelcdbCards(t, "12001a", "12001b", "12001c")
	overrides := map[string]curated.CardOverride{"12001c": {Size: pack.SizeDoubleStd}}

	cards, _ := BuildCards(entries, nil, overrides)

	faces := findCard(t, cards, "ant", "12001").Faces
	if len(faces) != 3 {
		t.Fatalf("faces = %+v, want 3", faces)
	}
	if faces[2].Size != pack.SizeDoubleStd || faces[0].Size != pack.SizeStd {
		t.Errorf("sizes = %q, %q, %q", faces[0].Size, faces[1].Size, faces[2].Size)
	}
}

func TestStartingThreatAndHandSize(t *testing.T) {
	cards, _ := BuildCards(marvelcdbCards(t, "01097a", "01097b"), cerebroCards(t), nil)
	faces := findCard(t, cards, "core", "01097").Faces

	if want := (&pack.Threat{Value: 0, PerPlayer: false}); !reflect.DeepEqual(faces[1].StartingThreat, want) {
		t.Errorf("01097b threat = %+v, want %+v", faces[1].StartingThreat, want)
	}
	if faces[0].StartingThreat != nil {
		t.Errorf("01097a threat = %+v, want nil", faces[0].StartingThreat)
	}

	heroCards, _ := BuildCards(marvelcdbCards(t, "12001a", "12001b", "12001c"), nil, nil)
	heroFaces := findCard(t, heroCards, "ant", "12001").Faces
	if heroFaces[0].HandSize != 5 || heroFaces[1].HandSize != 6 {
		t.Errorf("hand sizes = %d, %d, want 5, 6", heroFaces[0].HandSize, heroFaces[1].HandSize)
	}
	if heroCards["ant"][0].Back != pack.BackPlayer {
		t.Errorf("hero back = %q", heroCards["ant"][0].Back)
	}
}

func TestBackRules(t *testing.T) {
	tests := []struct {
		name string
		card marvelcdb.Card
		want pack.Back
	}{
		{"villain type", marvelcdb.Card{TypeCode: "villain", SetType: "villain"}, pack.BackVillain},
		{"modular minion", marvelcdb.Card{TypeCode: "minion", SetType: "modular"}, pack.BackEncounter},
		{"nemesis set", marvelcdb.Card{TypeCode: "minion", SetType: "nemesis"}, pack.BackEncounter},
		{"obligation", marvelcdb.Card{TypeCode: "obligation", SetType: "hero"}, pack.BackEncounter},
		{"hero event", marvelcdb.Card{TypeCode: "event", SetType: "hero"}, pack.BackPlayer},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			tt.card.Code, tt.card.Name, tt.card.PackCode, tt.card.ImageSrc = "00001", "X", "p", "/x.png"
			cards, _ := BuildCards([]marvelcdb.Card{tt.card}, nil, nil)
			if got := cards["p"][0].Back; got != tt.want {
				t.Errorf("back = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestCardsSortedByCode(t *testing.T) {
	entries := []marvelcdb.Card{
		{Code: "00020", Name: "B", TypeCode: "ally", PackCode: "p", ImageSrc: "/b.png"},
		{Code: "00003", Name: "A", TypeCode: "ally", PackCode: "p", ImageSrc: "/a.png"},
	}

	cards, _ := BuildCards(entries, nil, nil)

	if cards["p"][0].Code != "00003" || cards["p"][1].Code != "00020" {
		t.Errorf("cards = %+v, want sorted by code", cards["p"])
	}
}

func TestReprintChainAttachesToRoot(t *testing.T) {
	entries := marvelcdbCards(t, "27049", "52022")
	chained := marvelcdb.Card{Code: "43027", Name: "Spider-Man", PackCode: "other", DuplicateOf: "52022"}

	cards, unsupported := BuildCards(append(entries, chained), nil, nil)

	if len(unsupported) != 0 {
		t.Fatalf("unsupported = %+v", unsupported)
	}
	card := findCard(t, cards, "sm", "27049")
	if want := []string{"43027", "52022"}; !reflect.DeepEqual(card.Aliases, want) {
		t.Errorf("aliases = %v, want %v", card.Aliases, want)
	}
}

func TestUnattachableReprintsAreReported(t *testing.T) {
	entries := marvelcdbCards(t, "27049")
	reprints := []marvelcdb.Card{
		{Code: "50001", Name: "Lost", PackCode: "p", DuplicateOf: "99999"},
		{Code: "50002", Name: "Loop A", PackCode: "p", DuplicateOf: "50003"},
		{Code: "50003", Name: "Loop B", PackCode: "p", DuplicateOf: "50002"},
		{Code: "50004b", Name: "Extra face", PackCode: "p", DuplicateOf: "27049"},
	}

	cards, unsupported := BuildCards(append(entries, reprints...), nil, nil)

	want := []report.Unsupported{
		{Code: "50001", Name: "Lost", Pack: "p", Reason: "original not found"},
		{Code: "50002", Name: "Loop A", Pack: "p", Reason: "reprint cycle"},
		{Code: "50003", Name: "Loop B", Pack: "p", Reason: "reprint cycle"},
		{Code: "50004b", Name: "Extra face", Pack: "p", Reason: "reprint face missing from original"},
	}
	if !reflect.DeepEqual(unsupported, want) {
		t.Errorf("unsupported = %+v, want %+v", unsupported, want)
	}
	if aliases := findCard(t, cards, "sm", "27049").Aliases; len(aliases) != 0 {
		t.Errorf("aliases = %v, want none", aliases)
	}
}

func TestUnlinkedLetteredGroupIsDistinctCards(t *testing.T) {
	entries := []marvelcdb.Card{
		{Code: "01043a", Name: "Wakanda Forever!", TypeCode: "event", PackCode: "core", Quantity: 1, ImageSrc: "/a.png"},
		{Code: "01043d", Name: "Wakanda Forever!", TypeCode: "event", PackCode: "core", Quantity: 2, ImageSrc: "/d.png"},
	}

	cards, unsupported := BuildCards(entries, nil, nil)

	if len(unsupported) != 0 {
		t.Fatalf("unsupported = %+v", unsupported)
	}
	if len(cards["core"]) != 2 {
		t.Fatalf("core cards = %+v, want two cards", cards["core"])
	}
	for code, quantity := range map[string]int{"01043a": 1, "01043d": 2} {
		card := findCard(t, cards, "core", code)
		if len(card.Faces) != 1 || card.Quantity != quantity || len(card.Aliases) != 0 {
			t.Errorf("card %s = %+v, want 1 face, quantity %d, no alias", code, card, quantity)
		}
	}
}

func TestUnlinkedExtraFormJoinsLinkedCard(t *testing.T) {
	entries := marvelcdbCards(t, "12001a", "12001b", "12001c")
	for i := range entries {
		entries[i].LinkedTo = ""
	}
	entries[0].LinkedTo = "12001b"

	cards, _ := BuildCards(entries, nil, nil)

	card := findCard(t, cards, "ant", "12001")
	if len(card.Faces) != 3 || len(cards["ant"]) != 1 {
		t.Errorf("cards = %+v, want one card with 3 faces", cards["ant"])
	}
}

func TestReprintOfDistinctLetteredCard(t *testing.T) {
	entries := []marvelcdb.Card{
		{Code: "01043a", Name: "W", PackCode: "core", ImageSrc: "/a.png"},
		{Code: "01043b", Name: "W", PackCode: "core", ImageSrc: "/b.png"},
	}
	reprints := []marvelcdb.Card{
		{Code: "99001", Name: "W", PackCode: "other", DuplicateOf: "01043b"},
		{Code: "99002b", Name: "W", PackCode: "other", DuplicateOf: "01043b"},
	}

	cards, unsupported := BuildCards(append(entries, reprints...), nil, nil)

	if aliases := findCard(t, cards, "core", "01043b").Aliases; !reflect.DeepEqual(aliases, []string{"99001"}) {
		t.Errorf("aliases = %v, want [99001]", aliases)
	}
	want := []report.Unsupported{
		{Code: "99002b", Name: "W", Pack: "other", Reason: "reprint face missing from original"},
	}
	if !reflect.DeepEqual(unsupported, want) {
		t.Errorf("unsupported = %+v, want %+v", unsupported, want)
	}
}
