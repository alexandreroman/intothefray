package cgbuilder

import (
	"maps"
	"slices"
	"strings"
)

// KnownCard is one face of a marvelcdb card, with its French name as the other
// sources give it.
type KnownCard struct {
	Pack   string // marvelcdb pack code
	Number int    // number in the pack, e.g. 1 for 50001a
	Set    string // marvelcdb set code
	Name   string // French name, else English
}

// Names holds French names by marvelcdb code.
type Names struct {
	Packs map[string]string
	Sets  map[string]string
}

// Join names the marvelcdb packs and sets after their cgbuilder ones.
//
// cgbuilder pack IDs are not marvelcdb positions: most match, some are
// swapped. A cgbuilder pack is joined to a marvelcdb pack by content, comparing
// the names of the cards of the same number: it takes the marvelcdb pack whose
// names match most of its card numbers, when they are at least half of them
// and more than any other pack matches. A cgbuilder pack without such a match,
// or whose match is also another cgbuilder pack's, is left out.
//
// A cgbuilder set takes the marvelcdb set of most of its cards in the joined
// packs, when more than half of them belong to it. A marvelcdb set that two
// cgbuilder sets would name is left out.
func Join(site Site, known []KnownCard) Names {
	index := newKnownIndex(known)
	packMatches := make(map[int]string) // marvelcdb pack code by cgbuilder pack ID
	packClaims := make(map[string]int)  // cgbuilder packs per marvelcdb pack
	for id, numbers := range cardsByPack(site.Cards) {
		if code, found := index.bestPack(numbers); found {
			packMatches[id] = code
			packClaims[code]++
		}
	}

	names := Names{Packs: make(map[string]string), Sets: make(map[string]string)}
	for _, p := range site.Packs {
		code, found := packMatches[p.ID]
		if found && packClaims[code] == 1 {
			names.Packs[code] = p.Name
		}
	}

	setNames := make(map[int]string, len(site.Sets))
	for _, set := range site.Sets {
		setNames[set.ID] = set.Name
	}
	setClaims := make(map[string]int) // cgbuilder sets per marvelcdb set
	setMatches := make(map[int]string)
	for id, code := range index.setCodes(site.Cards, packMatches) {
		if _, listed := setNames[id]; listed {
			setMatches[id] = code
			setClaims[code]++
		}
	}
	for id, code := range setMatches {
		if setClaims[code] == 1 {
			names.Sets[code] = setNames[id]
		}
	}
	return names
}

// cardsByPack groups the face names of the cards by cgbuilder pack and number.
func cardsByPack(cards []Card) map[int]map[int][]string {
	packs := make(map[int]map[int][]string)
	for _, card := range cards {
		if packs[card.Pack] == nil {
			packs[card.Pack] = make(map[int][]string)
		}
		packs[card.Pack][card.Number] = append(packs[card.Pack][card.Number], card.Names...)
	}
	return packs
}

// knownIndex indexes the known faces by marvelcdb pack and number.
type knownIndex struct {
	names map[string]map[int]map[string]bool // normalized names
	sets  map[string]map[int][]string        // set codes
}

func newKnownIndex(known []KnownCard) knownIndex {
	index := knownIndex{
		names: make(map[string]map[int]map[string]bool),
		sets:  make(map[string]map[int][]string),
	}
	for _, card := range known {
		if index.names[card.Pack] == nil {
			index.names[card.Pack] = make(map[int]map[string]bool)
			index.sets[card.Pack] = make(map[int][]string)
		}
		if index.names[card.Pack][card.Number] == nil {
			index.names[card.Pack][card.Number] = make(map[string]bool)
		}
		index.names[card.Pack][card.Number][normalize(card.Name)] = true
		if card.Set != "" && !slices.Contains(index.sets[card.Pack][card.Number], card.Set) {
			index.sets[card.Pack][card.Number] = append(index.sets[card.Pack][card.Number], card.Set)
		}
	}
	return index
}

// bestPack returns the marvelcdb pack whose names match those of numbers, the
// face names of one cgbuilder pack by number, false without a clear match.
func (k knownIndex) bestPack(numbers map[int][]string) (string, bool) {
	var best string
	bestCount, runnerUpCount := 0, 0
	// Sorted, so that the result does not depend on the map order.
	for _, code := range slices.Sorted(maps.Keys(k.names)) {
		count := k.matchCount(code, numbers)
		switch {
		case count > bestCount:
			best, bestCount, runnerUpCount = code, count, bestCount
		case count > runnerUpCount:
			runnerUpCount = count
		}
	}
	if bestCount == 0 || bestCount*2 < len(numbers) || bestCount == runnerUpCount {
		return "", false
	}
	return best, true
}

// matchCount counts the numbers of a cgbuilder pack where a face name equals
// a known name of the same number in the marvelcdb pack code.
func (k knownIndex) matchCount(code string, numbers map[int][]string) int {
	count := 0
	for number, cardNames := range numbers {
		known := k.names[code][number]
		if slices.ContainsFunc(cardNames, func(name string) bool { return known[normalize(name)] }) {
			count++
		}
	}
	return count
}

// setCodes maps each cgbuilder set to the marvelcdb set of more than half of
// its cards in the joined packs. packMatches maps a cgbuilder pack ID to its
// marvelcdb pack code.
func (k knownIndex) setCodes(cards []Card, packMatches map[int]string) map[int]string {
	votes := make(map[int]map[string]int) // marvelcdb sets by cgbuilder set
	totals := make(map[int]int)           // cards by cgbuilder set
	for _, card := range cards {
		code, joined := packMatches[card.Pack]
		if card.Set == 0 || !joined {
			continue
		}
		totals[card.Set]++
		if votes[card.Set] == nil {
			votes[card.Set] = make(map[string]int)
		}
		for _, setCode := range k.sets[code][card.Number] {
			votes[card.Set][setCode]++
		}
	}

	codes := make(map[int]string)
	for id, setVotes := range votes {
		// Sorted, in case a card of two sets makes two of them pass.
		for _, setCode := range slices.Sorted(maps.Keys(setVotes)) {
			if setVotes[setCode]*2 > totals[id] {
				codes[id] = setCode
				break
			}
		}
	}
	return codes
}

// normalize makes two spellings of a name compare equal when they differ only
// by case, spacing or the kind of apostrophe.
func normalize(name string) string {
	name = strings.ReplaceAll(name, "’", "'")
	return strings.ToLower(strings.Join(strings.Fields(name), " "))
}
