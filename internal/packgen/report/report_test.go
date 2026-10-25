package report

import "testing"

func TestCoverageString(t *testing.T) {
	tests := []struct {
		name     string
		coverage Coverage
		want     string
	}{
		{"empty", Coverage{Lang: "fr"}, "fr: names 0/0 faces translated"},
		{"small", Coverage{Lang: "fr", Faces: 999, Names: 12}, "fr: names 12/999 faces translated"},
		{"thousands", Coverage{Lang: "fr", Faces: 4027, Names: 2437}, "fr: names 2,437/4,027 faces translated"},
		{
			"millions",
			Coverage{Lang: "fr", Faces: 1234567, Names: 100000},
			"fr: names 100,000/1,234,567 faces translated",
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
