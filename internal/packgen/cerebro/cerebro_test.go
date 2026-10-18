package cerebro

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"reflect"
	"testing"

	"github.com/alexandreroman/intothefray/internal/packgen/fetch"
)

func TestDecodeCerebroSet(t *testing.T) {
	data, err := os.ReadFile("testdata/set_rhino.json")
	if err != nil {
		t.Fatal(err)
	}
	var got Set
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatal(err)
	}

	want := Set{
		ID:         "ea7258fb-8521-4bb5-afda-cd207ed9782f",
		Name:       "Rhino",
		Type:       "Villain Set",
		PackID:     "25ab9c3e-d172-4501-87b6-40e3768cb267",
		Recommends: []string{"cefd4238-88b7-47d4-aff8-b955b86c7247"},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("set = %+v, want %+v", got, want)
	}
}

func TestDecodeNullFields(t *testing.T) {
	var set Set
	if err := json.Unmarshal([]byte(`{"Id":"s","Recommends":null}`), &set); err != nil {
		t.Fatal(err)
	}
	if len(set.Recommends) != 0 {
		t.Errorf("Recommends = %v, want empty", set.Recommends)
	}

	var card Card
	if err := json.Unmarshal([]byte(`{"Id":"c","GroupId":null,"Stage":null}`), &card); err != nil {
		t.Fatal(err)
	}
	if card.GroupID != nil || card.Stage != "" {
		t.Errorf("card = %+v, want nil GroupID and empty Stage", card)
	}
}

func TestFetchUsesEndpoints(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/cards":
			_, _ = w.Write([]byte(`[{"Id":"c1","Printings":[{"ArtificialId":"a","PackId":"p","SetId":"s"}]}]`))
		case "/sets":
			_, _ = w.Write([]byte(`[{"Id":"s1"}]`))
		case "/packs":
			_, _ = w.Write([]byte(`[{"Id":"p1","Name":"Core Set"}]`))
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)
	client := &fetch.Client{HTTP: server.Client(), CacheDir: t.TempDir()}
	ctx := context.Background()

	cards, err := fetchList[Card](ctx, client, server.URL, "cards")
	if err != nil {
		t.Fatal(err)
	}
	if len(cards) != 1 || cards[0].Printings[0].SetID != "s" {
		t.Errorf("cards = %+v", cards)
	}
	sets, err := fetchList[Set](ctx, client, server.URL, "sets")
	if err != nil || len(sets) != 1 || sets[0].ID != "s1" {
		t.Errorf("sets = %+v, err = %v", sets, err)
	}
	packs, err := fetchList[Pack](ctx, client, server.URL, "packs")
	if err != nil || len(packs) != 1 || packs[0].Name != "Core Set" {
		t.Errorf("packs = %+v, err = %v", packs, err)
	}
}
