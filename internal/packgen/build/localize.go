package build

import (
	"github.com/alexandreroman/intothefray/internal/pack"
	"github.com/alexandreroman/intothefray/internal/packgen/cdn"
	"github.com/alexandreroman/intothefray/internal/packgen/curated"
	"github.com/alexandreroman/intothefray/internal/packgen/marvelcdb"
	"github.com/alexandreroman/intothefray/internal/packgen/report"
)

// Language codes of the image manifest and of the localized overrides.
const (
	english = "en"
	french  = "fr"
)

// frenchSources indexes the French sources for the build.
type frenchSources struct {
	cards     map[string]faceNames // by marvelcdb face code
	images    cdn.Manifest         // the French scans, by face code
	packNames map[string]string    // by pack code
	setNames  map[string]string    // by set code
}

// faceNames holds the names of a face in one language.
type faceNames struct {
	name    string
	subname string
}

func frenchSourcesOf(in Inputs) frenchSources {
	sources := frenchSources{
		cards:     make(map[string]faceNames, len(in.FrenchMC)),
		images:    in.Manifest,
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
	return sources
}

// localizeCards adds the French overrides to the faces of the cards, which are
// keyed by pack code: the names that differ from English, and the French scan
// of the manifest. faceCodes maps a card code to the marvelcdb code of each of
// its faces.
func localizeCards(cards map[string][]pack.Card, faceCodes map[string][]string, fr frenchSources) {
	for _, packCards := range cards {
		for _, card := range packCards {
			codes := faceCodes[card.Code]
			for i := range card.Faces {
				face := &card.Faces[i]
				override := fr.faceOverride(*face, codes[i])
				if !override.IsZero() {
					face.Localized = map[string]pack.Localized{french: override}
				}
			}
		}
	}
}

// faceOverride returns the French override of one face, empty when the face
// has no French data. Without a French scan, the face shows its English image.
func (fr frenchSources) faceOverride(face pack.Face, faceCode string) pack.Localized {
	var override pack.Localized
	if names, found := fr.cards[faceCode]; found {
		if names.name != face.Name {
			override.Name = names.name
		}
		if names.subname != face.Subname {
			override.Subname = names.subname
		}
	}
	if image, found := fr.images.Image(faceCode, french); found {
		override.Images = []string{image}
	}
	return override
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

// frenchCoverage counts the faces of the packs whose name is translated. A face
// counts as translated only when it has a French name override: fr.marvelcdb
// lists untranslated cards under their English name, so counting the faces it
// lists would say nothing. A name that French keeps as is, e.g. "Rhino", is
// not counted either, so the figure is a lower bound. The French images are
// counted against the manifest, by the generator's report.
func frenchCoverage(packs []pack.PackFile) report.Coverage {
	coverage := report.Coverage{Lang: french}
	for _, packFile := range packs {
		for _, card := range packFile.Cards {
			for _, face := range card.Faces {
				coverage.Faces++
				if face.Localized[french].Name != "" {
					coverage.Names++
				}
			}
		}
	}
	return coverage
}
