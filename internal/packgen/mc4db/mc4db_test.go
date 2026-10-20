package mc4db

import (
	"context"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	"github.com/alexandreroman/intothefray/internal/packgen/fetch"
)

func TestFetchCards(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.RequestURI() != "/api/public/cards/?encounter=1" {
			http.NotFound(w, r)
			return
		}
		_, _ = w.Write([]byte(`[
			{"code":"26002","pack_code":"vision","name":"Intangible","double_sided":true,
			 "imagesrc":"/bundles/cards/EN/vision/26002.webp","backimagesrc":"/bundles/cards/EN/vision/26002b.webp"},
			{"code":"01043b","pack_code":"core","imagesrc":null,"backimagesrc":null}
		]`))
	}))
	t.Cleanup(server.Close)
	client := &fetch.Client{HTTP: server.Client(), CacheDir: t.TempDir()}

	got, err := fetchCards(context.Background(), client, server.URL)
	if err != nil {
		t.Fatal(err)
	}

	want := []Card{
		{
			Code:     "26002",
			ImageSrc: "/bundles/cards/EN/vision/26002.webp", BackImageSrc: "/bundles/cards/EN/vision/26002b.webp",
		},
		{Code: "01043b"},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("cards = %+v, want %+v", got, want)
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
