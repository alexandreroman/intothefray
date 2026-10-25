package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/alexandreroman/intothefray/internal/packgen/build"
	"github.com/alexandreroman/intothefray/internal/packgen/cdn"
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
			"01094": {"en": {Key: "en/01094.0123456789ab.avif", From: "cerebro"}},
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
	if !strings.Contains(string(data), "https://img.intothefray.xyz/en/01094.0123456789ab.avif") {
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
			"01094": {"en": {Key: "en/01094.0123456789ab.avif"}, "fr": {Key: "fr/01094.0123456789ab.avif"}},
			"01095": {"en": {Key: "en/01095.0123456789ab.avif"}},
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
