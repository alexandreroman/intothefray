// Package report describes the problems met while generating the packs, and
// how much of them is localized.
package report

import (
	"fmt"
	"strconv"
)

// Unsupported is a card left out of the generated packs, with the reason why.
type Unsupported struct {
	Code   string
	Name   string
	Pack   string
	Reason string
}

// Coverage counts the faces of the generated packs that have data in one
// language.
type Coverage struct {
	Lang   string
	Faces  int // faces of every pack
	Names  int // faces whose name is known in the language
	Images int // faces with at least one image in the language
	// PacksWithoutImages lists, in release order, the packs that have faces
	// but no image in the language.
	PacksWithoutImages []string
}

// String formats the counts, e.g. "fr: names 3,900/4,027 faces, images
// 3,880/4,027 faces".
func (c Coverage) String() string {
	faces := thousands(c.Faces)
	return fmt.Sprintf("%s: names %s/%s faces, images %s/%s faces",
		c.Lang, thousands(c.Names), faces, thousands(c.Images), faces)
}

// thousands formats a non-negative count with comma separators.
func thousands(n int) string {
	digits := strconv.Itoa(n)
	var formatted []byte
	for i := range len(digits) {
		if i > 0 && (len(digits)-i)%3 == 0 {
			formatted = append(formatted, ',')
		}
		formatted = append(formatted, digits[i])
	}
	return string(formatted)
}
