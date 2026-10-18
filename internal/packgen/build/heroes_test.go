package build

import (
	"reflect"
	"slices"
	"testing"

	"github.com/alexandreroman/intothefray/internal/pack"
	"github.com/alexandreroman/intothefray/internal/packgen/marvelcdb"
)

func setsFixture(t *testing.T) []marvelcdb.Card {
	t.Helper()
	return readJSON[marvelcdb.Card](t, "testdata/sets_marvelcdb.json")
}

var corePacks = []marvelcdb.Pack{{Code: "core", Name: "Core Set", Position: 1}}

func TestBuildHeroesDerivesObligationAndNemesis(t *testing.T) {
	heroes := BuildHeroes(setsFixture(t))

	want := []pack.Hero{{
		Identity:   "01001",
		Set:        "spider_man",
		Obligation: "01165",
		Nemesis:    "spider_man_nemesis",
	}}
	if !reflect.DeepEqual(heroes["core"], want) {
		t.Errorf("got heroes %+v, want %+v", heroes["core"], want)
	}
}

func TestBuildHeroesOmitsMissingNemesisAndObligation(t *testing.T) {
	hero := marvelcdb.Card{Code: "02001a", TypeCode: "hero", PackCode: "gamma", SetCode: "hulk"}

	heroes := BuildHeroes([]marvelcdb.Card{hero})

	want := []pack.Hero{{Identity: "02001", Set: "hulk"}}
	if !reflect.DeepEqual(heroes["gamma"], want) {
		t.Errorf("got heroes %+v, want %+v", heroes["gamma"], want)
	}
}

func TestBuildSetsListsEachCardOnce(t *testing.T) {
	sets := BuildSets(setsFixture(t), corePacks)

	var rhino pack.Set
	for _, set := range sets["core"] {
		if set.Code == "rhino" {
			rhino = set
		}
	}
	want := pack.Set{
		Code: "rhino",
		Name: "Rhino",
		Kind: "villain",
		Cards: []string{
			"01094", "01095", "01096", "01097", "01098", "01099", "01100",
			"01101", "01102", "01103", "01104", "01105", "01106", "01107", "01108",
		},
	}
	if !reflect.DeepEqual(rhino, want) {
		t.Errorf("got set %+v, want %+v", rhino, want)
	}
}

func TestBuildSetsIgnoresUnknownPacks(t *testing.T) {
	sets := BuildSets(setsFixture(t), []marvelcdb.Pack{{Code: "other", Position: 2}})

	if len(sets) != 0 {
		t.Errorf("got sets for %v, want none", slices.Collect(keys(sets)))
	}
}

func keys[V any](m map[string]V) func(func(string) bool) {
	return func(yield func(string) bool) {
		for key := range m {
			if !yield(key) {
				return
			}
		}
	}
}

func TestBuildHeroesEmitsOneHeroWhenBothFacesAreHeroCards(t *testing.T) {
	cards := []marvelcdb.Card{
		{Code: "12001a", TypeCode: "hero", PackCode: "ant", SetCode: "ant_man"},
		{Code: "12001b", TypeCode: "hero", PackCode: "ant", SetCode: "ant_man"},
	}

	heroes := BuildHeroes(cards)

	want := []pack.Hero{{Identity: "12001", Set: "ant_man"}}
	if !reflect.DeepEqual(heroes["ant"], want) {
		t.Errorf("got heroes %+v, want %+v", heroes["ant"], want)
	}
}
