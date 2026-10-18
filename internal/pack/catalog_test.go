package pack

import (
	"errors"
	"os"
	"testing"
	"testing/fstest"
)

func loadTestCatalog(t *testing.T) *Catalog {
	t.Helper()
	catalog, err := Load(os.DirFS("testdata"), "en")
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	return catalog
}

func TestCatalogResolvesAliases(t *testing.T) {
	catalog := loadTestCatalog(t)

	tests := []struct {
		name     string
		code     string
		wantCode string
		wantFace int
	}{
		{"canonical code", "01001", "01001", 0},
		{"second face alias", "01001b", "01001", 1},
		{"reprint alias", "52022", "27049", 0},
		{"uppercase face alias", "01097A", "01097", 0},
		{"reprint face alias", "52097b", "01097", 1},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			card, face, err := catalog.Card(tt.code)
			if err != nil {
				t.Fatalf("Card(%q) error = %v", tt.code, err)
			}
			if card.Code != tt.wantCode || face != tt.wantFace {
				t.Errorf("Card(%q) = (%s, %d), want (%s, %d)", tt.code, card.Code, face, tt.wantCode, tt.wantFace)
			}
		})
	}
}

func TestCatalogUnknownCard(t *testing.T) {
	catalog := loadTestCatalog(t)

	_, _, err := catalog.Card("99999")
	if !errors.Is(err, ErrUnknownCard) {
		t.Errorf("Card(99999) error = %v, want ErrUnknownCard", err)
	}
}

func TestCatalogHeroByIdentity(t *testing.T) {
	catalog := loadTestCatalog(t)

	hero, ok := catalog.HeroByIdentity("01001a")
	if !ok {
		t.Fatal("HeroByIdentity(01001a) not found")
	}
	if hero.Obligation != "01165" {
		t.Errorf("Obligation = %q, want 01165", hero.Obligation)
	}

	if _, ok := catalog.HeroByIdentity("27049"); ok {
		t.Error("HeroByIdentity(27049) found a hero for a non-identity card")
	}
}

func TestCatalogSetAndIndex(t *testing.T) {
	catalog := loadTestCatalog(t)

	if set, ok := catalog.Set("RHINO"); !ok || set.Name != "Rhino" {
		t.Errorf("Set(RHINO) = (%+v, %t), want Rhino", set, ok)
	}
	if _, ok := catalog.Scenario("missing"); ok {
		t.Error("Scenario(missing) found")
	}
	if got := catalog.Index().Lang; got != "en" {
		t.Errorf("Index().Lang = %q, want en", got)
	}
}

func TestLoadErrors(t *testing.T) {
	const index = `{"version":1,"lang":"en","packs":[` +
		`{"code":"a","file":"a.json"},{"code":"b","file":"b.json"}]}`
	const cardA = `{"code":"a","cards":[{"code":"00001","faces":[{}]}]}`

	tests := []struct {
		name  string
		packA string
		packB string
	}{
		{"duplicate card across packs", cardA, cardA},
		{
			"duplicate alias",
			cardA,
			`{"code":"b","cards":[{"code":"00002","faces":[{}],"aliases":["00001"]}]}`,
		},
		{
			"alias face out of range",
			`{"code":"a","cards":[{"code":"00001","faces":[{}],"aliases":["00001b"]}]}`,
			`{"code":"b"}`,
		},
		{
			"duplicate set",
			`{"code":"a","sets":[{"code":"rhino"}]}`,
			`{"code":"b","sets":[{"code":"RHINO"}]}`,
		},
		{
			"duplicate hero",
			`{"code":"a","heroes":[{"identity":"00001"}]}`,
			`{"code":"b","heroes":[{"identity":"00001"}]}`,
		},
		{
			"duplicate scenario",
			`{"code":"a","scenarios":[{"id":"rhino"}]}`,
			`{"code":"b","scenarios":[{"id":"rhino"}]}`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fsys := fstest.MapFS{
				"en/index.json": {Data: []byte(index)},
				"en/a.json":     {Data: []byte(tt.packA)},
				"en/b.json":     {Data: []byte(tt.packB)},
			}
			if _, err := Load(fsys, "en"); err == nil {
				t.Error("Load() error = nil, want an error")
			}
		})
	}
}
