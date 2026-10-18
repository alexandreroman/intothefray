package write

import (
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/alexandreroman/intothefray/internal/pack"
	"github.com/alexandreroman/intothefray/internal/packgen/build"
)

func sampleResult() build.Result {
	return build.Result{
		Packs: []pack.PackFile{{Code: "core", Name: "Core Set", Position: 1, Cards: []pack.Card{}, Sets: []pack.Set{}}},
		Index: pack.Index{
			Version: 1,
			Packs:   []pack.PackRef{{Code: "core", Name: "Core Set", File: "core.json", Position: 1}},
		},
	}
}

func fileNames(t *testing.T, dir string) []string {
	t.Helper()
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	var names []string
	for _, entry := range entries {
		names = append(names, entry.Name())
	}
	return names
}

func TestWriteIsAtomic(t *testing.T) {
	outDir := t.TempDir()
	langDir := filepath.Join(outDir, "en")
	if err := os.Mkdir(langDir, 0o750); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(langDir, "old.json"), []byte("{}"), 0o600); err != nil {
		t.Fatal(err)
	}

	if err := Dist(outDir, "en", sampleResult()); err != nil {
		t.Fatal(err)
	}

	if got, want := fileNames(t, langDir), []string{"core.json", "index.json"}; !slices.Equal(got, want) {
		t.Errorf("got files %v, want %v", got, want)
	}
	if got, want := fileNames(t, outDir), []string{"en"}; !slices.Equal(got, want) {
		t.Errorf("got output entries %v, want %v (no leftovers)", got, want)
	}

	data, err := os.ReadFile(filepath.Join(langDir, "index.json")) //nolint:gosec // test path
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasSuffix(string(data), "}\n") || !strings.Contains(string(data), "\n  \"version\": 1") {
		t.Errorf("index is not 2-space indented with a trailing newline:\n%s", data)
	}
	var index pack.Index
	if err := json.Unmarshal(data, &index); err != nil {
		t.Fatal(err)
	}
	if index.Lang != "en" {
		t.Errorf("got lang %q, want en", index.Lang)
	}
}

func TestWriteKeepsOldOutputOnFailure(t *testing.T) {
	if os.Geteuid() == 0 {
		t.Skip("permissions are not enforced for root")
	}
	outDir := t.TempDir()
	langDir := filepath.Join(outDir, "en")
	if err := os.Mkdir(langDir, 0o750); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(langDir, "old.json"), []byte("{}"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(outDir, 0o500); err != nil { //nolint:gosec // simulates a read-only parent
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(outDir, 0o700) }) //nolint:gosec // lets TempDir clean up

	if err := Dist(outDir, "en", sampleResult()); err == nil {
		t.Fatal("expected an error")
	}

	if got, want := fileNames(t, langDir), []string{"old.json"}; !slices.Equal(got, want) {
		t.Errorf("got files %v, want %v", got, want)
	}
}
