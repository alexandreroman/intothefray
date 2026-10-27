package build

import (
	"cmp"
	"fmt"
	"maps"
	"slices"
	"strconv"
	"strings"

	"github.com/alexandreroman/intothefray/internal/pack"
	"github.com/alexandreroman/intothefray/internal/packgen/cdn"
	"github.com/alexandreroman/intothefray/internal/packgen/cgbuilder"
	"github.com/alexandreroman/intothefray/internal/packgen/curated"
	"github.com/alexandreroman/intothefray/internal/packgen/marvelcdb"
	"github.com/alexandreroman/intothefray/internal/packgen/mc4db"
	"github.com/alexandreroman/intothefray/internal/packgen/report"
)

// Language codes of the image manifest and of the localized overrides.
const (
	english = "en"
	french  = "fr"
)

// frenchSources indexes the French sources for the build.
type frenchSources struct {
	images cdn.Manifest // the French scans, by face code
	// names lists the sources of French names, highest precedence first:
	// curated, mc4db, fr.marvelcdb, then cgbuilder.
	names []nameSource
}

// nameSource holds the names one source gives in French, by marvelcdb code.
// fr.marvelcdb and mc4db list untranslated content under its English name, so a
// name of a source counts only where it differs from English by more than case,
// spacing or the kind of apostrophe.
type nameSource struct {
	cards map[string]faceNames // by face code
	packs map[string]string    // by pack code
	sets  map[string]string    // by set code
}

// faceNames holds the names of a face in one language.
type faceNames struct {
	name    string
	subname string
}

// frenchSourcesOf indexes the French sources of in, whose cards and packs are
// expected to be completed by withFallback already.
func frenchSourcesOf(in Inputs) frenchSources {
	cardSources := frenchSources{names: []nameSource{mc4dbFrenchNames(in), marvelcdbFrenchNames(in)}}
	names := []nameSource{{packs: in.Curated.Names[french].Packs, sets: in.Curated.Names[french].Sets}}
	names = append(names, cardSources.names...)
	names = append(names, cgbuilderNames(in, cardSources))
	return frenchSources{images: in.Manifest, names: names}
}

// marvelcdbFrenchNames returns the names of fr.marvelcdb. A set takes the set
// name of its lowest-code card.
func marvelcdbFrenchNames(in Inputs) nameSource {
	source := nameSource{
		cards: make(map[string]faceNames, len(in.FrenchMC)),
		packs: make(map[string]string, len(in.FrenchMCPacks)),
		sets:  make(map[string]string),
	}
	// Walking by code makes the lowest-code card name the set, whatever the
	// source order.
	for _, card := range sortedByCode(in.FrenchMC) {
		source.cards[card.Code] = faceNames{name: card.Name, subname: card.Subname}
		if _, found := source.sets[card.SetCode]; !found && card.SetCode != "" && card.SetName != "" {
			source.sets[card.SetCode] = card.SetName
		}
	}
	for _, mcPack := range in.FrenchMCPacks {
		source.packs[mcPack.Code] = mcPack.Name
	}
	return source
}

// mc4dbFrenchNames returns the names of mc4db in French. Its card codes are
// marvelcdb face codes; its pack and set codes map to marvelcdb ones as the
// fallback maps them. The set names of its cards are left aside: they are
// often English where its set list has the French name. Its French pack list
// holds the official packs only, so a fan-made pack never names an official
// one; should two packs still map to one marvelcdb pack, the first one names
// it.
func mc4dbFrenchNames(in Inputs) nameSource {
	source := nameSource{
		cards: make(map[string]faceNames, len(in.FrenchMC4DB)),
		packs: make(map[string]string, len(in.FrenchMC4DBPacks)),
		sets:  make(map[string]string, len(in.FrenchMC4DBSets)),
	}
	for _, card := range in.FrenchMC4DB {
		// Fan-made cards name their creator; the official ones name FFG, or
		// no one when marvelcdb has them too.
		if card.PackCreator == "" || card.PackCreator == mc4db.OfficialCreator {
			source.cards[card.Code] = faceNames{name: card.Name, subname: card.Subname}
		}
	}
	// The French pack list shares the mc4db codes of the English one, whose
	// names map a pack to marvelcdb.
	mapper := newPackMapper(in.MCPacks, in.MC4DBPacks)
	for _, mc4dbPack := range in.FrenchMC4DBPacks {
		code, found := mapper.packCodeOf(mc4dbPack.Code)
		if !found {
			continue
		}
		if _, named := source.packs[code]; named {
			continue
		}
		source.packs[code] = mc4dbPack.Name
	}
	for _, set := range in.FrenchMC4DBSets {
		source.sets[strings.ReplaceAll(set.Code, officialTag, "")] = set.Name
	}
	return source
}

