package game

import (
	"encoding/json"
	"reflect"
	"testing"

	"github.com/alexandreroman/intothefray/internal/pack"
)

func sampleTable() *Table {
	return &Table{
		Cards: map[string]*Card{
			"c1": {
				ID: "c1", Code: "01001a", Face: 0, Faces: 2, Back: pack.BackPlayer, Owner: 0,
				Home: "deck:p0", Zone: ZoneTable, Area: PlayerArea(0), X: 280, Y: 0, Z: 3,
				Exhausted: true, Tokens: map[string]int{"dmg": 2}, Status: map[string]int{"stunned": 1},
			},
			"c2": {
				ID: "c2", Code: "01010", Faces: 1, Back: pack.BackPlayer, Owner: 0,
				Home: "deck:p0", Zone: ZoneHand,
			},
			"c3": {
				ID: "c3", Code: "01011", Faces: 1, FaceDown: true, Back: pack.BackPlayer, Owner: 0,
				Home: "deck:p0", Zone: ZonePile, Pile: "deck:p0",
			},
			"c4": {
				ID: "c4", Code: "01100", Faces: 1, Back: pack.BackEncounter, Owner: NoOwner,
				Home: "enc", Zone: ZoneStage, Parent: "c1", OnPile: "enc",
			},
		},
		Piles: map[string]*Pile{
			"deck:p0": {ID: "deck:p0", Kind: KindDeck, Owner: 0, Area: PlayerArea(0), Cards: []string{"c3"}},
			"enc":     {ID: "enc", Kind: KindEncounter, Owner: NoOwner, Area: AreaVillain, X: 0, Y: 0},
		},
		Hands:       map[Area][]string{PlayerArea(0): {"c2"}},
		Stages:      []*Stage{{Key: "main", Label: "Main scheme", Current: "c4", Cards: []string{"c4"}}},
		FirstPlayer: Point{Area: PlayerArea(0), X: 420, Y: 0},
		Arrows:      []Arrow{{From: "c1", To: "c4", Seat: 0}},
		Views: map[Area]*PrivateView{
			PlayerArea(0): {Pile: "deck:p0", Mode: "top", Cards: []string{"c3"}},
		},
		NextID: 5,
		NextZ:  4,
	}
}

func TestTableJSONRoundTrip(t *testing.T) {
	want := sampleTable()

	data, err := json.Marshal(want)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	got := &Table{}
	if err := json.Unmarshal(data, got); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if !reflect.DeepEqual(want, got) {
		t.Errorf("round trip mismatch:\nwant %s\ngot  %+v", data, got)
	}
}

func TestTableJSONKeys(t *testing.T) {
	data, err := json.Marshal(sampleTable())
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var generic map[string]any
	if err := json.Unmarshal(data, &generic); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	for _, key := range []string{"nextId", "nextZ", "firstPlayer", "stages", "arrows", "views"} {
		if _, ok := generic[key]; !ok {
			t.Errorf("missing top-level key %q", key)
		}
	}
	card := generic["cards"].(map[string]any)["c1"].(map[string]any)
	for _, key := range []string{"x", "y", "z", "faces"} {
		if _, ok := card[key]; !ok {
			t.Errorf("missing card key %q", key)
		}
	}
}

func TestCloneIsDeep(t *testing.T) {
	original := sampleTable()
	clone := original.Clone()

	if !reflect.DeepEqual(original, clone) {
		t.Fatal("clone differs from original")
	}

	clone.Cards["c1"].Tokens["dmg"] = 9
	clone.Cards["c1"].Status["tough"] = 1
	clone.Cards["c1"].X = 999
	clone.Piles["deck:p0"].Cards[0] = "zzz"
	clone.Hands[PlayerArea(0)][0] = "zzz"
	clone.Stages[0].Cards[0] = "zzz"
	clone.Stages[0].Current = "zzz"
	clone.Arrows[0].To = "zzz"
	clone.Views[PlayerArea(0)].Cards[0] = "zzz"
	clone.Views[PlayerArea(0)].Mode = "search"
	clone.NextID = 100

	if want := sampleTable(); !reflect.DeepEqual(want, original) {
		t.Errorf("original changed after mutating the clone:\nwant %+v\ngot  %+v", want, original)
	}
}

func TestPlayerArea(t *testing.T) {
	for seat, want := range []Area{"p0", "p1", "p2", "p3"} {
		if got := PlayerArea(seat); got != want {
			t.Errorf("PlayerArea(%d) = %q, want %q", seat, got, want)
		}
	}
}
