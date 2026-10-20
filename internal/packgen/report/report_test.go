package report

import "testing"

func TestCoverageString(t *testing.T) {
	tests := []struct {
		name     string
		coverage Coverage
		want     string
	}{
		{"empty", Coverage{Lang: "fr"}, "fr: names 0/0 faces translated, images 0/0 faces"},
		{
			"small",
			Coverage{Lang: "fr", Faces: 999, Names: 12, Images: 3},
			"fr: names 12/999 faces translated, images 3/999 faces",
		},
		{
			"thousands",
			Coverage{Lang: "fr", Faces: 4027, Names: 2437, Images: 4017},
			"fr: names 2,437/4,027 faces translated, images 4,017/4,027 faces",
		},
		{
			"millions",
			Coverage{Lang: "fr", Faces: 1234567, Names: 100000},
			"fr: names 100,000/1,234,567 faces translated, images 0/1,234,567 faces",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			if got := tt.coverage.String(); got != tt.want {
				t.Errorf("String() = %q, want %q", got, tt.want)
			}
		})
	}
}
