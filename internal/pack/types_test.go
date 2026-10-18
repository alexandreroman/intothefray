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
		Sets: []Set{{Code: "rhino", Name: "Rhino", Kind: "villain", Cards: []string{"01097"}}},
	}

	data, err := json.Marshal(want)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	for _, fragment := range []string{`"startingThreat":{"value":0,"perPlayer":false}`, `"size":"land"`} {
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
