package build

import (
	"cmp"
	"fmt"
	"slices"
	"strings"

	"github.com/alexandreroman/intothefray/internal/pack"
	"github.com/alexandreroman/intothefray/internal/packgen/cerebro"
	"github.com/alexandreroman/intothefray/internal/packgen/curated"
	"github.com/alexandreroman/intothefray/internal/packgen/report"
)

const (
	villainKind = "villain"
	leaderKind  = "leader"
	modularKind = "modular"
)

// villainSet is a scenario candidate, a villain or leader set, with the pack it
// belongs to.
type villainSet struct {
	set       pack.Set
	pack      string
	firstCard *pack.Card // lowest-code card whose first face is a villain or leader, if any
}

// buildScenarios lists a scenario for every villain or leader set and merges
// the curated definitions into the ones whose cards all exist. A definition
// absorbs the sets it covers: they are not listed separately. cards and sets
// are keyed by pack code. The scenario of a set belongs to the pack of that set.
// The references are ordered by the code of the first villain card of the set.
func buildScenarios(
	defs []curated.ScenarioDef,
	cards map[string][]pack.Card,
	sets map[string][]pack.Set,
	cb []cerebro.Set,
) (scenarios map[string][]pack.Scenario, refs []pack.ScenarioRef, problems []report.Unsupported) {
	cardsByCode := make(map[string]pack.Card)
	for _, packCards := range cards {
		for _, card := range packCards {
			cardsByCode[card.Code] = card
		}
	}
	setCodes := make(map[string]bool)
	for _, packSets := range sets {
		for _, set := range packSets {
			setCodes[set.Code] = true
		}
	}
	villains := villainSetsOf(sets, cardsByCode)
	modularCodes := modularCodesByName(sets)
	cerebroNames := cerebroNamesByID(cb)
	defsBySet := make(map[string]curated.ScenarioDef, len(defs))
	covered := make(map[string]bool)
	for _, def := range defs {
		defsBySet[def.VillainSet] = def
		for _, code := range def.Covers {
			covered[code] = true
		}
	}

	scenarios = make(map[string][]pack.Scenario)
	for _, villain := range villains {
		// A covered set keeps its entry when a definition has it as its own
		// villain set.
		if _, defined := defsBySet[villain.set.Code]; covered[villain.set.Code] && !defined {
			continue
		}
		ref := pack.ScenarioRef{
			ID:          villain.set.Code,
			Name:        villain.set.Name,
			Pack:        villain.pack,
			Image:       imageOf(villain.firstCard),
			Recommended: recommendedOf(villain.set.Name, cb, cerebroNames, modularCodes),
		}

		if def, found := defsBySet[villain.set.Code]; found {
			ref.ID = def.ID
			ref.SelfContained = def.SelfContained
			if villain.firstCard == nil {
				ref.Image = imageOf(coveredVillainCard(def, villains))
			}
			missing := missingCards(def, cardsByCode)
			for _, code := range missing {
				problems = append(problems, report.Unsupported{
					Code:   code,
					Name:   villain.set.Name,
					Pack:   villain.pack,
					Reason: fmt.Sprintf("scenario %s names unknown card %s", def.ID, code),
				})
			}
			missingSets := missingDeckSets(def, setCodes)
			for _, code := range missingSets {
				problems = append(problems, report.Unsupported{
					Code:   code,
					Name:   villain.set.Name,
					Pack:   villain.pack,
					Reason: fmt.Sprintf("scenario %s names unknown set %s", def.ID, code),
				})
			}
			if len(missing) == 0 && len(missingSets) == 0 {
				ref.Supported = true
				scenarios[villain.pack] = append(scenarios[villain.pack], pack.Scenario{
					ID:            def.ID,
					Name:          villain.set.Name,
					Pack:          villain.pack,
					VillainSet:    def.VillainSet,
					Piles:         def.Piles,
					Start:         def.Start,
					SetAside:      def.SetAside,
					Decks:         def.Decks,
					SelfContained: def.SelfContained,
					Active:        def.Active,
					Recommended:   ref.Recommended,
				})
			}
		}
		refs = append(refs, ref)
	}

	for _, def := range defs {
		for _, code := range append([]string{def.VillainSet}, def.Covers...) {
			if !slices.ContainsFunc(villains, func(v villainSet) bool { return v.set.Code == code }) {
				problems = append(problems, report.Unsupported{
					Code:   code,
					Name:   def.ID,
					Reason: fmt.Sprintf("scenario %s names unknown villain set %s", def.ID, code),
				})
			}
		}
	}
	return scenarios, refs, problems
}

