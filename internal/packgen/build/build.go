package build

import (
	"cmp"
	"errors"
	"fmt"
	"maps"
	"slices"

	"github.com/alexandreroman/intothefray/internal/pack"
	"github.com/alexandreroman/intothefray/internal/packgen/cerebro"
	"github.com/alexandreroman/intothefray/internal/packgen/curated"
	"github.com/alexandreroman/intothefray/internal/packgen/images"
	"github.com/alexandreroman/intothefray/internal/packgen/marvelcdb"
	"github.com/alexandreroman/intothefray/internal/packgen/mc4db"
	"github.com/alexandreroman/intothefray/internal/packgen/report"
)

const indexVersion = 1

// Inputs gathers everything Build needs. No field is fetched by Build itself.
type Inputs struct {
	MC      []marvelcdb.Card
	MCPacks []marvelcdb.Pack
	CB      []cerebro.Card
	CBSets  []cerebro.Set
	Curated curated.Curated
	// FrenchMC and FrenchMCPacks are the French marvelcdb records, for the
	// French names. MC4DB lists the image paths of mc4db; without it, no French
	// image is looked for.
	FrenchMC      []marvelcdb.Card
	FrenchMCPacks []marvelcdb.Pack
	MC4DB         []mc4db.Card
	// Alive maps each image URL to its liveness; a missing URL counts as dead.
	Alive map[string]bool
}

// Result is the generated content of one language.
type Result struct {
	Packs []pack.PackFile
	// Index.Lang is left empty: the writer sets it.
	Index  pack.Index
	Report []report.Unsupported
	// Coverage counts the localized faces, one entry per language.
	Coverage []report.Coverage
}

// ImageURLs returns the sorted, distinct image URLs of every face of every
// card, localized images included, i.e. the URLs whose liveness Build expects
// in Inputs.Alive.
func ImageURLs(in Inputs) []string {
	cards, _ := BuildCards(in.MC, in.CB, in.Curated.Cards)
	localizeCards(cards, faceCodesOf(in.MC), frenchSourcesOf(in))

	var urls []string
	for _, packCards := range cards {
		for _, card := range packCards {
			for _, face := range card.Faces {
				urls = append(urls, face.Images...)
				for _, override := range face.Localized {
					urls = append(urls, override.Images...)
				}
			}
		}
	}
	slices.Sort(urls)
	return slices.Compact(urls)
}

// Build derives the packs and the index from the sources. Content that
// cannot be displayed is left out and listed in the report.
func Build(in Inputs) (Result, error) {
	fr := frenchSourcesOf(in)
	faceCodes := faceCodesOf(in.MC)
	cards, problems := BuildCards(in.MC, in.CB, in.Curated.Cards)
	localizeCards(cards, faceCodes, fr)
	cards, dropped := dropDeadImages(cards, in.Alive)
	problems = append(problems, dropped...)

	cardCodes := cardCodesOf(cards)
	faceCounts := faceCountsOf(cards)
	sets := pruneSets(BuildSets(in.MC, in.MCPacks), cardCodes)
	if err := applySetDefs(sets, in.Curated.Sets, faceCounts); err != nil {
		return Result{}, err
	}
	heroes, heroProblems := checkHeroes(BuildHeroes(in.MC), cardCodes)
	problems = append(problems, heroProblems...)

	scenarios, refs, scenarioProblems := BuildScenarios(in.Curated.Scenarios, cards, sets, in.CBSets)
	problems = append(problems, scenarioProblems...)
	scenarios, refs, faceProblems := dropInvalidFaceRefs(scenarios, refs, faceCounts)
	problems = append(problems, faceProblems...)

	packs := assemblePacks(in.MCPacks, cards, sets, heroes, scenarios)
	if len(packs) == 0 {
		return Result{}, errors.New("build produced no pack")
	}

	positions := make(map[string]int, len(packs))
	for _, packFile := range packs {
		positions[packFile.Code] = packFile.Position
	}
	index := buildIndex(packs, refs, positions)
	localizeIndex(&index, in.Curated.Scenarios, fr)
	return Result{
		Packs:    packs,
		Index:    index,
		Report:   problems,
		Coverage: []report.Coverage{frenchCoverage(packs, faceCodes, fr)},
	}, nil
}

