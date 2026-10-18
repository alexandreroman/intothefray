package build

import (
	"cmp"
	"slices"

	"github.com/alexandreroman/intothefray/internal/pack"
	"github.com/alexandreroman/intothefray/internal/packgen/marvelcdb"
)

// BuildSets groups the marvelcdb cards into their sets and returns them by
// pack code, sorted by set code. A set belongs to the pack of its lowest-code
// card, and lists each card once under its canonical code. Cards of packs
// missing from mcPacks are ignored.
//
//nolint:revive // BuildSets is the name fixed by the plan.
func BuildSets(mc []marvelcdb.Card, mcPacks []marvelcdb.Pack) map[string][]pack.Set {
	knownPacks := make(map[string]bool, len(mcPacks))
	for _, mcPack := range mcPacks {
		knownPacks[mcPack.Code] = true
	}

	setsByCode := make(map[string]*pack.Set)
	packOf := make(map[string]string)
	for _, card := range sortedByCode(mc) {
		if card.DuplicateOf != "" || card.SetCode == "" || !knownPacks[card.PackCode] {
			continue
		}

		set, found := setsByCode[card.SetCode]
		if !found {
			set = &pack.Set{Code: card.SetCode, Name: card.SetName, Kind: card.SetType}
			setsByCode[card.SetCode] = set
			packOf[card.SetCode] = card.PackCode
		}
		if base := baseCode(card.Code); !slices.Contains(set.Cards, base) {
			set.Cards = append(set.Cards, base)
		}
	}

	sets := make(map[string][]pack.Set)
	for code, set := range setsByCode {
		sets[packOf[code]] = append(sets[packOf[code]], *set)
	}
	for _, packSets := range sets {
		slices.SortFunc(packSets, func(a, b pack.Set) int { return cmp.Compare(a.Code, b.Code) })
	}
	return sets
}

// BuildHeroes derives one hero per card having a hero face and returns them by
// the pack code of that card, sorted by identity code.
//
//nolint:revive // BuildHeroes is the name fixed by the plan.
func BuildHeroes(mc []marvelcdb.Card) map[string][]pack.Hero {
	obligations := make(map[string]string) // set code -> lowest obligation code
	existingSets := make(map[string]bool)
	for _, card := range sortedByCode(mc) {
		if card.DuplicateOf != "" {
			continue
		}
		existingSets[card.SetCode] = true
		if _, found := obligations[card.SetCode]; !found && card.TypeCode == "obligation" {
			obligations[card.SetCode] = baseCode(card.Code)
		}
	}

	heroes := make(map[string][]pack.Hero)
	for _, card := range sortedByCode(mc) {
		if card.DuplicateOf != "" || card.TypeCode != "hero" {
			continue
		}

		hero := pack.Hero{
			Identity:   baseCode(card.Code),
			Set:        card.SetCode,
			Obligation: obligations[card.SetCode],
		}
		if nemesisSet := card.SetCode + "_nemesis"; existingSets[nemesisSet] {
			hero.Nemesis = nemesisSet
		}
		heroes[card.PackCode] = append(heroes[card.PackCode], hero)
	}
	return heroes
}

// sortedByCode returns a copy of the cards ordered by code, so that "lowest
// code first" rules and the output order do not depend on the source order.
func sortedByCode(mc []marvelcdb.Card) []marvelcdb.Card {
	sorted := slices.Clone(mc)
	slices.SortStableFunc(sorted, func(a, b marvelcdb.Card) int { return cmp.Compare(a.Code, b.Code) })
	return sorted
}