// coveredVillainCard returns the lowest-code villain or leader card among the sets a
// definition covers, for a scenario whose own villain set has none.
func coveredVillainCard(def curated.ScenarioDef, villains []villainSet) *pack.Card {
	var lowest *pack.Card
	for _, villain := range villains {
		card := villain.firstCard
		if card != nil && slices.Contains(def.Covers, villain.set.Code) && (lowest == nil || card.Code < lowest.Code) {
			lowest = card
		}
	}
	return lowest
}

// villainSetsOf returns the villain and leader sets ordered by the code of their first
// villain card. A set without villain card sorts by its set code.
func villainSetsOf(sets map[string][]pack.Set, cardsByCode map[string]pack.Card) []villainSet {
	var villains []villainSet
	for packCode, packSets := range sets {
		for _, set := range packSets {
			if set.Kind != villainKind && set.Kind != leaderKind {
				continue
			}
			villains = append(villains, villainSet{
				set:       set,
				pack:      packCode,
				firstCard: firstVillainCard(set, cardsByCode),
			})
		}
	}

	slices.SortFunc(villains, func(a, b villainSet) int { return cmp.Compare(a.sortKey(), b.sortKey()) })
	return villains
}

func (v villainSet) sortKey() string {
	if v.firstCard != nil {
		return v.firstCard.Code
	}
	return v.set.Code
}

func firstVillainCard(set pack.Set, cardsByCode map[string]pack.Card) *pack.Card {
	for _, code := range slices.Sorted(slices.Values(set.Cards)) {
		card, found := cardsByCode[code]
		if found && (card.Faces[0].Type == villainKind || card.Faces[0].Type == leaderKind) {
			return &card
		}
	}
	return nil
}

func imageOf(card *pack.Card) string {
	if card == nil || len(card.Faces[0].Images) == 0 {
		return ""
	}
	return card.Faces[0].Images[0]
}

// missingCards returns the sorted codes the definition names that are not in
// the catalog.
func missingCards(def curated.ScenarioDef, cardsByCode map[string]pack.Card) []string {
	var named []string
	for _, pile := range def.Piles {
		named = append(named, pile.Cards...)
	}
	for _, start := range def.Start {
		for _, ref := range start.Top {
			named = append(named, ref.Card)
		}
		for _, ref := range start.InPlay {
			named = append(named, ref.Card)
		}
	}
	named = append(named, def.SetAside...)
	for _, deck := range def.Decks {
		named = append(named, deck.Cards...)
	}

	slices.Sort(named)
	named = slices.Compact(named)
	return slices.DeleteFunc(named, func(code string) bool {
		_, found := cardsByCode[code]
		return found
	})
}

// missingDeckSets returns the sorted set codes the decks of the definition
// name that are not in the catalog.
func missingDeckSets(def curated.ScenarioDef, setCodes map[string]bool) []string {
	var named []string
	for _, deck := range def.Decks {
		named = append(named, deck.Sets...)
	}

	slices.Sort(named)
	named = slices.Compact(named)
	return slices.DeleteFunc(named, func(code string) bool {
		return setCodes[code]
	})
}

// modularCodesByName maps a lower-cased set name to a modular set code. Names
// are not unique (two sets are called "Campaign"): the lowest code wins, so the
// result does not depend on the map iteration order.
func modularCodesByName(sets map[string][]pack.Set) map[string]string {
	codes := make(map[string]string)
	for _, packSets := range sets {
		for _, set := range packSets {
			if set.Kind != modularKind {
				continue
			}
			name := strings.ToLower(set.Name)
			if existing, found := codes[name]; !found || set.Code < existing {
				codes[name] = set.Code
			}
		}
	}
	return codes
}

func cerebroNamesByID(cb []cerebro.Set) map[string]string {
	names := make(map[string]string, len(cb))
	for _, set := range cb {
		names[set.ID] = set.Name
	}
	return names
}

// recommendedOf maps the sets Cerebro recommends for a villain to marvelcdb
// modular set codes. Both lookups go through the set name, the only key the
// two sources share. The result is never nil, so it encodes as [].
func recommendedOf(
	villainName string,
	cb []cerebro.Set,
	cerebroNames map[string]string,
	modularCodes map[string]string,
) []string {
	recommended := []string{}
	for _, set := range cb {
		if !strings.EqualFold(set.Name, villainName) || !strings.Contains(strings.ToLower(set.Type), villainKind) {
			continue
		}
		for _, id := range set.Recommends {
			code, found := modularCodes[strings.ToLower(cerebroNames[id])]
			if found && !slices.Contains(recommended, code) {
				recommended = append(recommended, code)
			}
		}
	}
	return recommended
}
