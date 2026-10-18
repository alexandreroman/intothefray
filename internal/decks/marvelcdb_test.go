package decks

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/alexandreroman/intothefray/internal/game"
	"github.com/alexandreroman/intothefray/internal/pack"
	"github.com/alexandreroman/intothefray/packs"
)

func TestParseLinks(t *testing.T) {
	tests := []struct {
		link     string
		wantPath string
		wantErr  bool
	}{
		{"https://marvelcdb.com/decklist/view/1", "/api/public/decklist/1", false},
		{"https://marvelcdb.com/decklist/view/1/black-panther", "/api/public/decklist/1", false},
		{"http://www.marvelcdb.com/decklist/12", "/api/public/decklist/12", false},
		{"https://www.marvelcdb.com/deck/view/345", "/api/public/deck/345", false},
		{"https://marvelcdb.com/deck/345", "/api/public/deck/345", false},
		{"https://marvelcdb.com/decklist/view/1?x=y#top", "/api/public/decklist/1", false},
		{"https://example.com/decklist/view/1", "", true},
		{"https://marvelcdb.com.evil.test/decklist/view/1", "", true},
		{"ftp://marvelcdb.com/decklist/view/1", "", true},
		{"https://marvelcdb.com/decklist/view/abc", "", true},
		{"https://marvelcdb.com/decklist/view", "", true},
		{"https://marvelcdb.com/card/01001", "", true},
		{"https://marvelcdb.com/", "", true},
		{"not a url", "", true},
		{"", "", true},
	}
	for _, tt := range tests {
		t.Run(tt.link, func(t *testing.T) {
			t.Parallel()
			got, err := apiPath(tt.link)
			if tt.wantErr {
				if !errors.Is(err, ErrLink) {
					t.Fatalf("err = %v, want ErrLink", err)
				}
				return
			}
			if err != nil || got != tt.wantPath {
				t.Fatalf("apiPath = %q, %v; want %q", got, err, tt.wantPath)
			}
		})
	}
}

func readFixture(t *testing.T, name string) []byte {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("testdata", name)) //nolint:gosec // fixed fixture names
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func loadCatalog(t *testing.T) *pack.Catalog {
	t.Helper()
	cat, err := packs.Catalog()
	if err != nil {
		t.Fatal(err)
	}
	return cat
}

// newImporter serves handler as marvelcdb and returns an importer pointed at it.
func newImporter(t *testing.T, handler http.Handler) *Importer {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	return &Importer{BaseURL: srv.URL}
}

func serveJSON(w http.ResponseWriter, body []byte) {
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(body)
}

const deckLink = "https://marvelcdb.com/decklist/view/1/black-panther"

func TestImportDeckOK(t *testing.T) {
	deck := readFixture(t, "decklist-1.json")
	im := newImporter(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/public/decklist/1" {
			http.NotFound(w, r)
			return
		}
		serveJSON(w, deck)
	}))

	got, err := im.Import(context.Background(), deckLink, loadCatalog(t))
	if err != nil {
		t.Fatal(err)
	}
	if got.URL != deckLink || got.Hero != "01040a" || got.HeroName != "Black Panther" ||
		got.Name != "Black Panther - Protection - Starter Deck" {
		t.Errorf("unexpected header: %+v", got)
	}
	if !reflect.DeepEqual(got.Cards[len(got.Cards)-1], game.DeckEntry{Code: "01093", Qty: 1}) {
		t.Errorf("cards are not sorted by code, last = %+v", got.Cards[len(got.Cards)-1])
	}
	for i := 1; i < len(got.Cards); i++ {
		if got.Cards[i-1].Code >= got.Cards[i].Code {
			t.Fatalf("cards not sorted: %s before %s", got.Cards[i-1].Code, got.Cards[i].Code)
		}
	}
	if !contains(got.Cards, game.DeckEntry{Code: "01043d", Qty: 2}) {
		t.Errorf("01043d x2 missing from %v", got.Cards)
	}
}

func contains(cards []game.DeckEntry, want game.DeckEntry) bool {
	for _, card := range cards {
		if card == want {
			return true
		}
	}
	return false
}

func TestImportDeckUnsupported(t *testing.T) {
	var deck map[string]any
	if err := json.Unmarshal(readFixture(t, "decklist-1.json"), &deck); err != nil {
		t.Fatal(err)
	}
	deck["slots"].(map[string]any)["99999"] = 3
	body, err := json.Marshal(deck)
	if err != nil {
		t.Fatal(err)
	}

	im := newImporter(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/public/decklist/1":
			serveJSON(w, body)
		case "/api/public/card/99999":
			serveJSON(w, []byte(`{"name":"Mystery Card","pack_name":"Future Pack"}`))
		default:
			http.NotFound(w, r)
		}
	}))

	_, err = im.Import(context.Background(), deckLink, loadCatalog(t))
	var unsupported *UnsupportedError
	if !errors.As(err, &unsupported) {
		t.Fatalf("err = %v, want *UnsupportedError", err)
	}
	want := []Unsupported{{Code: "99999", Name: "Mystery Card", Pack: "Future Pack", Qty: 3}}
	if !reflect.DeepEqual(unsupported.Cards, want) {
		t.Errorf("Cards = %+v, want %+v", unsupported.Cards, want)
	}
	if unsupported.Error() != "1 cards aren't supported" {
		t.Errorf("Error() = %q", unsupported.Error())
	}
}

func TestImportDeckUnsupportedCardLookupFails(t *testing.T) {
	body := []byte(`{"name":"D","hero_code":"01040a","hero_name":"Black Panther","slots":{"99999":1}}`)
	im := newImporter(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/public/card/") {
			http.Error(w, "boom", http.StatusInternalServerError)
			return
		}
		serveJSON(w, body)
	}))

	_, err := im.Import(context.Background(), deckLink, loadCatalog(t))
	var unsupported *UnsupportedError
	if !errors.As(err, &unsupported) {
		t.Fatalf("err = %v, want *UnsupportedError", err)
	}
	want := []Unsupported{{Code: "99999", Qty: 1}}
	if !reflect.DeepEqual(unsupported.Cards, want) {
		t.Errorf("Cards = %+v, want %+v", unsupported.Cards, want)
	}
}

func TestImportDeckNotFound(t *testing.T) {
	tests := []struct {
		name    string
		handler http.HandlerFunc
	}{
		{"404", func(w http.ResponseWriter, r *http.Request) { http.NotFound(w, r) }},
		{"empty body", func(http.ResponseWriter, *http.Request) {}},
		{"no hero", func(w http.ResponseWriter, _ *http.Request) { serveJSON(w, []byte(`{"name":"x"}`)) }},
		{"no slots", func(w http.ResponseWriter, _ *http.Request) {
			serveJSON(w, []byte(`{"name":"x","hero_code":"01040a"}`))
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			im := newImporter(t, tt.handler)
			_, err := im.Import(context.Background(), deckLink, loadCatalog(t))
			if err == nil || !strings.Contains(err.Error(), "not public") {
				t.Fatalf("err = %v, want a 'not public' error", err)
			}
		})
	}
}

func TestImportBadLink(t *testing.T) {
	im := &Importer{BaseURL: "http://127.0.0.1:0"}
	_, err := im.Import(context.Background(), "https://example.com/x", loadCatalog(t))
	if !errors.Is(err, ErrLink) {
		t.Fatalf("err = %v, want ErrLink", err)
	}
}
