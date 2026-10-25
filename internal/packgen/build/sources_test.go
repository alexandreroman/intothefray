package build

import (
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/alexandreroman/intothefray/internal/pack"
	"github.com/alexandreroman/intothefray/internal/packgen/cdn"
	"github.com/alexandreroman/intothefray/internal/packgen/cerebro"
	"github.com/alexandreroman/intothefray/internal/packgen/curated"
	"github.com/alexandreroman/intothefray/internal/packgen/marvelcdb"
	"github.com/alexandreroman/intothefray/internal/packgen/mc4db"
)

const cerebroImages = "https://pub-d27e6715f4ba4529bc9d8fd13938a5a1.r2.dev/cerebro-cards/official/"

// sourceOf returns the source face of a code.
func sourceOf(t *testing.T, faces []cdn.SourceFace, code string) cdn.SourceFace {
	t.Helper()
	for _, face := range faces {
		if face.Code == code {
			return face
		}
	}
	t.Fatalf("face %s not found in %+v", code, faces)
	return cdn.SourceFace{}
}

func TestSourcesListsEveryFace(t *testing.T) {
	in := Inputs{
		MC: marvelcdbCards(t, "01097", "01097a", "01097b", "12001c", "12001b", "12001a"),
		CB: cerebroCards(t),
	}

	got := Sources(in)

	// The summary record 01097 is no face of the card.
	want := []cdn.SourceFace{
		{
			Code: "01097a", Landscape: true, Cerebro: cerebroImages + "01097A.jpg",
			Octgn: "1687b8a9-9630-4800-b297-03c5001e8ee9",
		},
		{
			Code: "01097b", Landscape: true, Cerebro: cerebroImages + "01097B.jpg",
			Record: "https://marvelcdb.com/bundles/cards/01097b.png", Octgn: "1687b8a9-9630-4800-b297-03c5001e8ee9.b",
		},
		{
			Code: "12001a", Record: "https://marvelcdb.com/bundles/cards/12001a.png",
			Octgn: "b768a53b-cb8c-47c5-9b65-f20ed2d89837",
		},
		{
			Code: "12001b", Record: "https://marvelcdb.com/bundles/cards/12001b.png",
			Octgn: "b768a53b-cb8c-47c5-9b65-f20ed2d89837.b",
		},
		{
			Code: "12001c", Record: "https://marvelcdb.com/bundles/cards/12001c.png",
			Octgn: "b768a53b-cb8c-47c5-9b65-f20ed2d89837.c",
		},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("Sources = %+v, want %+v", got, want)
	}
}

func TestSourcesBeforeDrop(t *testing.T) {
	in := withManifest(Inputs{MC: setsFixture(t), MCPacks: corePacks})
	delete(in.Manifest.Faces, "01097")

	result, err := Build(in)
	if err != nil {
		t.Fatal(err)
	}
	for _, card := range result.Packs[0].Cards {
		if card.Code == "01097" {
			t.Fatal("card 01097 has no English image but was kept")
		}
	}

	faces := Sources(in)
	if got := sourceOf(t, faces, "01097"); got.Record != "https://marvelcdb.com/bundles/cards/01097.png" {
		t.Errorf("got record image %q for the dropped card", got.Record)
	}
	if len(faces) != len(in.MC) {
		t.Errorf("got %d faces, want one per record (%d)", len(faces), len(in.MC))
	}
	if !slices.IsSortedFunc(faces, func(a, b cdn.SourceFace) int { return strings.Compare(a.Code, b.Code) }) {
		t.Error("faces are not sorted by code")
	}
}

func TestSourcesCerebroOverride(t *testing.T) {
	in := Inputs{
		MC: marvelcdbCards(t, "01097a", "01097b"),
		CB: []cerebro.Card{{ID: "01097A"}, {ID: "01097B"}},
		// Cerebro swaps the images of some identities: each face takes the
		// other's.
		Curated: curated.Curated{Cards: map[string]curated.CardOverride{
			"01097a": {Cerebro: "01097B"},
			"01097b": {Cerebro: "01097a"}, // matched whatever its case
		}},
	}

	faces := Sources(in)

	if got := sourceOf(t, faces, "01097a").Cerebro; got != cerebroImages+"01097B.jpg" {
		t.Errorf("01097a Cerebro image = %q, want the one of 01097B", got)
	}
	if got := sourceOf(t, faces, "01097b").Cerebro; got != cerebroImages+"01097A.jpg" {
		t.Errorf("01097b Cerebro image = %q, want the one of 01097A", got)
	}
}

func TestSourcesLandscape(t *testing.T) {
	in := Inputs{
		MC: []marvelcdb.Card{
			{Code: "01001", TypeCode: "hero", PackCode: "core"},
			{Code: "01002", TypeCode: "side_scheme", PackCode: "core"},
			{Code: "01003", TypeCode: "ally", PackCode: "core"},
			{Code: "01004", TypeCode: "ally", PackCode: "core"},
		},
		Curated: curated.Curated{Cards: map[string]curated.CardOverride{
			"01003": {Size: pack.SizeDoubleLand},
			"01004": {Size: pack.SizeDoubleStd},
		}},
	}

	faces := Sources(in)

	want := map[string]bool{"01001": false, "01002": true, "01003": true, "01004": false}
	for code, landscape := range want {
		if got := sourceOf(t, faces, code).Landscape; got != landscape {
			t.Errorf("face %s landscape = %v, want %v", code, got, landscape)
		}
	}
}

func TestSourcesRecordImage(t *testing.T) {
	tests := []struct {
		name  string
		entry marvelcdb.Card
		want  string
	}{
		{
			"marvelcdb record",
			marvelcdb.Card{Code: "01097", ImageSrc: "/bundles/cards/01097.png"},
			"https://marvelcdb.com/bundles/cards/01097.png",
		},
		{
			"mc4db record",
			marvelcdb.Card{Code: "60164", ImageSrc: "/bundles/cards/EN/fne/60164.webp", ImageHost: mc4db.BaseURL},
			"https://mc4db.merlindumesnil.net/bundles/cards/EN/fne/60164.webp",
		},
		{"no image", marvelcdb.Card{Code: "01098", ImageHost: mc4db.BaseURL}, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			faces := Sources(Inputs{MC: []marvelcdb.Card{tt.entry}})
			if got := sourceOf(t, faces, tt.entry.Code).Record; got != tt.want {
				t.Errorf("record image = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestSourcesIncludeFallbackRecords(t *testing.T) {
	faces := Sources(fallbackInputs(t))

	got := sourceOf(t, faces, "60164")
	if want := "https://mc4db.merlindumesnil.net/bundles/cards/EN/fear_no_evil_by_ffg/60164.webp"; got.Record != want {
		t.Errorf("record image = %q, want %q", got.Record, want)
	}
}
