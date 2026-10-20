package build

import (
	"cmp"
	"fmt"
	"maps"
	"slices"
	"strings"

	"github.com/alexandreroman/intothefray/internal/pack"
	"github.com/alexandreroman/intothefray/internal/packgen/marvelcdb"
)

const (
	heroKind        = "hero"
	heroSpecialKind = "hero_special"
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

	canonical := CanonicalCodes(mc)
	setsByCode := make(map[string]*pack.Set)
	packOf := make(map[string]string)
	for _, card := range sortedByCode(mc) {
		code, isCard := canonical[card.Code]
		if !isCard || card.SetCode == "" || !knownPacks[card.PackCode] {
			continue
		}

		set, found := setsByCode[card.SetCode]
		if !found {
			set = &pack.Set{Code: card.SetCode, Name: card.SetName, Kind: card.SetType}
			setsByCode[card.SetCode] = set
			packOf[card.SetCode] = card.PackCode
		}
		if !slices.Contains(set.Cards, code) {
			set.Cards = append(set.Cards, code)
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
	canonical := CanonicalCodes(mc)
	obligations := make(map[string]string) // set code -> lowest obligation code
	existingSets := make(map[string]bool)
	for _, card := range sortedByCode(mc) {
		code, isCard := canonical[card.Code]
		if !isCard {
			continue
		}
		existingSets[card.SetCode] = true
		if _, found := obligations[card.SetCode]; !found && card.TypeCode == "obligation" {
			obligations[card.SetCode] = code
		}
	}

	heroes := make(map[string][]pack.Hero)
	seen := make(map[string]bool)
	for _, card := range sortedByCode(mc) {
		code, isCard := canonical[card.Code]
		if !isCard || card.TypeCode != "hero" {
			continue
		}
		// Both faces of a hero such as Ant-Man (12001a, 12001b) are "hero"
		// cards: emit the identity only once.
		if seen[code] {
			continue
		}
		seen[code] = true

		hero := pack.Hero{
			Identity:   code,
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

// linkSideDecks adds each side-deck set to the hero of the same pack whose set
// code, followed by "_", starts the side-deck set code
// (doctor_strange_invocation_deck goes to doctor_strange). A side-deck set
// that matches no hero, or several, fails the build: setup would leave its
// cards out or give them to the wrong hero.
//
// A hero's side decks follow the printed order of their cards (Hercules'
// Labor deck, 59002-59004, before his Gift deck, 59005-59007).
func linkSideDecks(heroes map[string][]pack.Hero, sets map[string][]pack.Set) error {
	for _, packCode := range slices.Sorted(maps.Keys(sets)) {
		packHeroes := heroes[packCode]
		for _, set := range sideDecksInPrintedOrder(sets[packCode]) {
			var matches []int
			for i, hero := range packHeroes {
				if strings.HasPrefix(set.Code, hero.Set+"_") {
					matches = append(matches, i)
				}
			}
			switch len(matches) {
			case 0:
				return fmt.Errorf("side deck %s matches no hero of pack %s", set.Code, packCode)
			case 1:
				hero := &packHeroes[matches[0]]
				hero.SideDecks = append(hero.SideDecks, set.Code)
			default:
				var identities []string
				for _, i := range matches {
					identities = append(identities, packHeroes[i].Identity)
				}
				return fmt.Errorf("side deck %s matches several heroes of pack %s: %s",
					set.Code, packCode, strings.Join(identities, ", "))
			}
		}
	}
	return nil
}

// sideDecksInPrintedOrder returns the side-deck sets ordered by their lowest
// card code. A set without cards sorts first.
func sideDecksInPrintedOrder(sets []pack.Set) []pack.Set {
	var sideDecks []pack.Set
	for _, set := range sets {
		if set.Side != nil {
			sideDecks = append(sideDecks, set)
		}
	}
	slices.SortStableFunc(sideDecks, func(a, b pack.Set) int {
		return cmp.Compare(lowestCardCode(a), lowestCardCode(b))
	})
	return sideDecks
}

func lowestCardCode(set pack.Set) string {
	if len(set.Cards) == 0 {
		return ""
	}
	return slices.Min(set.Cards)
}

// sortedByCode returns a copy of the cards ordered by code, so that "lowest
// code first" rules and the output order do not depend on the source order.
func sortedByCode(mc []marvelcdb.Card) []marvelcdb.Card {
	sorted := slices.Clone(mc)
	slices.SortStableFunc(sorted, func(a, b marvelcdb.Card) int { return cmp.Compare(a.Code, b.Code) })
	return sorted
}
