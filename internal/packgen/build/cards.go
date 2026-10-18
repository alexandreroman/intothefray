// Package build turns raw marvelcdb and Cerebro records into pack cards.
package build

import (
	"cmp"
	"fmt"
	"slices"
	"strings"

	"github.com/alexandreroman/intothefray/internal/pack"
	"github.com/alexandreroman/intothefray/internal/packgen/cerebro"
	"github.com/alexandreroman/intothefray/internal/packgen/curated"
	"github.com/alexandreroman/intothefray/internal/packgen/marvelcdb"
	"github.com/alexandreroman/intothefray/internal/packgen/report"
)

const (
	cerebroImageURL = "https://pub-d27e6715f4ba4529bc9d8fd13938a5a1.r2.dev/cerebro-cards/official/%s.jpg"
	marvelcdbHost   = "https://marvelcdb.com"
	baseCodeLength  = 5 // digits of a code, without its face letter
)

// BuildCards groups the marvelcdb entries into cards, one per base code, and
// returns them by pack code, sorted by code. Cards that cannot be displayed
// are returned as unsupported instead.
//
//nolint:revive // BuildCards is the name fixed by the plan.
func BuildCards(
	mc []marvelcdb.Card,
	cb []cerebro.Card,
	overrides map[string]curated.CardOverride,
) (cards map[string][]pack.Card, unsupported []report.Unsupported) {
	cerebroIDs := make(map[string]string, len(cb))
	for _, card := range cb {
		cerebroIDs[strings.ToUpper(card.ID)] = card.ID
	}

	entriesByBase, reprints := groupEntries(mc)
	reprintsByBase, unresolved := resolveReprints(reprints, entriesByBase)
	unsupported = append(unsupported, unresolved...)

	cards = make(map[string][]pack.Card)
	for base, entries := range entriesByBase {
		first := entries[0]
		faces, ok := buildFaces(entries, cerebroIDs, overrides)
		if !ok {
			unsupported = append(unsupported, report.Unsupported{
				Code:   base,
				Name:   first.Name,
				Pack:   first.PackCode,
				Reason: "no image",
			})
			continue
		}
		cards[first.PackCode] = append(cards[first.PackCode], pack.Card{
			Code:     base,
			Faces:    faces,
			Set:      first.SetCode,
			Back:     backOf(first),
			Quantity: max(first.Quantity, 1),
			Aliases:  aliasesOf(base, entries, reprintsByBase[base]),
		})
	}

	for _, packCards := range cards {
		slices.SortFunc(packCards, func(a, b pack.Card) int { return cmp.Compare(a.Code, b.Code) })
	}
	slices.SortFunc(unsupported, func(a, b report.Unsupported) int { return cmp.Compare(a.Code, b.Code) })
	return cards, unsupported
}

// groupEntries splits the records into the entries of each base code, ordered
// by face letter, and the reprints, which are not cards.
func groupEntries(mc []marvelcdb.Card) (entries map[string][]marvelcdb.Card, reprints []marvelcdb.Card) {
	entries = make(map[string][]marvelcdb.Card)
	for _, card := range mc {
		if card.DuplicateOf != "" {
			reprints = append(reprints, card)
			continue
		}
		base := baseCode(card.Code)
		entries[base] = append(entries[base], card)
	}

	for base, group := range entries {
		// Suffixed entries are the faces; a bare entry is only a summary of them.
		if len(group) > 1 {
			group = slices.DeleteFunc(group, func(card marvelcdb.Card) bool { return card.Code == base })
		}
		slices.SortFunc(group, func(a, b marvelcdb.Card) int { return cmp.Compare(a.Code, b.Code) })
		entries[base] = group
	}
	return entries, reprints
}

// resolveReprints attaches each reprint code to the base card at the end of
// its duplicate_of_code chain. Reprints that cannot be attached are reported.
func resolveReprints(
	reprints []marvelcdb.Card,
	entries map[string][]marvelcdb.Card,
) (aliases map[string][]string, unsupported []report.Unsupported) {
	originalOf := make(map[string]string, len(reprints))
	for _, reprint := range reprints {
		originalOf[reprint.Code] = reprint.DuplicateOf
	}

	aliases = make(map[string][]string)
	for _, reprint := range reprints {
		root, reason := rootOf(reprint, originalOf, entries)
		if reason != "" {
			unsupported = append(unsupported, reportReprint(reprint, reason))
			continue
		}
		aliases[root] = append(aliases[root], reprint.Code)
	}
	return aliases, unsupported
}