// cgbuilderNames returns the pack and set names of cgbuilder, whose packs are
// joined to the marvelcdb ones by the French names of their cards, as
// cardSources give them.
func cgbuilderNames(in Inputs, cardSources frenchSources) nameSource {
	var known []cgbuilder.KnownCard
	for _, card := range in.MC {
		number, found := cardNumber(card.Code)
		if !found {
			continue
		}
		// A name French keeps as is, e.g. "Rhino", matches cgbuilder too.
		name := cmp.Or(cardSources.faceName(card.Code, card.Name), card.Name)
		known = append(known, cgbuilder.KnownCard{
			Pack: card.PackCode, Number: number, Set: card.SetCode, Name: name,
		})
	}
	names := cgbuilder.Join(in.CGBuilder, known)
	return nameSource{packs: names.Packs, sets: names.Sets}
}

// cardNumber returns the number of a card in its pack, the three digits after
// the two of the pack: 184 for 50184 or 50184a.
func cardNumber(code string) (int, bool) {
	if len(code) < 5 {
		return 0, false
	}
	digits, err := strconv.Atoi(code[:5])
	if err != nil || digits < 0 {
		return 0, false
	}
	return digits % 1000, true
}

// translation returns the first name of the sources, in precedence order,
// that translates english: neither empty nor a spelling of english itself,
// e.g. "MaGog" for "Magog". nameIn gives the name of one source. It returns ""
// when no source translates english.
func (fr frenchSources) translation(english string, nameIn func(nameSource) string) string {
	for _, source := range fr.names {
		if name := nameIn(source); name != "" && !cgbuilder.SameName(name, english) {
			return name
		}
	}
	return ""
}

// faceName returns the French name of a face, "" when untranslated.
func (fr frenchSources) faceName(faceCode, english string) string {
	return fr.translation(english, func(source nameSource) string { return source.cards[faceCode].name })
}

// faceSubname returns the French subname of a face, "" when untranslated. A
// face without an English subname has none in French either: a source giving
// one is wrong, e.g. "Lei Ling" for Aero (53015).
func (fr frenchSources) faceSubname(faceCode, english string) string {
	if english == "" {
		return ""
	}
	return fr.translation(english, func(source nameSource) string { return source.cards[faceCode].subname })
}

// packName returns the French name of a pack, "" when untranslated.
func (fr frenchSources) packName(code, english string) string {
	return fr.translation(english, func(source nameSource) string { return source.packs[code] })
}

// setName returns the French name of a set, "" when untranslated.
func (fr frenchSources) setName(code, english string) string {
	return fr.translation(english, func(source nameSource) string { return source.sets[code] })
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
	override := pack.Localized{
		Name:    fr.faceName(faceCode, face.Name),
		Subname: fr.faceSubname(faceCode, face.Subname),
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
		ref.Localized = localizedName(ref.Name, fr.packName(ref.Code, ref.Name))
	}
	for i := range index.Sets {
		ref := &index.Sets[i]
		ref.Localized = localizedName(ref.Name, fr.setName(ref.Code, ref.Name))
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
		ref.Localized = localizedName(ref.Name, fr.setName(setCode, ref.Name))
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
// counts as translated only when it has a French name override: the sources
// list untranslated cards under their English name, so counting the faces they
// list would say nothing. A name that French keeps as is, e.g. "Rhino", is
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

// checkCuratedNames makes sure the curated names are in a language the build
// localizes, and name packs and sets of the catalog: a misspelt code would be
// silently ignored.
func checkCuratedNames(names map[string]curated.Names, packs []pack.PackFile, sets map[string][]pack.Set) error {
	packCodes := make(map[string]bool, len(packs))
	for _, packFile := range packs {
		packCodes[packFile.Code] = true
	}
	setCodes := make(map[string]bool)
	for _, packSets := range sets {
		for _, set := range packSets {
			setCodes[set.Code] = true
		}
	}

	for _, lang := range slices.Sorted(maps.Keys(names)) {
		if lang != french {
			return fmt.Errorf("curated names: language %q is not localized", lang)
		}
		for _, code := range slices.Sorted(maps.Keys(names[lang].Packs)) {
			if !packCodes[code] {
				return fmt.Errorf("curated %s name of pack %s: the pack is not in the catalog", lang, code)
			}
		}
		for _, code := range slices.Sorted(maps.Keys(names[lang].Sets)) {
			if !setCodes[code] {
				return fmt.Errorf("curated %s name of set %s: the set is not in the catalog", lang, code)
			}
		}
	}
	return nil
}