// dropDeadImages applies images.DropDead to every pack.
func dropDeadImages(
	cards map[string][]pack.Card,
	alive map[string]bool,
) (kept map[string][]pack.Card, problems []report.Unsupported) {
	kept = make(map[string][]pack.Card, len(cards))
	for packCode, packCards := range cards {
		var dropped []report.Unsupported
		kept[packCode], dropped = images.DropDead(packCards, alive)
		for _, entry := range dropped {
			entry.Pack = packCode
			problems = append(problems, entry)
		}
	}
	slices.SortFunc(problems, func(a, b report.Unsupported) int { return cmp.Compare(a.Code, b.Code) })
	return kept, problems
}

func cardCodesOf(cards map[string][]pack.Card) map[string]bool {
	codes := make(map[string]bool)
	for _, packCards := range cards {
		for _, card := range packCards {
			codes[card.Code] = true
		}
	}
	return codes
}

// faceCountsOf maps each card code to the number of faces of the card.
func faceCountsOf(cards map[string][]pack.Card) map[string]int {
	counts := make(map[string]int)
	for _, packCards := range cards {
		for _, card := range packCards {
			counts[card.Code] = len(card.Faces)
		}
	}
	return counts
}

// pruneSets removes the cards that were left out from the sets.
func pruneSets(sets map[string][]pack.Set, cardCodes map[string]bool) map[string][]pack.Set {
	for _, packSets := range sets {
		for i := range packSets {
			packSets[i].Cards = slices.DeleteFunc(packSets[i].Cards, func(code string) bool {
				return !cardCodes[code]
			})
		}
	}
	return sets
}

// applySetDefs merges the curated set data into the generated sets. Unlike a
// broken scenario, which is only reported as unsupported, a definition that
// does not match the catalog fails the build: the set it completes would
// otherwise be set up wrongly.
func applySetDefs(sets map[string][]pack.Set, defs map[string]curated.SetDef, faceCounts map[string]int) error {
	setsByCode := make(map[string]*pack.Set)
	for _, packSets := range sets {
		for i := range packSets {
			setsByCode[packSets[i].Code] = &packSets[i]
		}
	}

	for _, code := range slices.Sorted(maps.Keys(defs)) {
		set, found := setsByCode[code]
		if !found {
			return fmt.Errorf("curated set %s is not in the catalog", code)
		}
		def := defs[code]
		if err := checkInPlay(*set, def.InPlay, faceCounts); err != nil {
			return fmt.Errorf("curated set %s: %w", code, err)
		}
		set.InPlay = def.InPlay
		set.Unlisted = def.Unlisted
	}
	return nil
}

// checkInPlay makes sure every in-play card belongs to the set and has the
// face it starts on.
func checkInPlay(set pack.Set, inPlay map[pack.Difficulty][]pack.FaceRef, faceCounts map[string]int) error {
	for _, difficulty := range slices.Sorted(maps.Keys(inPlay)) {
		for _, ref := range inPlay[difficulty] {
			if !slices.Contains(set.Cards, ref.Card) {
				return fmt.Errorf("%s in-play card %s is not in the set", difficulty, ref.Card)
			}
			if ref.Face < 0 || ref.Face >= faceCounts[ref.Card] {
				return fmt.Errorf("%s in-play card %s has no face %d", difficulty, ref.Card, ref.Face)
			}
		}
	}
	return nil
}

// checkHeroes drops the heroes whose identity card is missing and clears the
// obligation of those whose obligation card is missing.
func checkHeroes(
	heroes map[string][]pack.Hero,
	cardCodes map[string]bool,
) (checked map[string][]pack.Hero, problems []report.Unsupported) {
	checked = make(map[string][]pack.Hero, len(heroes))
	for packCode, packHeroes := range heroes {
		for _, hero := range packHeroes {
			if !cardCodes[hero.Identity] {
				problems = append(problems, report.Unsupported{
					Code:   hero.Identity,
					Name:   hero.Set,
					Pack:   packCode,
					Reason: "hero identity card is missing",
				})
				continue
			}
			if hero.Obligation != "" && !cardCodes[hero.Obligation] {
				problems = append(problems, report.Unsupported{
					Code:   hero.Obligation,
					Name:   hero.Set,
					Pack:   packCode,
					Reason: "hero obligation card is missing",
				})
				hero.Obligation = ""
			}
			checked[packCode] = append(checked[packCode], hero)
		}
	}
	slices.SortFunc(problems, func(a, b report.Unsupported) int { return cmp.Compare(a.Code, b.Code) })
	return checked, problems
}

