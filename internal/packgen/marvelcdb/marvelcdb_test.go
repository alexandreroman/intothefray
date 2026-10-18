package marvelcdb

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

func TestDecodeMarvelcdbCard(t *testing.T) {
	data, err := os.ReadFile("testdata/card_01097b.json")
	if err != nil {
		t.Fatal(err)
	}
	var got Card
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatal(err)
	}

	zero := 0
	want := Card{
		Code:            "01097b",
		Name:            "The Break-In!",
		TypeCode:        "main_scheme",
		FactionCode:     "encounter",
		PackCode:        "core",
		SetCode:         "rhino",
		SetName:         "Rhino",
		SetType:         "villain",
		Stage:           "1B",
		ImageSrc:        "/bundles/cards/01097b.png",
		Quantity:        1,
		BaseThreat:      &zero,
		BaseThreatFixed: true,
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("card = %+v, want %+v", got, want)
	}
}

func TestFetchUsesEndpoints(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.RequestURI() {
		case "/api/public/cards/?encounter=1":
			_, _ = w.Write([]byte(`[{"code":"01097b"}]`))
		case "/api/public/packs/":
			_, _ = w.Write([]byte(`[{"code":"core","name":"Core Set","position":1}]`))
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)
	client := &fetch.Client{HTTP: server.Client(), CacheDir: t.TempDir()}

	cards, err := fetchCards(context.Background(), client, server.URL)
	if err != nil {
		t.Fatal(err)
	}
	if len(cards) != 1 || cards[0].Code != "01097b" {
		t.Errorf("cards = %+v", cards)
	}

	packs, err := fetchPacks(context.Background(), client, server.URL)
	if err != nil {
		t.Fatal(err)
	}
	if want := []Pack{{Code: "core", Name: "Core Set", Position: 1}}; !reflect.DeepEqual(packs, want) {
		t.Errorf("packs = %+v, want %+v", packs, want)
	}
}
