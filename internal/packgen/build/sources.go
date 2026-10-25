package build

import (
	"cmp"
	"slices"

	"github.com/alexandreroman/intothefray/internal/pack"
	"github.com/alexandreroman/intothefray/internal/packgen/cdn"
)

// Sources lists the image sources of every face Build builds, sorted by code,
// for the image pipeline's sources.json. Faces are listed before any card is
// dropped: the pipeline is what finds them an image. The curated Cerebro
// overrides apply, so swapped Cerebro images stay fixed.
func Sources(in Inputs) []cdn.SourceFace {
	// The same merged records as Build, so every face it builds is listed.
	mc, _, _, _ := withFallback(in.MC, in.MCPacks, in.MC4DB, in.MC4DBPacks)
	cerebroIDs := cerebroIDsOf(in.CB)
	entriesByCard, _, _ := groupEntries(mc)

	var faces []cdn.SourceFace
	for _, entries := range entriesByCard {
		for _, entry := range entries {
			override := in.Curated.Cards[entry.Code]
			size := faceSize(entry, override)
			faces = append(faces, cdn.SourceFace{
				Code:      entry.Code,
				Landscape: size == pack.SizeLand || size == pack.SizeDoubleLand,
				Cerebro:   cerebroImage(entry, override.Cerebro, cerebroIDs),
				Record:    recordImage(entry),
				Octgn:     cdn.OctgnStem(entry.OctgnID, entry.Code),
			})
		}
	}
	slices.SortFunc(faces, func(a, b cdn.SourceFace) int { return cmp.Compare(a.Code, b.Code) })
	return faces
}
