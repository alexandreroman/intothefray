package build

import (
	"maps"
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
	heroes := buildHeroes(setsFixture(t))

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

	heroes := buildHeroes([]marvelcdb.Card{hero})

	want := []pack.Hero{{Identity: "02001", Set: "hulk"}}
	if !reflect.DeepEqual(heroes["gamma"], want) {
		t.Errorf("got heroes %+v, want %+v", heroes["gamma"], want)
	}
}

func TestBuildSetsListsEachCardOnce(t *testing.T) {
	sets := buildSets(setsFixture(t), corePacks)

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
	sets := buildSets(setsFixture(t), []marvelcdb.Pack{{Code: "other", Position: 2}})

	if len(sets) != 0 {
		t.Errorf("got sets for %v, want none", slices.Collect(maps.Keys(sets)))
	}
}

func TestBuildHeroesEmitsOneHeroWhenBothFacesAreHeroCards(t *testing.T) {
	cards := []marvelcdb.Card{
		{Code: "12001a", TypeCode: "hero", PackCode: "ant", SetCode: "ant_man", LinkedTo: "12001b"},
		{Code: "12001b", TypeCode: "hero", PackCode: "ant", SetCode: "ant_man"},
	}

	heroes := buildHeroes(cards)

	want := []pack.Hero{{Identity: "12001", Set: "ant_man"}}
	if !reflect.DeepEqual(heroes["ant"], want) {
		t.Errorf("got heroes %+v, want %+v", heroes["ant"], want)
	}
}

func TestBuildSetsListsLetteredDistinctCards(t *testing.T) {
	cards := []marvelcdb.Card{
		{Code: "01043a", PackCode: "core", SetCode: "ultron", SetName: "Ultron", SetType: "villain"},
		{Code: "01043d", PackCode: "core", SetCode: "ultron", SetName: "Ultron", SetType: "villain"},
		{Code: "01044", PackCode: "core", SetCode: "ultron", SetName: "Ultron", SetType: "villain"},
	}

	sets := buildSets(cards, corePacks)

	want := []string{"01043a", "01043d", "01044"}
	if got := sets["core"][0].Cards; !slices.Equal(got, want) {
		t.Errorf("got cards %v, want %v", got, want)
	}
}

func TestBuildHeroesUsesCanonicalCodes(t *testing.T) {
	cards := []marvelcdb.Card{
		{Code: "03001a", TypeCode: "hero", PackCode: "gamma", SetCode: "hulk", LinkedTo: "03001b"},
		{Code: "03001b", TypeCode: "alter_ego", PackCode: "gamma", SetCode: "hulk"},
		{Code: "03020a", TypeCode: "obligation", PackCode: "gamma", SetCode: "hulk"},
		{Code: "03020b", TypeCode: "obligation", PackCode: "gamma", SetCode: "hulk"},
	}

	heroes := buildHeroes(cards)

	want := []pack.Hero{{Identity: "03001", Set: "hulk", Obligation: "03020a"}}
	if !reflect.DeepEqual(heroes["gamma"], want) {
		t.Errorf("got heroes %+v, want %+v", heroes["gamma"], want)
	}
}

func TestLinkSideDecksAddsSetsToTheirHeroInPrintedOrder(t *testing.T) {
	invocation := &pack.SideDeck{Label: "Invocation"}
	heroes := map[string][]pack.Hero{
		"drs":  {{Identity: "09001", Set: "doctor_strange"}},
		"core": {{Identity: "01001", Set: "spider_man"}},
	}
	sets := map[string][]pack.Set{
		"drs": {
			{Code: "doctor_strange", Kind: "hero", Cards: []string{"09001"}},
			// Set code order differs from the printed order of the cards.
			{Code: "doctor_strange_a_deck", Kind: "hero_special", Cards: []string{"09040", "09041"}, Side: invocation},
			{Code: "doctor_strange_b_deck", Kind: "hero_special", Cards: []string{"09033", "09032"}, Side: invocation},
			{Code: "doctor_strange_nemesis", Kind: "nemesis", Cards: []string{"09028"}},
		},
		"core": {{Code: "spider_man", Kind: "hero"}},
	}

	if err := linkSideDecks(heroes, sets); err != nil {
		t.Fatal(err)
	}

	want := []string{"doctor_strange_b_deck", "doctor_strange_a_deck"}
	if got := heroes["drs"][0].SideDecks; !slices.Equal(got, want) {
		t.Errorf("got side decks %v, want %v", got, want)
	}
	if got := heroes["core"][0].SideDecks; got != nil {
		t.Errorf("got side decks %v for Spider-Man, want none", got)
	}
}

func TestLinkSideDecksRejectsUnmatchedSets(t *testing.T) {
	side := &pack.SideDeck{Label: "Invocation"}
	tests := []struct {
		name   string
		heroes map[string][]pack.Hero
		want   string
	}{
		{
			"no hero",
			map[string][]pack.Hero{},
			"side deck doctor_strange_invocation_deck matches no hero of pack drs",
		},
		{
			"hero of another pack",
			map[string][]pack.Hero{"core": {{Identity: "01001", Set: "doctor_strange"}}},
			"side deck doctor_strange_invocation_deck matches no hero of pack drs",
		},
		{
			"prefix without separator",
			map[string][]pack.Hero{"drs": {{Identity: "09001", Set: "doctor_strange_in"}}},
			"side deck doctor_strange_invocation_deck matches no hero of pack drs",
		},
		{
			"several heroes",
			map[string][]pack.Hero{"drs": {
				{Identity: "09001", Set: "doctor_strange"},
				{Identity: "09002", Set: "doctor"},
			}},
			"side deck doctor_strange_invocation_deck matches several heroes of pack drs: 09001, 09002",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sets := map[string][]pack.Set{
				"drs": {{Code: "doctor_strange_invocation_deck", Kind: "hero_special", Side: side}},
			}

			err := linkSideDecks(tt.heroes, sets)
			if err == nil || err.Error() != tt.want {
				t.Fatalf("got error %v, want %q", err, tt.want)
			}
		})
	}
}
