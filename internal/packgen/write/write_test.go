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

func writeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
}

func TestDistWritesIntoOutDir(t *testing.T) {
	outDir := t.TempDir()

	if err := Dist(outDir, sampleResult()); err != nil {
		t.Fatal(err)
	}

	if got, want := fileNames(t, outDir), []string{"core.json", "index.json"}; !slices.Equal(got, want) {
		t.Errorf("got files %v, want %v (no leftovers)", got, want)
	}
	data, err := os.ReadFile(filepath.Join(outDir, "index.json")) //nolint:gosec // test path
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
	if len(index.Packs) != 1 || index.Packs[0].File != "core.json" {
		t.Errorf("got index packs %v, want core.json only", index.Packs)
	}
}

func TestDistRemovesStalePacksOnly(t *testing.T) {
	outDir := t.TempDir()
	writeFile(t, filepath.Join(outDir, "index.json"),
		`{"version":1,"packs":[{"code":"core","file":"core.json"},{"code":"old","file":"old.json"}]}`)
	writeFile(t, filepath.Join(outDir, "core.json"), "{}")
	writeFile(t, filepath.Join(outDir, "old.json"), "{}")
	writeFile(t, filepath.Join(outDir, "other.json"), "{}")
	writeFile(t, filepath.Join(outDir, "keep.txt"), "keep")

	if err := Dist(outDir, sampleResult()); err != nil {
		t.Fatal(err)
	}

	want := []string{"core.json", "index.json", "keep.txt", "other.json"}
	if got := fileNames(t, outDir); !slices.Equal(got, want) {
		t.Errorf("got files %v, want %v", got, want)
	}
}

func TestDistKeepsOldOutputOnFailure(t *testing.T) {
	if os.Geteuid() == 0 {
		t.Skip("permissions are not enforced for root")
	}
	outDir := t.TempDir()
	const oldIndex = `{"version":1,"packs":[{"code":"old","file":"old.json"}]}`
	writeFile(t, filepath.Join(outDir, "index.json"), oldIndex)
	writeFile(t, filepath.Join(outDir, "old.json"), "{}")
	if err := os.Chmod(outDir, 0o500); err != nil { //nolint:gosec // simulates a read-only output directory
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(outDir, 0o700) }) //nolint:gosec // lets TempDir clean up

	if err := Dist(outDir, sampleResult()); err == nil {
		t.Fatal("expected an error")
	}

	if got, want := fileNames(t, outDir), []string{"index.json", "old.json"}; !slices.Equal(got, want) {
		t.Errorf("got files %v, want %v", got, want)
	}
	data, err := os.ReadFile(filepath.Join(outDir, "index.json")) //nolint:gosec // test path
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != oldIndex {
		t.Errorf("index changed after a failed run:\n%s", data)
	}
}
