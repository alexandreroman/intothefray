package build

import (
	"cmp"
	"errors"
	"fmt"
	"maps"
	"slices"

	"github.com/alexandreroman/intothefray/internal/pack"
	"github.com/alexandreroman/intothefray/internal/packgen/cdn"
	"github.com/alexandreroman/intothefray/internal/packgen/cerebro"
	"github.com/alexandreroman/intothefray/internal/packgen/curated"
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
	// French names.
	FrenchMC      []marvelcdb.Card
	FrenchMCPacks []marvelcdb.Pack
	// MC4DB and MC4DBPacks complete MC and MCPacks with the official cards
	// marvelcdb lacks (see withFallback).
	MC4DB      []mc4db.Card
	MC4DBPacks []marvelcdb.Pack
	// Manifest holds the image of each face on the image CDN, per language. A
	// card with a face lacking an English image is left out.
	Manifest cdn.Manifest
}

// Result is the generated content of one language.
type Result struct {
	Packs []pack.PackFile
	// Index.Lang is left empty: the writer sets it.
	Index  pack.Index
	Report []report.Unsupported
	// Fallback lists the records taken from mc4db, sorted by pack and code.
	Fallback []report.Fallback
	// Coverage counts the localized faces, one entry per language.
	Coverage []report.Coverage
}

