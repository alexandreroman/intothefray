package build

import (
	"github.com/alexandreroman/intothefray/internal/pack"
	"github.com/alexandreroman/intothefray/internal/packgen/curated"
	"github.com/alexandreroman/intothefray/internal/packgen/marvelcdb"
	"github.com/alexandreroman/intothefray/internal/packgen/mc4db"
	"github.com/alexandreroman/intothefray/internal/packgen/report"
)

// french is the language code of the French overrides.
const french = "fr"

// frenchSources indexes the French sources for the build.
type frenchSources struct {
	cards     map[string]faceNames  // by marvelcdb face code
	images    map[string]mc4db.Card // by mc4db code; nil when no mc4db card was given
	packNames map[string]string     // by pack code
	setNames  map[string]string     // by set code
}

// faceNames holds the names of a face in one language.
type faceNames struct {
	name    string
	subname string
}

func frenchSourcesOf(in Inputs) frenchSources {
	sources := frenchSources{
		cards:     make(map[string]faceNames, len(in.FrenchMC)),
		packNames: make(map[string]string, len(in.FrenchMCPacks)),
		setNames:  make(map[string]string),
	}
	// Walking by code makes the lowest-code card name the set, whatever the
	// source order.
	for _, card := range sortedByCode(in.FrenchMC) {
		sources.cards[card.Code] = faceNames{name: card.Name, subname: card.Subname}
		if _, found := sources.setNames[card.SetCode]; !found && card.SetCode != "" && card.SetName != "" {
			sources.setNames[card.SetCode] = card.SetName
		}
	}
	for _, mcPack := range in.FrenchMCPacks {
		sources.packNames[mcPack.Code] = mcPack.Name
	}
	if len(in.MC4DB) > 0 {
		sources.images = make(map[string]mc4db.Card, len(in.MC4DB))
		for _, card := range in.MC4DB {
			sources.images[card.Code] = card
		}
	}
	return sources
}

// localizeCards adds the French overrides to the faces of the cards, which are
// keyed by pack code: the names that differ from English, and the image
// candidate, still unchecked. faceCodes maps a card code to the marvelcdb code
// of each of its faces.
func localizeCards(cards map[string][]pack.Card, faceCodes map[string][]string, fr frenchSources) {
	for packCode, packCards := range cards {
		for _, card := range packCards {
			codes := faceCodes[card.Code]
			for i := range card.Faces {
				face := &card.Faces[i]
				override := fr.faceOverride(*face, codes[i], i, packCode)
				if !isEmpty(override) {
					face.Localized = map[string]pack.Localized{french: override}
				}
			}
		}
	}
}

// faceOverride returns the French override of one face, empty when the face
// has no French data.
func (fr frenchSources) faceOverride(face pack.Face, faceCode string, faceIndex int, packCode string) pack.Localized {
	var override pack.Localized
	if names, found := fr.cards[faceCode]; found {
		if names.name != face.Name {
			override.Name = names.name
		}
		if names.subname != face.Subname {
			override.Subname = names.subname
		}
	}
	if fr.images != nil {
		override.Images = []string{fr.imageOf(faceCode, faceIndex, packCode)}
	}
	return override
}

// imageOf returns where mc4db stores the French scan of a face, if anywhere:
// the path mc4db lists for the face code; else, for a double-sided card that
// mc4db lists under its base code, the front path for the first face and the
// back path for the second; else the direct path under the pack of the card.
func (fr frenchSources) imageOf(faceCode string, faceIndex int, packCode string) string {
	if card, found := fr.images[faceCode]; found && card.ImageSrc != "" {
		return mc4db.FrenchImageURL(card.ImageSrc)
	}
	if card, found := fr.images[baseCode(faceCode)]; found && card.BackImageSrc != "" {
		if faceIndex == 0 && card.ImageSrc != "" {
			return mc4db.FrenchImageURL(card.ImageSrc)
		}
		if faceIndex == 1 {
			return mc4db.FrenchImageURL(card.BackImageSrc)
		}
	}
	return mc4db.DirectFrenchImageURL(packCode, faceCode)
}

func isEmpty(override pack.Localized) bool {
	return override.Name == "" && override.Subname == "" && len(override.Images) == 0
}

// faceCodesOf maps each card code to the marvelcdb codes of its faces, in face
// order.
func faceCodesOf(mc []marvelcdb.Card) map[string][]string {
	entries, _, _ := groupEntries(mc)
	codes := make(map[string][]string, len(entries))
	for code, cardEntries := range entries {
		for _, entry := range cardEntries {
			codes[code] = append(codes[code], entry.Code)
		}
	}
	return codes
}

// localizeIndex adds the French names of the packs, sets and scenarios of the
// index, where they differ from English. A scenario is named after its villain
// set, so it takes the French name of that set.
func localizeIndex(index *pack.Index, defs []curated.ScenarioDef, fr frenchSources) {
	for i := range index.Packs {
		ref := &index.Packs[i]
		ref.Localized = localizedName(ref.Name, fr.packNames[ref.Code])
	}
	for i := range index.Sets {
		ref := &index.Sets[i]
		ref.Localized = localizedName(ref.Name, fr.setNames[ref.Code])
	}

	// A curated scenario may be named differently from its villain set; any
	// other scenario is named after its set.
	villainSets := make(map[string]string, len(defs))
	for _, def := range defs {
		villainSets[def.ID] = def.VillainSet
	}
	for i := range index.Scenarios {
		ref := &index.Scenarios[i]
		setCode, found := villainSets[ref.ID]
		if !found {
			setCode = ref.ID
		}
		ref.Localized = localizedName(ref.Name, fr.setNames[setCode])
	}
}

// localizedName returns the French override of an index entry, nil when the
// French name is unknown or the same as the English one.
func localizedName(english, frenchName string) map[string]pack.Localized {
	if frenchName == "" || frenchName == english {
		return nil
	}
	return map[string]pack.Localized{french: {Name: frenchName}}
}

// frenchCoverage counts the faces of the packs that have French data. A face
// counts as named when the French source lists it, even when its French name is
// the same as the English one.
func frenchCoverage(packs []pack.PackFile, faceCodes map[string][]string, fr frenchSources) report.Coverage {
	coverage := report.Coverage{Lang: french}
	for _, packFile := range packs {
		faces, images := 0, 0
		for _, card := range packFile.Cards {
			codes := faceCodes[card.Code]
			for i, face := range card.Faces {
				faces++
				if fr.cards[codes[i]].name != "" {
					coverage.Names++
				}
				if len(face.Localized[french].Images) > 0 {
					images++
				}
			}
		}
		coverage.Faces += faces
		coverage.Images += images
		if faces > 0 && images == 0 {
			coverage.PacksWithoutImages = append(coverage.PacksWithoutImages, packFile.Code)
		}
	}
	return coverage
}
