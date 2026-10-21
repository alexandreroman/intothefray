// Package version reports the commit the binary was built from.
package version

import "runtime/debug"

// commit is set at link time by the container build:
// -ldflags "-X github.com/alexandreroman/intothefray/internal/version.commit=<sha>".
var commit string

// Commit returns the commit the binary was built from: the one set at link
// time, else the VCS revision Go stamps into a build from a checkout (with
// "-dirty" when the checkout had changes), else "dev".
func Commit() string {
	var settings []debug.BuildSetting
	if info, ok := debug.ReadBuildInfo(); ok {
		settings = info.Settings
	}
	return resolve(commit, settings)
}

// resolve picks the commit from the linked value and the build settings.
func resolve(linked string, settings []debug.BuildSetting) string {
	if linked != "" {
		return linked
	}
	var revision string
	var modified bool
	for _, setting := range settings {
		switch setting.Key {
		case "vcs.revision":
			revision = setting.Value
		case "vcs.modified":
			modified = setting.Value == "true"
		}
	}
	if revision == "" {
		return "dev"
	}
	if modified {
		return revision + "-dirty"
	}
	return revision
}