// rootOf follows the reprint chain and returns the base code of the original
// card, or the reason why the reprint cannot be attached to one.
func rootOf(
	reprint marvelcdb.Card,
	originalOf map[string]string,
	entries map[string][]marvelcdb.Card,
) (root, reason string) {
	visited := map[string]bool{reprint.Code: true}
	current := reprint.DuplicateOf
	for originalOf[current] != "" {
		if visited[current] {
			return "", "reprint cycle"
		}
		visited[current] = true
		current = originalOf[current]
	}

	root = baseCode(current)
	faces, found := entries[root]
	if !found {
		return "", "original not found"
	}
	// The catalog maps an alias with a face letter to the face of that letter.
	if len(reprint.Code) > baseCodeLength && int(reprint.Code[baseCodeLength]-'a') >= len(faces) {
		return "", "reprint face missing from original"
	}
	return root, ""
}

func reportReprint(reprint marvelcdb.Card, reason string) report.Unsupported {
	return report.Unsupported{Code: reprint.Code, Name: reprint.Name, Pack: reprint.PackCode, Reason: reason}
}

func baseCode(code string) string {
	if len(code) > baseCodeLength {
		return code[:baseCodeLength]
	}
	return code
}

// buildFaces returns false when a face has no image to display.
func buildFaces(
	entries []marvelcdb.Card,
	cerebroIDs map[string]string,
	overrides map[string]curated.CardOverride,
) ([]pack.Face, bool) {
	faces := make([]pack.Face, 0, len(entries))
	for _, entry := range entries {
		images := imagesOf(entry, cerebroIDs)
		if len(images) == 0 {
			return nil, false
		}

		size := sizeOf(entry.TypeCode)
		if override := overrides[entry.Code].Size; override != "" {
			size = override
		}

		face := pack.Face{
			Name:     entry.Name,
			Subname:  entry.Subname,
			Type:     entry.TypeCode,
			Stage:    entry.Stage,
			Size:     size,
			Images:   images,
			HandSize: entry.HandSize,
		}
		if entry.BaseThreat != nil {
			face.StartingThreat = &pack.Threat{Value: *entry.BaseThreat, PerPlayer: !entry.BaseThreatFixed}
		}
		faces = append(faces, face)
	}
	return faces, true
}

func imagesOf(entry marvelcdb.Card, cerebroIDs map[string]string) []string {
	var images []string
	if id, found := cerebroIDs[strings.ToUpper(entry.Code)]; found {
		images = append(images, fmt.Sprintf(cerebroImageURL, id))
	}
	if entry.ImageSrc != "" {
		images = append(images, marvelcdbHost+entry.ImageSrc)
	}
	return images
}

func sizeOf(typeCode string) pack.Size {
	switch typeCode {
	case "main_scheme", "side_scheme", "player_side_scheme":
		return pack.SizeLand
	default:
		return pack.SizeStd
	}
}

func backOf(entry marvelcdb.Card) pack.Back {
	switch entry.TypeCode {
	case "villain", "main_scheme":
		return pack.BackVillain
	case "obligation":
		return pack.BackEncounter
	}
	switch entry.SetType {
	case "villain", "modular", "standard", "expert", "nemesis":
		return pack.BackEncounter
	default:
		return pack.BackPlayer
	}
}

// aliasesOf lists the codes that resolve to the card: its face codes and its
// reprint codes. The canonical code is excluded, the catalog rejects it.
func aliasesOf(base string, entries []marvelcdb.Card, reprints []string) []string {
	var aliases []string
	for _, entry := range entries {
		aliases = append(aliases, entry.Code)
	}
	aliases = append(aliases, reprints...)

	slices.Sort(aliases)
	aliases = slices.Compact(aliases)
	return slices.DeleteFunc(aliases, func(alias string) bool { return alias == base })
}
