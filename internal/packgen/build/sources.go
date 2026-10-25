package build

import (
	"github.com/alexandreroman/intothefray/internal/pack"
	"github.com/alexandreroman/intothefray/internal/packgen/cdn"
	"github.com/alexandreroman/intothefray/internal/packgen/marvelcdb"
)

// Sources lists the image sources of every face Build builds, in no particular
// order, for the image pipeline's sources.json. Faces are listed before any
// card is dropped: the pipeline is what finds them an image. The curated
// Cerebro overrides apply, so swapped Cerebro images stay fixed; like Build, it
// fails when one names an image Cerebro does not have.
func Sources(in Inputs) ([]cdn.SourceFace, error) {
	// The same merged records as Build, so every face it builds is listed.
	mc, _, _, _ := withFallback(in.MC, in.MCPacks, in.MC4DB, in.MC4DBPacks)
	if err := checkCerebroOverrides(in.Curated.Cards, in.CB); err != nil {
		return nil, err
	}
	cerebroIDs := cerebroIDsOf(in.CB)
	entriesByCard, _, _ := groupEntries(mc)
	octgnFaces := octgnFaceCounts(entriesByCard)

	var faces []cdn.SourceFace
	for _, entries := range entriesByCard {
		for _, entry := range entries {
			override := in.Curated.Cards[entry.Code]
			size := faceSize(entry, override)
			sharedID := octgnFaces[octgnGroupOf(entry)] > 1
			faces = append(faces, cdn.SourceFace{
				Code:      entry.Code,
				Landscape: size == pack.SizeLand || size == pack.SizeDoubleLand,
				Cerebro:   cerebroImage(entry, override.Cerebro, cerebroIDs),
				Record:    recordImage(entry),
				Octgn:     cdn.OctgnStem(entry.OctgnID, entry.Code, sharedID),
			})
		}
	}
	return faces, nil
}

// octgnGroup gathers the faces of one base code that have the same OCTGN id.
type octgnGroup struct {
	base    string
	octgnID string
}

func octgnGroupOf(entry marvelcdb.Card) octgnGroup {
	return octgnGroup{base: baseCode(entry.Code), octgnID: entry.OctgnID}
}

// octgnFaceCounts counts the faces of each octgnGroup. The faces of one card
// share an OCTGN id, while distinct cards sharing a number (01043a to 01043d)
// each have their own: a count above one tells the faces of one card apart.
// The faces are counted across cards, since distinct cards sharing a number
// are separate entries of entriesByCard.
func octgnFaceCounts(entriesByCard map[string][]marvelcdb.Card) map[octgnGroup]int {
	counts := make(map[octgnGroup]int)
	for _, entries := range entriesByCard {
		for _, entry := range entries {
			if entry.OctgnID == "" {
				continue
			}
			counts[octgnGroupOf(entry)]++
		}
	}
	return counts
}
