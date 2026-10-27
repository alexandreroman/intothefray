package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"testing"

	"github.com/alexandreroman/intothefray/internal/packgen/build"
	"github.com/alexandreroman/intothefray/internal/packgen/cdn"
	"github.com/alexandreroman/intothefray/internal/packgen/fetch"
	"github.com/alexandreroman/intothefray/internal/packgen/marvelcdb"
	"github.com/alexandreroman/intothefray/internal/packgen/report"
)

func TestPrintFallback(t *testing.T) {
	entries := []report.Fallback{
		{Pack: "fne", Code: "60065"},
		{Pack: "fne", Code: "60066"},
		{Pack: "thor", Code: "06099"},
	}

	var out strings.Builder
	printFallback(&out, entries)

	want := "from mc4db (fne): 2 records: 60065, 60066\nfrom mc4db (thor): 1 record: 06099\n"
	if got := out.String(); got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

// fixtureInputs is the smallest source data Build turns into a pack: one villain card.
func fixtureInputs() build.Inputs {
	return build.Inputs{
		MC: []marvelcdb.Card{{
			Code: "01094", Name: "Rhino", TypeCode: "villain", PackCode: "core",
			SetCode: "rhino", SetName: "Rhino", SetType: "villain",
			ImageSrc: "/bundles/cards/01094.png", Quantity: 1,
		}},
		MCPacks: []marvelcdb.Pack{{Code: "core", Name: "Core Set", Position: 1}},
	}
}

// fakeInputs returns in without any network access, and records whether it was called.
func fakeInputs(in build.Inputs, called *bool) inputsFunc {
	return func(context.Context, options) (build.Inputs, error) {
		*called = true
		return in, nil
	}
}

func testOptions(t *testing.T) options {
	t.Helper()
	dir := t.TempDir()
	return options{
		out:      filepath.Join(dir, "dist"),
		sources:  filepath.Join(dir, "images", "sources.json"),
		manifest: filepath.Join(dir, "images", "manifest.json"),
	}
}

func discardLogger() *slog.Logger {
	return slog.New(slog.DiscardHandler)
}

func writeManifest(t *testing.T, path string, manifest cdn.Manifest) {
	t.Helper()
	data, err := json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatal(err)
	}
}

