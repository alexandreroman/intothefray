package cdn

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestOctgnStem(t *testing.T) {
	const id = "b768a53b-cb8c-47c5-9b65-f20ed2d89837"
	tests := []struct {
		name     string
		octgnID  string
		faceCode string
		want     string
	}{
		{"no suffix", id, "01004", id},
		{"suffix a", id, "12001a", id},
		{"suffix b", id, "12001b", id + ".b"},
		{"suffix c", id, "12001c", id + ".c"},
		{"no octgn id", "", "01004", ""},
		{"no octgn id on a back face", "", "12001b", ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := OctgnStem(tt.octgnID, tt.faceCode); got != tt.want {
				t.Errorf("OctgnStem(%q, %q) = %q, want %q", tt.octgnID, tt.faceCode, got, tt.want)
			}
		})
	}
}

func writeFile(t *testing.T, content string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "manifest.json")
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestLoadManifestMissing(t *testing.T) {
	_, err := LoadManifest(filepath.Join(t.TempDir(), "manifest.json"))
	if !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("LoadManifest error = %v, want one wrapping fs.ErrNotExist", err)
	}
}

func TestLoadManifestVersion(t *testing.T) {
	path := writeFile(t, `{"version": 2, "base": "https://img.intothefray.xyz/", "faces": {}}`)
	_, err := LoadManifest(path)
	if err == nil || !strings.Contains(err.Error(), "unsupported manifest version 2") {
		t.Fatalf("LoadManifest error = %v, want unsupported manifest version 2", err)
	}
}

func TestLoadManifestMissingBase(t *testing.T) {
	path := writeFile(t, `{"version": 1, "faces": {}}`)
	if _, err := LoadManifest(path); err == nil {
		t.Fatal("LoadManifest accepted a manifest without a base URL")
	}
}

func TestLoadManifestInvalidJSON(t *testing.T) {
	path := writeFile(t, `{"version": 1,`)
	if _, err := LoadManifest(path); err == nil {
		t.Fatal("LoadManifest accepted truncated JSON")
	}
}

func TestManifestImage(t *testing.T) {
	path := writeFile(t, `{
  "version": 1,
  "base": "https://img.intothefray.xyz/",
  "faces": {
    "12001a": {
      "en": {"key": "en/12001a.3f9ac2e1b0d4.avif", "from": "cerebro"},
      "fr": {"key": "fr/12001a.9b1d07c4e2aa.avif", "from": "octgn"}
    },
    "62001a": {
      "en": {"key": "en/62001a.0123456789ab.avif", "from": "cerebro"}
    }
  },
  "assets": {"back-player": "assets/back-player.avif"}
}`)
	m, err := LoadManifest(path)
	if err != nil {
		t.Fatal(err)
	}

	tests := []struct {
		faceCode string
		lang     string
		wantURL  string
		wantOK   bool
	}{
		{"12001a", "fr", "https://img.intothefray.xyz/fr/12001a.9b1d07c4e2aa.avif", true},
		{"12001a", "en", "https://img.intothefray.xyz/en/12001a.3f9ac2e1b0d4.avif", true},
		{"62001a", "fr", "", false},
		{"99999a", "en", "", false},
	}
	for _, tt := range tests {
		gotURL, gotOK := m.Image(tt.faceCode, tt.lang)
		if gotURL != tt.wantURL || gotOK != tt.wantOK {
			t.Errorf("Image(%q, %q) = (%q, %v), want (%q, %v)",
				tt.faceCode, tt.lang, gotURL, gotOK, tt.wantURL, tt.wantOK)
		}
	}
}

func TestWriteSourcesSorted(t *testing.T) {
	path := filepath.Join(t.TempDir(), "images", "sources.json")
	faces := []SourceFace{
		{Code: "12001b", Cerebro: "https://example.test/12001B.jpg", Octgn: "b768.b"},
		{Code: "01004", Landscape: true, Record: "https://marvelcdb.com/bundles/cards/01004.png?a=1&b=2"},
		{Code: "12001a", Cerebro: "https://example.test/12001A.jpg", Octgn: "b768"},
	}

	if err := WriteSources(path, faces); err != nil {
		t.Fatal(err)
	}

	data, err := os.ReadFile(path) //nolint:gosec // test path
	if err != nil {
		t.Fatal(err)
	}
	want := `{
  "version": 1,
  "faces": [
    {
      "code": "01004",
      "landscape": true,
      "record": "https://marvelcdb.com/bundles/cards/01004.png?a=1&b=2"
    },
    {
      "code": "12001a",
      "landscape": false,
      "cerebro": "https://example.test/12001A.jpg",
      "octgn": "b768"
    },
    {
      "code": "12001b",
      "landscape": false,
      "cerebro": "https://example.test/12001B.jpg",
      "octgn": "b768.b"
    }
  ]
}
`
	if string(data) != want {
		t.Errorf("sources.json =\n%s\nwant\n%s", data, want)
	}
	if faces[0].Code != "12001b" {
		t.Errorf("WriteSources reordered the caller's slice: first face is %q", faces[0].Code)
	}
}

func TestWriteSourcesEmpty(t *testing.T) {
	path := filepath.Join(t.TempDir(), "sources.json")
	if err := WriteSources(path, nil); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path) //nolint:gosec // test path
	if err != nil {
		t.Fatal(err)
	}
	want := "{\n  \"version\": 1,\n  \"faces\": []\n}\n"
	if string(data) != want {
		t.Errorf("sources.json = %q, want %q", data, want)
	}
}
