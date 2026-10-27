// Package mc4db is a client for the mc4db public API, a marvelcdb fork that
// hosts scans of the printed cards in several languages.
package mc4db

import (
	"context"
	"fmt"
	"maps"
	"slices"

	"github.com/alexandreroman/intothefray/internal/packgen/fetch"
	"github.com/alexandreroman/intothefray/internal/packgen/marvelcdb"
)

// BaseURL is the mc4db site. It is a small shared host: the packs never link to
// its images, which reach the image CDN through the intothefray-img pipeline.
const BaseURL = "https://mc4db.merlindumesnil.net"

// Card holds the mc4db card fields used by the pack build. mc4db shares the
// marvelcdb schema and card codes, but not all pack and set codes. The image
// paths are those of the English scans, relative to BaseURL, e.g.
// "/bundles/cards/EN/core/01004.webp", whatever the locale: the locale changes
// the names only.
type Card struct {
	marvelcdb.Card
	BackImageSrc string `json:"backimagesrc"` // set for some double-sided cards stored under one code
	// PackCreator names who made the card, e.g. "FFG" for the official cards.
	PackCreator string `json:"pack_creator"`
}

// Set is an mc4db encounter or hero set.
type Set struct {
	Code string `json:"code"`
	Name string `json:"name"`
}

// FetchCards returns the cards of every pack, encounter cards included, from
// the mc4db site at base, i.e. BaseURL.
func FetchCards(ctx context.Context, c *fetch.Client, base string) ([]Card, error) {
	return fetchCards(ctx, c, base+"/api/public/cards/?encounter=1")
}

// FetchFrenchCards returns the same cards as FetchCards, with their name and
// subname in French where mc4db has them, in English otherwise.
func FetchFrenchCards(ctx context.Context, c *fetch.Client, base string) ([]Card, error) {
	return fetchCards(ctx, c, base+"/api/public/cards/?encounter=1&locale=fr")
}

func fetchCards(ctx context.Context, c *fetch.Client, url string) ([]Card, error) {
	var cards []Card
	if err := c.JSON(ctx, url, &cards); err != nil {
		return nil, fmt.Errorf("fetch mc4db cards: %w", err)
	}
	return cards, nil
}

// FetchPacks returns every pack, fan-made ones included, from the mc4db site at
// base. mc4db packs share the marvelcdb schema, but not all their codes.
func FetchPacks(ctx context.Context, c *fetch.Client, base string) ([]marvelcdb.Pack, error) {
	return fetchPacks(ctx, c, base+"/api/public/packs/")
}

// FetchFrenchPacks returns the same packs as FetchPacks, named in French where
// mc4db has a French name.
func FetchFrenchPacks(ctx context.Context, c *fetch.Client, base string) ([]marvelcdb.Pack, error) {
	return fetchPacks(ctx, c, base+"/api/public/packs/?locale=fr")
}

func fetchPacks(ctx context.Context, c *fetch.Client, url string) ([]marvelcdb.Pack, error) {
	var packs []marvelcdb.Pack
	if err := c.JSON(ctx, url, &packs); err != nil {
		return nil, fmt.Errorf("fetch mc4db packs: %w", err)
	}
	return packs, nil
}

// FetchFrenchSets returns the sets of the official packs, named in French where
// mc4db has a French name. Their codes are mc4db codes, e.g.
// "purple_man_by_ffg". The fan-made sets are left out.
func FetchFrenchSets(ctx context.Context, c *fetch.Client, base string) ([]Set, error) {
	// The sets come grouped by kind, e.g. "hero" or "villain", under each
	// creator.
	var groups struct {
		Official map[string][]Set `json:"official"`
	}
	if err := c.JSON(ctx, base+"/api/public/sets?locale=fr", &groups); err != nil {
		return nil, fmt.Errorf("fetch mc4db sets: %w", err)
	}
	var sets []Set
	for _, kind := range slices.Sorted(maps.Keys(groups.Official)) {
		sets = append(sets, groups.Official[kind]...)
	}
	return sets, nil
}
