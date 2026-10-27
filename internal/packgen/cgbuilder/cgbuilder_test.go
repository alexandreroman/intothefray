package cgbuilder

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/alexandreroman/intothefray/internal/packgen/fetch"
)

func readPage(t *testing.T, name string) []byte {
	t.Helper()
	page, err := os.ReadFile(filepath.Join("testdata", name)) //nolint:gosec // test fixture
	if err != nil {
		t.Fatal(err)
	}
	return page
}

func TestParsePacks(t *testing.T) {
	got, err := ParsePacks(readPage(t, "cycle.html"))
	if err != nil {
		t.Fatal(err)
	}

	want := []Pack{{ID: 1, Name: "Boîte de Base"}, {ID: 53, Name: "Le Soldat de l'Hiver"}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("packs = %+v, want %+v", got, want)
	}
}

func TestParseCards(t *testing.T) {
	got, err := ParseCards(readPage(t, "liste_carte.html"))
	if err != nil {
		t.Fatal(err)
	}

	// The alternate printing 11184 is left out.
	want := []Card{
		{Pack: 50, Number: 1, Names: []string{"Maria Hill"}},
		{Pack: 50, Number: 73, Names: []string{"Soudard de l'A.I.M."}, Set: 263},
		{Pack: 50, Number: 2, Names: []string{"Tigra", "Greer Nelson"}},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("cards = %+v, want %+v", got, want)
	}
}

func TestParseSets(t *testing.T) {
	got, err := ParseSets(readPage(t, "set_modulaire.html"))
	if err != nil {
		t.Fatal(err)
	}

	want := []Set{{ID: 264, Name: "Enlèvements de l'A.I.M."}, {ID: 1103, Name: "Tueurs de Capes"}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("sets = %+v, want %+v", got, want)
	}
}

func TestParseEmptyPagesFail(t *testing.T) {
	page := []byte("<html><body>Maintenance</body></html>")
	if _, err := ParsePacks(page); err == nil {
		t.Error("ParsePacks succeeded on a page without pack")
	}
	if _, err := ParseCards(page); err == nil {
		t.Error("ParseCards succeeded on a page without card")
	}
	if _, err := ParseSets(page); err == nil {
		t.Error("ParseSets succeeded on a page without set")
	}
}

func TestUnescapeName(t *testing.T) {
	tests := []struct {
		quoted string
		want   string
	}{
		{`Soldat de l\'A.I.M.`, "Soldat de l'A.I.M."},
		{`Le Soldat de l&#039;Hiver`, "Le Soldat de l'Hiver"},
		{`Back\\slash`, `Back\slash`},
		{`Rhino`, "Rhino"},
	}
	for _, tt := range tests {
		if got := unescapeName(tt.quoted); got != tt.want {
			t.Errorf("unescapeName(%q) = %q, want %q", tt.quoted, got, tt.want)
		}
	}
}

func TestFetch(t *testing.T) {
	pages := map[string]string{
		"/cycle/":         "cycle.html",
		"/liste_carte/1/": "liste_carte.html",
		// The same card list stands for both packs: only the requests matter.
		"/liste_carte/53/": "liste_carte.html",
		"/set_modulaire/":  "set_modulaire.html",
	}
	var requested []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requested = append(requested, r.URL.Path)
		name, found := pages[r.URL.Path]
		if !found {
			http.NotFound(w, r)
			return
		}
		_, _ = w.Write(readPage(t, name))
	}))
	t.Cleanup(server.Close)
	client := &fetch.Client{HTTP: server.Client(), CacheDir: t.TempDir()}

	site, err := Fetch(context.Background(), client, server.URL)
	if err != nil {
		t.Fatal(err)
	}

	wantRequests := []string{"/cycle/", "/liste_carte/1/", "/liste_carte/53/", "/set_modulaire/"}
	if !reflect.DeepEqual(requested, wantRequests) {
		t.Errorf("requests = %v, want %v", requested, wantRequests)
	}
	if len(site.Packs) != 2 || len(site.Cards) != 6 || len(site.Sets) != 2 {
		t.Errorf("site = %d packs, %d cards, %d sets, want 2, 6, 2", len(site.Packs), len(site.Cards), len(site.Sets))
	}
}

func TestFetchFailsOnMissingPack(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/cycle/" {
			http.NotFound(w, r)
			return
		}
		_, _ = w.Write(readPage(t, "cycle.html"))
	}))
	t.Cleanup(server.Close)
	client := &fetch.Client{HTTP: server.Client(), CacheDir: t.TempDir()}

	_, err := Fetch(context.Background(), client, server.URL)
	if err == nil || !strings.Contains(err.Error(), "pack 1") {
		t.Fatalf("error = %v, want one naming pack 1", err)
	}
}
