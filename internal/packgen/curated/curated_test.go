package curated

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/alexandreroman/intothefray/internal/pack"
)

func TestLoad(t *testing.T) {
	loaded, err := Load("testdata")
	if err != nil {
		t.Fatal(err)
	}

	if len(loaded.Scenarios) != 1 {
		t.Fatalf("got %d scenarios, want 1", len(loaded.Scenarios))
	}
	def := loaded.Scenarios[0]
	if def.ID != "rhino" || def.VillainSet != "rhino" {
		t.Errorf("got def %q on set %q, want rhino on rhino", def.ID, def.VillainSet)
	}
	if got := def.Start[pack.Expert].InPlay; len(got) != 1 || got[0].Card != "01108" {
		t.Errorf("got expert in-play %v, want 01108", got)
	}
	if got := def.SetAside; len(got) != 1 || got[0] != "01097" {
		t.Errorf("got set-aside %v, want [01097]", got)
	}
	if got := loaded.Cards["01097a"].Size; got != pack.SizeLand {
		t.Errorf("got override size %q, want %q", got, pack.SizeLand)
	}
}

func TestLoadWithoutCardsFile(t *testing.T) {
	dir := t.TempDir()
	if err := os.Mkdir(filepath.Join(dir, "scenarios"), 0o750); err != nil {
		t.Fatal(err)
	}

	loaded, err := Load(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(loaded.Scenarios) != 0 || len(loaded.Cards) != 0 {
		t.Errorf("got %+v, want nothing", loaded)
	}
}

func TestLoadRejectsUnknownField(t *testing.T) {
	dir := t.TempDir()
	scenarios := filepath.Join(dir, "scenarios")
	if err := os.Mkdir(scenarios, 0o750); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(scenarios, "bad.json"), []byte(`{"id":"x","villianSet":"x"}`), 0o600); err != nil {
		t.Fatal(err)
	}

	_, err := Load(dir)
	if err == nil || !strings.Contains(err.Error(), "bad.json") {
		t.Fatalf("got error %v, want one naming bad.json", err)
	}
}