func TestSourcesOnlyWritesNoDist(t *testing.T) {
	opts := testOptions(t)
	opts.sourcesOnly = true
	sentinel := filepath.Join(opts.out, "keep.json")
	if err := os.MkdirAll(opts.out, 0o750); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(sentinel, []byte("{}\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	var called bool
	if err := run(context.Background(), discardLogger(), io.Discard, opts, fakeInputs(fixtureInputs(), &called)); err != nil {
		t.Fatal(err)
	}

	data, err := os.ReadFile(opts.sources)
	if err != nil {
		t.Fatalf("sources.json not written: %v", err)
	}
	if !strings.Contains(string(data), `"code": "01094"`) {
		t.Errorf("sources.json lacks face 01094:\n%s", data)
	}
	entries, err := os.ReadDir(opts.out)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 || entries[0].Name() != "keep.json" {
		t.Errorf("out dir changed: %v", entries)
	}
}

func TestMissingManifestFails(t *testing.T) {
	opts := testOptions(t)

	var called bool
	err := run(context.Background(), discardLogger(), io.Discard, opts, fakeInputs(fixtureInputs(), &called))

	if !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("run error = %v, want one wrapping fs.ErrNotExist", err)
	}
	if !strings.Contains(err.Error(), "make publish") {
		t.Errorf("run error %q does not name make publish", err)
	}
	if called {
		t.Error("sources were fetched although the manifest is missing")
	}
	if _, statErr := os.Stat(opts.out); !errors.Is(statErr, fs.ErrNotExist) {
		t.Errorf("out dir exists after a failed run: %v", statErr)
	}
}

func TestRunWritesPacksFromManifest(t *testing.T) {
	opts := testOptions(t)
	manifest := cdn.Manifest{
		Version: 1,
		Base:    "https://img.intothefray.xyz/",
		Faces: map[string]map[string]cdn.ManifestImage{
			"01094": {"en": {Key: "cards/en/01094.0123456789ab.avif"}},
		},
	}
	writeManifest(t, opts.manifest, manifest)

	var called bool
	var stdout strings.Builder
	if err := run(context.Background(), discardLogger(), &stdout, opts, fakeInputs(fixtureInputs(), &called)); err != nil {
		t.Fatal(err)
	}

	data, err := os.ReadFile(filepath.Join(opts.out, "en", "core.json")) //nolint:gosec // test path
	if err != nil {
		t.Fatalf("pack not written: %v", err)
	}
	if !strings.Contains(string(data), "https://img.intothefray.xyz/cards/en/01094.0123456789ab.avif") {
		t.Errorf("pack lacks the CDN image URL:\n%s", data)
	}
	if !strings.Contains(stdout.String(), "manifest en: 1/1 faces\n") {
		t.Errorf("report lacks the manifest coverage:\n%s", stdout.String())
	}
}

func TestPrintManifestCoverage(t *testing.T) {
	manifest := cdn.Manifest{
		Version: 1,
		Base:    "https://img.intothefray.xyz/",
		Faces: map[string]map[string]cdn.ManifestImage{
			"01094": {"en": {Key: "cards/en/01094.0123456789ab.avif"}, "fr": {Key: "cards/fr/01094.0123456789ab.avif"}},
			"01095": {"en": {Key: "cards/en/01095.0123456789ab.avif"}},
		},
	}
	faces := []cdn.SourceFace{{Code: "01094"}, {Code: "01095"}, {Code: "01096"}}

	var out strings.Builder
	printManifestCoverage(&out, manifest, faces)

	want := "manifest en: 2/3 faces\nmanifest fr: 1/3 faces\n"
	if got := out.String(); got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

// fakeSourceTransport answers every request with an empty list of the source,
// and records the URLs it was asked for. The cgbuilder pages hold one pack,
// one card and one set, as a page without any fails.
type fakeSourceTransport struct {
	mu   sync.Mutex
	urls []string
}

func (ft *fakeSourceTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	ft.mu.Lock()
	ft.urls = append(ft.urls, req.URL.String())
	ft.mu.Unlock()

	body := "[]"
	switch {
	case req.URL.Path == "/api/public/sets":
		body = "{}"
	case req.URL.Host == "mc.cgbuilder.fr":
		body = `<a href="https://mc.cgbuilder.fr/liste_carte/1/"><img src="1.png" alt="Boîte de Base" /></a>` +
			`<div class="carte" onmouseover="afficherInfoBulle(this, 1, 1);" ` +
			`onclick="afficherPartageCarte(event, 'Spider-Man', 1, 1);"></div>` +
			`<a id="a_101" href="https://mc.cgbuilder.fr/set_modulaire/101/">Les Bombes</a>`
	}
	return &http.Response{
		StatusCode: http.StatusOK,
		Status:     "200 OK",
		Header:     make(http.Header),
		Body:       io.NopCloser(strings.NewReader(body)),
		Request:    req,
	}, nil
}

func TestFetchInputsFrenchOnlyForPacks(t *testing.T) {
	frenchURLs := []string{
		"https://fr.marvelcdb.com/api/public/cards/?encounter=1",
		"https://fr.marvelcdb.com/api/public/packs/",
		"https://mc4db.merlindumesnil.net/api/public/cards/?encounter=1&locale=fr",
		"https://mc4db.merlindumesnil.net/api/public/packs/?locale=fr",
		"https://mc4db.merlindumesnil.net/api/public/sets?locale=fr",
		"https://mc.cgbuilder.fr/cycle/",
		"https://mc.cgbuilder.fr/liste_carte/1/",
		"https://mc.cgbuilder.fr/set_modulaire/",
	}
	tests := []struct {
		name        string
		sourcesOnly bool
		wantFrench  bool
	}{
		{"packs", false, true},
		{"sources only", true, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			transport := &fakeSourceTransport{}
			client := &fetch.Client{HTTP: &http.Client{Transport: transport}, CacheDir: t.TempDir()}
			opts := options{curatedDir: t.TempDir(), sourcesOnly: tt.sourcesOnly}

			in, err := fetchInputsWith(context.Background(), client, opts)
			if err != nil {
				t.Fatal(err)
			}

			for _, url := range frenchURLs {
				if fetched := slices.Contains(transport.urls, url); fetched != tt.wantFrench {
					t.Errorf("fetched %s = %v, want %v", url, fetched, tt.wantFrench)
				}
			}
			if gotFrench := len(in.CGBuilder.Packs) > 0; gotFrench != tt.wantFrench {
				t.Errorf("cgbuilder packs = %+v, want some: %v", in.CGBuilder.Packs, tt.wantFrench)
			}
		})
	}
}
