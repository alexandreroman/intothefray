package pack

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

func TestPackFileRoundTrip(t *testing.T) {
	want := PackFile{
		Code:     "core",
		Name:     "Core Set",
		Position: 1,
		Cards: []Card{{
			Code: "01097",
			Faces: []Face{
				{
					Name:           "Rhino",
					Type:           "main_scheme",
					Stage:          "1A",
					Size:           SizeLand,
					Images:         []string{"https://marvelcdb.com/bundles/cards/01097.png"},
					StartingThreat: &Threat{Value: 0, PerPlayer: false},
				},
				{
					Name:   "Rhino",
					Type:   "main_scheme",
					Stage:  "1B",
					Size:   SizeLand,
					Images: []string{"https://marvelcdb.com/bundles/cards/01097b.png"},
				},
			},
			Set:      "rhino",
			Back:     BackEncounter,
			Quantity: 1,
			Aliases:  []string{"01097a", "01097b"},
		}},
		Sets: []Set{
			{Code: "rhino", Name: "Rhino", Kind: "villain", Cards: []string{"01097"}},
			{
				Code: "standard_ii", Name: "Standard II", Kind: "standard", Cards: []string{"24049"},
				InPlay: map[Difficulty][]FaceRef{Standard: {{Card: "24049", Face: 0}}, Expert: {{Card: "24049", Face: 1}}},
			},
			{Code: "standard_pvp", Name: "Standard PVP", Kind: "standard", Cards: []string{}, Unlisted: true},
		},
	}

	data, err := json.Marshal(want)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	fragments := []string{
		`"startingThreat":{"value":0,"perPlayer":false}`,
		`"size":"land"`,
		// A set without curated setup data keeps its original shape.
		`{"code":"rhino","name":"Rhino","kind":"villain","cards":["01097"]}`,
	}
	for _, fragment := range fragments {
		if !strings.Contains(string(data), fragment) {
			t.Errorf("JSON %s does not contain %s", data, fragment)
		}
	}

	var got PackFile
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if !reflect.DeepEqual(want, got) {
		t.Errorf("round trip mismatch:\nwant %+v\ngot  %+v", want, got)
	}
}
