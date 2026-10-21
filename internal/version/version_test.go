package version

import (
	"runtime/debug"
	"testing"
)

func TestResolve(t *testing.T) {
	revision := []debug.BuildSetting{{Key: "vcs.revision", Value: "abc123"}}
	modified := []debug.BuildSetting{
		{Key: "vcs.revision", Value: "abc123"},
		{Key: "vcs.modified", Value: "true"},
	}

	tests := []struct {
		name     string
		linked   string
		settings []debug.BuildSetting
		want     string
	}{
		{name: "linked value first", linked: "linked", settings: revision, want: "linked"},
		{name: "vcs revision without a linked value", settings: revision, want: "abc123"},
		{name: "modified checkout", settings: modified, want: "abc123-dirty"},
		{name: "linked value from a modified checkout", linked: "linked", settings: modified, want: "linked"},
		{name: "empty vcs revision", settings: []debug.BuildSetting{{Key: "vcs.revision"}}, want: "dev"},
		{name: "no build settings", want: "dev"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := resolve(tt.linked, tt.settings); got != tt.want {
				t.Errorf("resolve() = %q, want %q", got, tt.want)
			}
		})
	}
}
