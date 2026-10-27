package cgbuilder

import (
	"reflect"
	"testing"
)

// joinSite is a cgbuilder site whose pack 51 holds the cards marvelcdb files
// under silk, its pack 52 those of bp: the IDs are swapped.
func joinSite() Site {
	return Site{
		Packs: []Pack{{ID: 51, Name: "Silk"}, {ID: 52, Name: "Black Panther"}},
		Cards: []Card{
			{Pack: 51, Number: 1, Names: []string{"Silk", "Cindy Moon"}},
			{Pack: 51, Number: 2, Names: []string{"Toile de Soie"}},
			{Pack: 51, Number: 40, Names: []string{"Sbire de Mister Negative"}, Set: 900},
			{Pack: 51, Number: 41, Names: []string{"Sbire Démoniaque"}, Set: 900},
			{Pack: 52, Number: 1, Names: []string{"Black Panther", "T'Challa"}},
			{Pack: 52, Number: 2, Names: []string{"Griffes en Vibranium"}},
			{Pack: 52, Number: 3, Names: []string{"Wakanda pour Toujours"}},
		},
		Sets: []Set{{ID: 900, Name: "Démons Intérieurs"}},
	}
}

// joinKnown lists the marvelcdb faces of joinSite, one name untranslated.
func joinKnown() []KnownCard {
	return []KnownCard{
		{Pack: "silk", Number: 1, Set: "silk", Name: "Silk"},
		{Pack: "silk", Number: 1, Set: "silk", Name: "Cindy Moon"},
		{Pack: "silk", Number: 2, Set: "silk", Name: "Toile de soie"}, // case differs
		{Pack: "silk", Number: 40, Set: "inner_demons", Name: "Sbire de Mister Negative"},
		{Pack: "silk", Number: 41, Set: "inner_demons", Name: "Demonic Minion"}, // untranslated
		{Pack: "bp", Number: 1, Set: "black_panther", Name: "Black Panther"},
		{Pack: "bp", Number: 2, Set: "black_panther", Name: "Griffes en Vibranium"},
		{Pack: "bp", Number: 3, Set: "black_panther", Name: "Wakanda Forever!"},
	}
}

func TestJoinMatchesPacksByContent(t *testing.T) {
	got := Join(joinSite(), joinKnown())

	want := Names{
		Packs: map[string]string{"silk": "Silk", "bp": "Black Panther"},
		// Both cards of set 900 belong to inner_demons, even the one whose
		// name does not match.
		Sets: map[string]string{"inner_demons": "Démons Intérieurs"},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("names = %+v, want %+v", got, want)
	}
}

func TestJoinNeedsHalfTheNames(t *testing.T) {
	known := joinKnown()
	// Two of the four silk numbers match: 1 and 40, not 2 and 41.
	known[2].Name = "Silk Web"

	got := Join(joinSite(), known)

	if _, found := got.Packs["silk"]; !found {
		t.Errorf("packs = %v, want silk joined on half its names", got.Packs)
	}

	known[0].Name, known[1].Name = "Soie", "Cindy"
	got = Join(joinSite(), known)

	if _, found := got.Packs["silk"]; found {
		t.Errorf("packs = %v, want silk left out under half its names", got.Packs)
	}
	if len(got.Sets) != 0 {
		t.Errorf("sets = %v, want none without the pack of their cards", got.Sets)
	}
}

func TestJoinSkipsTies(t *testing.T) {
	site := Site{
		Packs: []Pack{{ID: 1, Name: "Boîte de Base"}},
		Cards: []Card{{Pack: 1, Number: 1, Names: []string{"Spider-Man"}}},
	}
	known := []KnownCard{
		{Pack: "core", Number: 1, Name: "Spider-Man"},
		{Pack: "spdr", Number: 1, Name: "Spider-Man"},
	}

	if got := Join(site, known); len(got.Packs) != 0 {
		t.Errorf("packs = %v, want none when two packs match as well", got.Packs)
	}
}

func TestJoinSkipsPackClaimedTwice(t *testing.T) {
	site := joinSite()
	site.Packs = append(site.Packs, Pack{ID: 99, Name: "Silk (réédition)"})
	site.Cards = append(site.Cards, Card{Pack: 99, Number: 1, Names: []string{"Silk"}})

	got := Join(site, joinKnown())

	want := map[string]string{"bp": "Black Panther"}
	if !reflect.DeepEqual(got.Packs, want) {
		t.Errorf("packs = %v, want %v", got.Packs, want)
	}
}

func TestJoinSetNeedsMostCards(t *testing.T) {
	known := joinKnown()
	known[4].Set = "other_set" // the set's two cards now split one to one

	got := Join(joinSite(), known)

	if len(got.Sets) != 0 {
		t.Errorf("sets = %v, want none without a majority", got.Sets)
	}
}

func TestJoinSkipsUnlistedSets(t *testing.T) {
	site := joinSite()
	site.Sets = nil

	if got := Join(site, joinKnown()); len(got.Sets) != 0 {
		t.Errorf("sets = %v, want none without a set name", got.Sets)
	}
}

func TestNormalize(t *testing.T) {
	if got, want := normalize("  Soudard  de l’A.I.M. "), "soudard de l'a.i.m."; got != want {
		t.Errorf("normalize = %q, want %q", got, want)
	}
}
