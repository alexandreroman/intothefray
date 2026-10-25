package mc4db

import (
	"context"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	"github.com/alexandreroman/intothefray/internal/packgen/fetch"
	"github.com/alexandreroman/intothefray/internal/packgen/marvelcdb"
)

// serve answers requestURI with body and anything else with 404.
func serve(t *testing.T, requestURI, body string) (*fetch.Client, string) {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.RequestURI() != requestURI {
			http.NotFound(w, r)
			return
		}
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(server.Close)
	return &fetch.Client{HTTP: server.Client(), CacheDir: t.TempDir()}, server.URL
}

func TestFetchCards(t *testing.T) {
	client, base := serve(t, "/api/public/cards/?encounter=1", `[
		{"code":"26002","pack_code":"vision","name":"Intangible","double_sided":true,"pack_creator":null,
		 "imagesrc":"/bundles/cards/EN/vision/26002.webp","backimagesrc":"/bundles/cards/EN/vision/26002b.webp"},
		{"code":"01043b","pack_code":"core","imagesrc":null,"backimagesrc":null},
		{"code":"60159a","name":"Kingpin","pack_code":"fear_no_evil_by_ffg","pack_creator":"FFG",
		 "card_set_code":"kingpin_by_ffg","card_set_type_name_code":"villain","type_code":"villain",
		 "linked_to_code":"60159b","stage":"A1","quantity":1,"base_threat":null}
	]`)

	got, err := FetchCards(context.Background(), client, base)
	if err != nil {
		t.Fatal(err)
	}

	want := []Card{
		{
			Card: marvelcdb.Card{
				Code: "26002", Name: "Intangible", PackCode: "vision",
				ImageSrc: "/bundles/cards/EN/vision/26002.webp",
			},
			BackImageSrc: "/bundles/cards/EN/vision/26002b.webp",
		},
		{Card: marvelcdb.Card{Code: "01043b", PackCode: "core"}},
		{
			Card: marvelcdb.Card{
				Code: "60159a", Name: "Kingpin", TypeCode: "villain", PackCode: "fear_no_evil_by_ffg",
				SetCode: "kingpin_by_ffg", SetType: "villain", Stage: "A1", LinkedTo: "60159b", Quantity: 1,
			},
			PackCreator: "FFG",
		},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("cards = %+v, want %+v", got, want)
	}
}

func TestFetchPacks(t *testing.T) {
	client, base := serve(t, "/api/public/packs/", `[
		{"name":"Fear No Evil","code":"fear_no_evil_by_ffg","position":60,"creator":"FFG","known":212},
		{"name":"Mighty Thor","code":"mighty_thor_by_rainy","position":2021,"creator":"Rainy"}
	]`)

	got, err := FetchPacks(context.Background(), client, base)
	if err != nil {
		t.Fatal(err)
	}

	want := []marvelcdb.Pack{
		{Code: "fear_no_evil_by_ffg", Name: "Fear No Evil", Position: 60},
		{Code: "mighty_thor_by_rainy", Name: "Mighty Thor", Position: 2021},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("packs = %+v, want %+v", got, want)
	}
}

func TestFrenchImageURLs(t *testing.T) {
	if got, want := FrenchImageURL("/bundles/cards/EN/core/01004.webp"),
		"https://mc4db.merlindumesnil.net/bundles/cards/FR/core/01004.webp"; got != want {
		t.Errorf("FrenchImageURL = %q, want %q", got, want)
	}
	if got, want := DirectFrenchImageURL("core", "01097a"),
		"https://mc4db.merlindumesnil.net/bundles/cards/FR/core/01097a.webp"; got != want {
		t.Errorf("DirectFrenchImageURL = %q, want %q", got, want)
	}
}