// Build derives the packs and the index from the sources. Content that
// cannot be displayed is left out and listed in the report.
func Build(in Inputs) (Result, error) {
	// Every step below sees the merged records, as Sources does.
	var fallback []report.Fallback
	var fallbackProblems []report.Unsupported
	in.MC, in.MCPacks, fallback, fallbackProblems = withFallback(in.MC, in.MCPacks, in.MC4DB, in.MC4DBPacks)
	if err := checkCerebroOverrides(in.Curated.Cards, in.CB); err != nil {
		return Result{}, err
	}
	fr := frenchSourcesOf(in)
	cards, problems := buildCards(in.MC, in.Curated.Cards, in.Manifest)
	localizeCards(cards, faceCodesOf(in.MC), fr)
	problems = append(problems, fallbackProblems...)

	cardCodes := cardCodesOf(cards)
	// Without any card, the packs would still be written with their sets
	// emptied: an empty manifest must fail the build rather than ship them.
	if len(cardCodes) == 0 {
		return Result{}, errors.New("build produced no card: the image manifest has no English image for any face")
	}
	if err := checkCardSetAside(in.Curated.Cards, canonicalCodes(in.MC), cardCodes); err != nil {
		return Result{}, err
	}
	faceCounts := faceCountsOf(cards)
	sets := pruneSets(buildSets(in.MC, in.MCPacks), cardCodes)
	if err := applySetDefs(sets, in.Curated.Sets, cardCodes, faceCounts, mainSchemeCardsOf(cards)); err != nil {
		return Result{}, err
	}
	applySideBacks(cards, sets)
	// Side decks are linked before the heroes are checked, so that a hero
	// dropped for a missing image is reported rather than failing the build.
	allHeroes := buildHeroes(in.MC)
	if err := linkSideDecks(allHeroes, sets); err != nil {
		return Result{}, err
	}
	heroes, heroProblems := checkHeroes(allHeroes, cardCodes)
	problems = append(problems, heroProblems...)

	scenarios, refs, scenarioProblems := buildScenarios(in.Curated.Scenarios, cards, sets, in.CBSets)
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
	index := buildIndex(packs, refs, positions, mainSchemeRecommendations(sets, in.CBSets))
	localizeIndex(&index, in.Curated.Scenarios, fr)
	return Result{
		Packs:    packs,
		Index:    index,
		Report:   problems,
		Fallback: fallback,
		Coverage: []report.Coverage{frenchCoverage(packs)},
	}, nil
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

// mainSchemeCardsOf returns the codes of the cards whose first face is a main
// scheme.
func mainSchemeCardsOf(cards map[string][]pack.Card) map[string]bool {
	codes := make(map[string]bool)
	for _, packCards := range cards {
		for _, card := range packCards {
			if len(card.Faces) > 0 && card.Faces[0].Type == mainSchemeKind {
				codes[card.Code] = true
			}
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
// otherwise be set up wrongly. mainSchemeCards holds the codes of the cards
// whose first face is a main scheme.
func applySetDefs(
	sets map[string][]pack.Set,
	defs map[string]curated.SetDef,
	cardCodes map[string]bool,
	faceCounts map[string]int,
	mainSchemeCards map[string]bool,
) error {
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
		if err := checkSide(*set, def.Side); err != nil {
			return fmt.Errorf("curated set %s: %w", code, err)
		}
		if err := checkSetAside(*set, def.SetAside, cardCodes); err != nil {
			return fmt.Errorf("curated set %s: %w", code, err)
		}
		if err := checkMainScheme(*set, def.MainScheme, mainSchemeCards); err != nil {
			return fmt.Errorf("curated set %s: %w", code, err)
		}
		if def.MainScheme {
			set.Kind = mainSchemeKind
		}
		set.InPlay = def.InPlay
		set.Unlisted = def.Unlisted
		set.Side = def.Side
		set.SetAside = def.SetAside
	}
	return nil
}

// applySideBacks gives every card of a side deck with a shared back that
// back, whatever back its source tells: one card with another back would show
// which card lies on top of the face-down deck.
func applySideBacks(cards map[string][]pack.Card, sets map[string][]pack.Set) {
	backs := make(map[string]pack.Back)
	for _, packSets := range sets {
		for _, set := range packSets {
			if set.Side == nil || set.Side.Back == "" {
				continue
			}
			for _, code := range set.Cards {
				backs[code] = set.Side.Back
			}
		}
	}
	for _, packCards := range cards {
		for i := range packCards {
			if back, ok := backs[packCards[i].Code]; ok {
				packCards[i].Back = back
			}
		}
	}
}

// checkSide makes sure only a hero_special set becomes a side deck: other
// kinds already have a place at setup.
func checkSide(set pack.Set, side *pack.SideDeck) error {
	if side != nil && set.Kind != heroSpecialKind {
		return fmt.Errorf("side deck needs a %s set, not a %s set", heroSpecialKind, set.Kind)
	}
	return nil
}

// checkMainScheme makes sure a main scheme set has a card whose first face is
// a main scheme: setup takes the main scheme of the game from it.
func checkMainScheme(set pack.Set, mainScheme bool, mainSchemeCards map[string]bool) error {
	if !mainScheme {
		return nil
	}
	if !slices.ContainsFunc(set.Cards, func(code string) bool { return mainSchemeCards[code] }) {
		return errors.New("main scheme set has no main scheme card")
	}
	return nil
}

// checkSetAside makes sure set-aside cards are listed on a hero set, the only
// one setup reads them from, and exist in the catalog. They may belong to
// another set, as Iceman's Frostbite cards do.
func checkSetAside(set pack.Set, setAside []string, cardCodes map[string]bool) error {
	if len(setAside) == 0 {
		return nil
	}
	if set.Kind != heroKind {
		return fmt.Errorf("set-aside cards need a %s set, not a %s set", heroKind, set.Kind)
	}
	for _, code := range setAside {
		if !cardCodes[code] {
			return fmt.Errorf("set-aside card %s is not in the catalog", code)
		}
	}
	return nil
}

// checkCardSetAside makes sure the cards a curated card sets aside exist in
// the catalog and do not include the card itself, which belongs in the deck,
// and that they are listed on the code of a card, the only one buildCards
// reads them from: on a face code they would be silently ignored.
func checkCardSetAside(
	overrides map[string]curated.CardOverride,
	canonicalCodes map[string]string,
	cardCodes map[string]bool,
) error {
	for _, code := range slices.Sorted(maps.Keys(overrides)) {
		setAside := overrides[code].SetAside
		if len(setAside) == 0 {
			continue
		}
		canonical, found := canonicalCodes[code]
		if !found {
			return fmt.Errorf("curated card %s is not in the catalog", code)
		}
		if canonical != code {
			return fmt.Errorf("curated card %s: set-aside cards need the code of a card, not of one of its faces", code)
		}
		for _, aside := range setAside {
			if aside == code {
				return fmt.Errorf("curated card %s: sets itself aside", code)
			}
			if !cardCodes[aside] {
				return fmt.Errorf("curated card %s: set-aside card %s is not in the catalog", code, aside)
			}
		}
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
			if !hasFace(ref, faceCounts) {
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
		if !hasFace(ref, faceCounts) {
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

// hasFace reports whether the card of ref has the face ref points at.
func hasFace(ref pack.FaceRef, faceCounts map[string]int) bool {
	return ref.Face >= 0 && ref.Face < faceCounts[ref.Card]
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

// buildIndex lists the packs, the scenarios and the sets the lobby can offer.
// recommendations maps a main scheme set code to the modular sets recommended
// with it.
func buildIndex(
	packs []pack.PackFile,
	refs []pack.ScenarioRef,
	positions map[string]int,
	recommendations map[string][]string,
) pack.Index {
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
					Recommended: recommendations[set.Code],
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
	return kind == modularKind || kind == "standard" || kind == "expert" || kind == mainSchemeKind
}
