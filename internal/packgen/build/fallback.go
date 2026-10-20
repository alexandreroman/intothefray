package build

import (
	"cmp"
	"slices"
	"strings"

	"github.com/alexandreroman/intothefray/internal/packgen/marvelcdb"
	"github.com/alexandreroman/intothefray/internal/packgen/mc4db"
	"github.com/alexandreroman/intothefray/internal/packgen/report"
)

const (
	// mc4dbSource names mc4db in the fallback report.
	mc4dbSource = "mc4db"
	// officialCreator is the mc4db creator of the official cards and packs.
	officialCreator = "FFG"
	// officialTag marks the mc4db codes of the official packs and sets, which
	// marvelcdb spells without it: fear_no_evil_by_ffg is fne,
	// daredevil_by_ffg_nemesis is daredevil_nemesis.
	officialTag = "_by_ffg"
)

// withFallback completes the marvelcdb records and packs with the official
// mc4db records of the cards marvelcdb lacks. It lists the records it adds,
// sorted by source, pack and code, and the candidates it cannot add, sorted by
// code. Its arguments are left unchanged.
//
// A card's faces never mix sources: the mc4db records of a base code are all
// added, and only when marvelcdb has no record of that base code. An added
// record goes to the marvelcdb pack of the same code, else of the same name,
// else of the same code without the official tag; any other pack is added from
// the mc4db pack list, its code without the official tag. A record whose pack
// is in neither source is left out. Set codes lose the official tag too, and
// image paths stay relative to the mc4db host.
//
// A record that holds both faces of a card under one code (it has a back
// image) is left out and reported: the marvelcdb schema has one image per
// record, so its back would be lost.
func withFallback(
	mc []marvelcdb.Card,
	mcPacks []marvelcdb.Pack,
	mc4dbCards []mc4db.Card,
	mc4dbPacks []mc4db.Pack,
) (cards []marvelcdb.Card, packs []marvelcdb.Pack, added []report.Fallback, unsupported []report.Unsupported) {
	knownBases := make(map[string]bool, len(mc))
	for _, card := range mc {
		knownBases[baseCode(card.Code)] = true
	}
	mapper := newPackMapper(mcPacks, mc4dbPacks)

	cards = slices.Clone(mc)
	for _, card := range mc4dbCards {
		if card.PackCreator != officialCreator || knownBases[baseCode(card.Code)] {
			continue
		}
		packCode, found := mapper.packCodeOf(card.PackCode)
		if !found {
			continue
		}
		if card.BackImageSrc != "" {
			unsupported = append(unsupported, report.Unsupported{
				Code:   card.Code,
				Name:   card.Name,
				Pack:   packCode,
				Reason: "mc4db record holds both faces under one code",
			})
			continue
		}

		record := card.Card
		record.PackCode = packCode
		record.SetCode = strings.ReplaceAll(record.SetCode, officialTag, "")
		record.ImageHost = mc4db.BaseURL
		cards = append(cards, record)
		added = append(added, report.Fallback{
			Source: mc4dbSource,
			Pack:   packCode,
			Code:   record.Code,
			Name:   record.Name,
		})
	}

	slices.SortFunc(added, func(a, b report.Fallback) int {
		return cmp.Or(cmp.Compare(a.Source, b.Source), cmp.Compare(a.Pack, b.Pack), cmp.Compare(a.Code, b.Code))
	})
	slices.SortFunc(unsupported, func(a, b report.Unsupported) int { return cmp.Compare(a.Code, b.Code) })
	return cards, mapper.packs, added, unsupported
}

// packMapper maps mc4db pack codes to marvelcdb pack codes, adding to its
// packs the ones marvelcdb lacks as they are needed.
type packMapper struct {
	packs      []marvelcdb.Pack
	codes      map[string]bool       // marvelcdb pack codes
	byName     map[string]string     // marvelcdb pack code by lower-case name
	mc4dbPacks map[string]mc4db.Pack // by mc4db code
}

func newPackMapper(mcPacks []marvelcdb.Pack, mc4dbPacks []mc4db.Pack) *packMapper {
	mapper := &packMapper{
		codes:      make(map[string]bool, len(mcPacks)),
		byName:     make(map[string]string, len(mcPacks)),
		mc4dbPacks: make(map[string]mc4db.Pack, len(mc4dbPacks)),
	}
	for _, mcPack := range mcPacks {
		mapper.add(mcPack)
	}
	for _, mc4dbPack := range mc4dbPacks {
		mapper.mc4dbPacks[mc4dbPack.Code] = mc4dbPack
	}
	return mapper
}

func (m *packMapper) add(mcPack marvelcdb.Pack) {
	m.packs = append(m.packs, mcPack)
	m.codes[mcPack.Code] = true
	m.byName[strings.ToLower(mcPack.Name)] = mcPack.Code
}

// packCodeOf returns the marvelcdb pack code of an mc4db pack, false when
// neither source lists the pack. A pack is looked up by code, then by name,
// then by code without the official tag, and added only when all three fail.
func (m *packMapper) packCodeOf(mc4dbCode string) (string, bool) {
	if m.codes[mc4dbCode] {
		return mc4dbCode, true
	}
	source, found := m.mc4dbPacks[mc4dbCode]
	if !found {
		return "", false
	}
	// The pack added for the first record of a pack is found here by name for
	// the next ones.
	if code, found := m.byName[strings.ToLower(source.Name)]; found {
		return code, true
	}
	// The same pack under another name, e.g. thor_by_ffg named "Thor Hero
	// Pack" for marvelcdb's thor: adding it would make two packs of one code.
	code := strings.ReplaceAll(mc4dbCode, officialTag, "")
	if m.codes[code] {
		return code, true
	}
	added := marvelcdb.Pack{Code: code, Name: source.Name, Position: source.Position}
	m.add(added)
	return added.Code, true
}
