// Package report describes the problems met while generating the packs.
package report

// Unsupported is a card left out of the generated packs, with the reason why.
type Unsupported struct {
	Code   string
	Name   string
	Pack   string
	Reason string
}
