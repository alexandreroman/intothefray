// Package curated holds the hand-written data that completes the card sources.
package curated

import "github.com/alexandreroman/intothefray/internal/pack"

// CardOverride replaces values derived from the sources for one face code.
type CardOverride struct {
	Size pack.Size `json:"size,omitempty"`
}
