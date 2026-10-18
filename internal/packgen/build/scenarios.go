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
	modularKind = "modular"
)

// villainSet is a villain set with the pack it belongs to.
type villainSet struct {
	set       pack.Set
	pack      string
	firstCard *pack.Card // lowest-code card whose first face is a villain, if any
}

// BuildScenarios lists a scenario for every villain set and merges the curated
// definitions into the ones whose cards all exist. cards and sets are keyed by
// pack code. The scenario of a villain set belongs to the pack of that set.
// The references are ordered by the code of the first villain card of the set.
//
//nolint:revive // BuildScenarios is the name fixed by the plan.
func BuildScenarios(
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
	villains := villainSetsOf(sets, cardsByCode)
	modularCodes := modularCodesByName(sets)
	cerebroNames := cerebroNamesByID(cb)
	defsBySet := make(map[string]curated.ScenarioDef, len(defs))
	for _, def := range defs {
		defsBySet[def.VillainSet] = def
	}

	scenarios = make(map[string][]pack.Scenario)
	for _, villain := range villains {
		ref := pack.ScenarioRef{
			ID:          villain.set.Code,
			Name:        villain.set.Name,
			Pack:        villain.pack,
			Image:       imageOf(villain.firstCard),
			Recommended: recommendedOf(villain.set.Name, cb, cerebroNames, modularCodes),
		}

		if def, found := defsBySet[villain.set.Code]; found {
			ref.ID = def.ID
			missing := missingCards(def, cardsByCode)
			for _, code := range missing {
				problems = append(problems, report.Unsupported{
					Code:   code,
					Name:   villain.set.Name,
					Pack:   villain.pack,
					Reason: fmt.Sprintf("scenario %s names unknown card %s", def.ID, code),
				})
			}
			if len(missing) == 0 {
				ref.Supported = true
				scenarios[villain.pack] = append(scenarios[villain.pack], pack.Scenario{
					ID:          def.ID,
					Name:        villain.set.Name,
					Pack:        villain.pack,
					VillainSet:  def.VillainSet,
					Piles:       def.Piles,
					Start:       def.Start,
					SetAside:    def.SetAside,
					Recommended: ref.Recommended,
				})
			}
		}
		refs = append(refs, ref)
	}

	for _, def := range defs {
		if !slices.ContainsFunc(villains, func(v villainSet) bool { return v.set.Code == def.VillainSet }) {
			problems = append(problems, report.Unsupported{
				Code:   def.VillainSet,
				Name:   def.ID,
				Reason: fmt.Sprintf("scenario %s names unknown villain set %s", def.ID, def.VillainSet),
			})
		}
	}
	return scenarios, refs, problems
}

// villainSetsOf returns the villain sets ordered by the code of their first
// villain card. A set without villain card sorts by its set code.
func villainSetsOf(sets map[string][]pack.Set, cardsByCode map[string]pack.Card) []villainSet {
	var villains []villainSet
	for packCode, packSets := range sets {
		for _, set := range packSets {
			if set.Kind != villainKind {
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
		if found && card.Faces[0].Type == "villain" {
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

	slices.Sort(named)
	named = slices.Compact(named)
	return slices.DeleteFunc(named, func(code string) bool {
		_, found := cardsByCode[code]
		return found
	})
}

func modularCodesByName(sets map[string][]pack.Set) map[string]string {
	codes := make(map[string]string)
	for _, packSets := range sets {
		for _, set := range packSets {
			if set.Kind == modularKind {
				codes[strings.ToLower(set.Name)] = set.Code
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
