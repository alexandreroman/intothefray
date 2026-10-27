// Package cgbuilder reads the French pack and set names of mc.cgbuilder.fr, a
// French fan site that lists the cards under their official French names. The
// site has no API: its HTML pages are parsed.
package cgbuilder

import (
	"context"
	"errors"
	"fmt"
	"html"
	"regexp"
	"strconv"
	"strings"

	"github.com/alexandreroman/intothefray/internal/packgen/fetch"
)

// BaseURL is the cgbuilder site of Marvel Champions.
const BaseURL = "https://mc.cgbuilder.fr"

// variantNumbers is where the numbers of the alternate printings of a card
// start: the k-th printing of card n is numbered 1000·k+n, e.g. 1043, 2043 and
// 3043 for card 43 of the core set, 11184 for card 184. A pack has fewer than
// 1000 cards.
const variantNumbers = 1000

// ErrNoCard is the error of a card list page without any card.
var ErrNoCard = errors.New("no card found on the card list page")

// Pack is a cgbuilder pack. Its ID is not tied to the marvelcdb pack codes or
// positions, though it often matches the position.
type Pack struct {
	ID   int
	Name string
}

// Card is one card of a cgbuilder pack, numbered as in its pack.
type Card struct {
	Pack   int
	Number int
	// Names holds the French name of each face of the card; the site names a
	// double-sided card "Tigra | Greer Nelson".
	Names []string
	// Set is the ID of the encounter set of the card, 0 for a player card.
	Set int
}

// Set is a cgbuilder modular set.
type Set struct {
	ID   int
	Name string
}

// Site holds what the generator reads from cgbuilder.
type Site struct {
	Packs []Pack
	Cards []Card
	Sets  []Set
}

var (
	// packLink is a pack of the cycle page, its name in the alt text of its
	// picture: <a href=".../liste_carte/50/"><img src="..." alt="Agents du SHIELD" .../>.
	packLink = regexp.MustCompile(`<a href="[^"]*/liste_carte/(\d+)/"><img [^>]*alt="([^"]*)"`)
	// cardTag is the opening tag of a card of a card list, which shows the card
	// details on hover: onmouseover="afficherInfoBulle(this, 50, 1);".
	cardTag = regexp.MustCompile(`<div [^>]*onmouseover="afficherInfoBulle\(this, (\d+), (\d+)\);"[^>]*>`)
	// cardSet is the encounter set class of a card tag.
	cardSet = regexp.MustCompile(`\bid_set_rencontre_(\d+)\b`)
	// cardName is the name a card tag passes to its share box, a JavaScript
	// string whose quotes are escaped: afficherPartageCarte(event, 'Soldat de l\'A.I.M.', 50, 73).
	cardName = regexp.MustCompile(`afficherPartageCarte\(event, '((?:[^'\\]|\\.)*)'`)
	// setLink is a set of the modular set page:
	// <a id="a_1103" href=".../set_modulaire/1103/">Tueurs de Capes</a>.
	setLink = regexp.MustCompile(`<a id="a_(\d+)" href="[^"]*/set_modulaire/\d+/">([^<]*)</a>`)
)

// Fetch reads the packs, their cards and the modular sets from the cgbuilder
// site at base, i.e. BaseURL. It asks for one page at a time, one per pack and
// two more, to spare the site. A pack whose page lists no card, e.g. one
// announced before its release, is skipped and its page left out of the cache,
// so the next run reads it again; Fetch fails when no pack has any card.
func Fetch(ctx context.Context, c *fetch.Client, base string) (Site, error) {
	var site Site
	var err error

	if site.Packs, err = fetchPage(ctx, c, base+"/cycle/", ParsePacks); err != nil {
		return Site{}, fmt.Errorf("cgbuilder packs: %w", err)
	}

	for _, p := range site.Packs {
		cards, err := fetchPage(ctx, c, fmt.Sprintf("%s/liste_carte/%d/", base, p.ID), ParseCards)
		if errors.Is(err, ErrNoCard) {
			continue
		}
		if err != nil {
			return Site{}, fmt.Errorf("cgbuilder pack %d: %w", p.ID, err)
		}
		site.Cards = append(site.Cards, cards...)
	}
	if len(site.Cards) == 0 {
		return Site{}, errors.New("cgbuilder packs: no card found on any card list page")
	}

	if site.Sets, err = fetchPage(ctx, c, base+"/set_modulaire/", ParseSets); err != nil {
		return Site{}, fmt.Errorf("cgbuilder sets: %w", err)
	}
	return site, nil
}