// dropInvalidFaceRefs makes a scenario unsupported when one of its start
// references points at a face the card does not have.
func dropInvalidFaceRefs(
	scenarios map[string][]pack.Scenario,
	refs []pack.ScenarioRef,
	faceCounts map[string]int,
) (valid map[string][]pack.Scenario, updatedRefs []pack.ScenarioRef, problems []report.Unsupported) {
	valid = make(map[string][]pack.Scenario, len(scenarios))
	for packCode, packScenarios := range scenarios {
		for _, scenario := range packScenarios {
			bad := invalidFaceRefs(scenario, faceCounts)
			if len(bad) == 0 {
				valid[packCode] = append(valid[packCode], scenario)
				continue
			}
			for _, ref := range bad {
				problems = append(problems, report.Unsupported{
					Code:   ref.Card,
					Name:   scenario.Name,
					Pack:   packCode,
					Reason: fmt.Sprintf("scenario %s uses face %d, which card %s does not have", scenario.ID, ref.Face, ref.Card),
				})
			}
			for i := range refs {
				if refs[i].ID == scenario.ID {
					refs[i].Supported = false
				}
			}
		}
	}
	return valid, refs, problems
}

func invalidFaceRefs(scenario pack.Scenario, faceCounts map[string]int) []pack.FaceRef {
	var bad []pack.FaceRef
	check := func(ref pack.FaceRef) {
		if ref.Face < 0 || ref.Face >= faceCounts[ref.Card] {
			bad = append(bad, ref)
		}
	}
	for _, start := range scenario.Start {
		for _, ref := range start.Top {
			check(ref)
		}
		for _, ref := range start.InPlay {
			check(ref)
		}
	}
	return bad
}

// assemblePacks returns one file per marvelcdb pack that has some content,
// ordered by pack position.
func assemblePacks(
	mcPacks []marvelcdb.Pack,
	cards map[string][]pack.Card,
	sets map[string][]pack.Set,
	heroes map[string][]pack.Hero,
	scenarios map[string][]pack.Scenario,
) []pack.PackFile {
	ordered := slices.Clone(mcPacks)
	slices.SortStableFunc(ordered, func(a, b marvelcdb.Pack) int { return cmp.Compare(a.Position, b.Position) })

	var packs []pack.PackFile
	for _, mcPack := range ordered {
		code := mcPack.Code
		if len(cards[code])+len(sets[code])+len(heroes[code])+len(scenarios[code]) == 0 {
			continue
		}
		packs = append(packs, pack.PackFile{
			Code:      code,
			Name:      mcPack.Name,
			Position:  mcPack.Position,
			Cards:     nonNil(cards[code]),
			Sets:      nonNil(sets[code]),
			Heroes:    heroes[code],
			Scenarios: scenarios[code],
		})
	}
	return packs
}

// nonNil makes empty lists encode as [] rather than null.
func nonNil[T any](items []T) []T {
	if items == nil {
		return []T{}
	}
	return items
}

func buildIndex(packs []pack.PackFile, refs []pack.ScenarioRef, positions map[string]int) pack.Index {
	index := pack.Index{
		Version:   indexVersion,
		Packs:     []pack.PackRef{},
		Scenarios: slices.Clone(refs),
		Sets:      []pack.SetRef{},
	}
	for _, packFile := range packs {
		index.Packs = append(index.Packs, pack.PackRef{
			Code:     packFile.Code,
			Name:     packFile.Name,
			File:     packFile.Code + ".json",
			Position: packFile.Position,
		})
		for _, set := range packFile.Sets {
			if isLobbyKind(set.Kind) && !set.Unlisted {
				index.Sets = append(index.Sets, pack.SetRef{
					Code: set.Code, Name: set.Name, Pack: packFile.Code, Kind: set.Kind,
				})
			}
		}
	}
	slices.SortStableFunc(index.Scenarios, func(a, b pack.ScenarioRef) int {
		return cmp.Compare(positions[a.Pack], positions[b.Pack])
	})
	return index
}

// isLobbyKind tells whether the lobby can offer sets of this kind. Unlisted
// sets stay out of the lobby whatever their kind.
func isLobbyKind(kind string) bool {
	return kind == modularKind || kind == "standard" || kind == "expert"
}