// fetchPage returns what parse reads from the page at url. The page is cached
// only when parse accepts it, so a page of an unexpected layout, e.g. a
// maintenance page, is never replayed.
func fetchPage[T any](ctx context.Context, c *fetch.Client, url string, parse func([]byte) (T, error)) (T, error) {
	var parsed T
	check := func(page []byte) error {
		var err error
		parsed, err = parse(page)
		return err
	}
	if _, err := c.Bytes(ctx, url, check); err != nil {
		var zero T
		return zero, err
	}
	return parsed, nil
}

// ParsePacks returns the packs of the cycle page. A page without any pack
// fails, as the site layout has likely changed.
func ParsePacks(page []byte) ([]Pack, error) {
	var packs []Pack
	for _, match := range packLink.FindAllSubmatch(page, -1) {
		id, err := strconv.Atoi(string(match[1]))
		if err != nil {
			return nil, fmt.Errorf("pack id %q: %w", match[1], err)
		}
		packs = append(packs, Pack{ID: id, Name: html.UnescapeString(string(match[2]))})
	}
	if len(packs) == 0 {
		return nil, errors.New("no pack found on the cycle page")
	}
	return packs, nil
}

// ParseCards returns the cards of a card list page, the alternate printings
// left out. A page without any card fails with ErrNoCard.
func ParseCards(page []byte) ([]Card, error) {
	var cards []Card
	for _, tag := range cardTag.FindAllSubmatch(page, -1) {
		card, err := parseCard(tag)
		if err != nil {
			return nil, err
		}
		if card.Number < variantNumbers {
			cards = append(cards, card)
		}
	}
	if len(cards) == 0 {
		return nil, ErrNoCard
	}
	return cards, nil
}

// parseCard reads one card from the submatches of cardTag.
func parseCard(tag [][]byte) (Card, error) {
	packID, err := strconv.Atoi(string(tag[1]))
	if err != nil {
		return Card{}, fmt.Errorf("card pack %q: %w", tag[1], err)
	}
	number, err := strconv.Atoi(string(tag[2]))
	if err != nil {
		return Card{}, fmt.Errorf("card number %q: %w", tag[2], err)
	}
	card := Card{Pack: packID, Number: number}

	name := cardName.FindSubmatch(tag[0])
	if name == nil {
		return Card{}, fmt.Errorf("card %d of pack %d has no name", number, packID)
	}
	for _, faceName := range strings.Split(unescapeName(string(name[1])), " | ") {
		card.Names = append(card.Names, strings.TrimSpace(faceName))
	}

	if set := cardSet.FindSubmatch(tag[0]); set != nil {
		if card.Set, err = strconv.Atoi(string(set[1])); err != nil {
			return Card{}, fmt.Errorf("card %d of pack %d set %q: %w", number, packID, set[1], err)
		}
	}
	return card, nil
}

// unescapeName turns a JavaScript string from an HTML attribute into text: the
// attribute escapes HTML, the string escapes its backslashes and quotes.
func unescapeName(quoted string) string {
	text := html.UnescapeString(quoted)
	var unquoted strings.Builder
	escaped := false
	for _, r := range text {
		if r == '\\' && !escaped {
			escaped = true
			continue
		}
		escaped = false
		unquoted.WriteRune(r)
	}
	return unquoted.String()
}

// ParseSets returns the sets of the modular set page. A page without any set
// fails, as the site layout has likely changed.
func ParseSets(page []byte) ([]Set, error) {
	var sets []Set
	for _, match := range setLink.FindAllSubmatch(page, -1) {
		id, err := strconv.Atoi(string(match[1]))
		if err != nil {
			return nil, fmt.Errorf("set id %q: %w", match[1], err)
		}
		name := strings.TrimSpace(html.UnescapeString(string(match[2])))
		sets = append(sets, Set{ID: id, Name: name})
	}
	if len(sets) == 0 {
		return nil, errors.New("no set found on the modular set page")
	}
	return sets, nil
}
