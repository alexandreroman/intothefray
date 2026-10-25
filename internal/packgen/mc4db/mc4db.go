// Package mc4db is a client for the mc4db public API, a marvelcdb fork that
// hosts scans of the printed cards in several languages.
package mc4db

import (
	"context"
	"fmt"
	"strings"

	"github.com/alexandreroman/intothefray/internal/packgen/fetch"
	"github.com/alexandreroman/intothefray/internal/packgen/marvelcdb"
)

// BaseURL is the mc4db site. It is a small shared host: the packs link to its
// images and never copy them.
const BaseURL = "https://mc4db.merlindumesnil.net"

// Card holds the mc4db card fields used by the pack build. mc4db shares the
// marvelcdb schema and card codes, but not all pack and set codes. The image
// paths are those of the English scans, relative to BaseURL, e.g.
// "/bundles/cards/EN/core/01004.webp"; the API ignores the locale.
type Card struct {
	marvelcdb.Card
	BackImageSrc string `json:"backimagesrc"` // set for some double-sided cards stored under one code
	// PackCreator names who made the card, e.g. "FFG" for the official cards.
	PackCreator string `json:"pack_creator"`
}

// FetchCards returns the cards of every pack, encounter cards included, from
// the mc4db site at base, i.e. BaseURL.
func FetchCards(ctx context.Context, c *fetch.Client, base string) ([]Card, error) {
	var cards []Card
	if err := c.JSON(ctx, base+"/api/public/cards/?encounter=1", &cards); err != nil {
		return nil, fmt.Errorf("fetch mc4db cards: %w", err)
	}
	return cards, nil
}

// FetchPacks returns every pack, fan-made ones included, from the mc4db site at
// base. mc4db packs share the marvelcdb schema, but not all their codes.
func FetchPacks(ctx context.Context, c *fetch.Client, base string) ([]marvelcdb.Pack, error) {
	var packs []marvelcdb.Pack
	if err := c.JSON(ctx, base+"/api/public/packs/", &packs); err != nil {
		return nil, fmt.Errorf("fetch mc4db packs: %w", err)
	}
	return packs, nil
}

// FrenchImageURL turns the path of an English scan into the URL of the French
// scan, which mc4db stores under FR instead of EN.
func FrenchImageURL(path string) string {
	return BaseURL + strings.Replace(path, "/EN/", "/FR/", 1)
}

// DirectFrenchImageURL is where mc4db stores the French scan of a card it does
// not list, when it has one.
func DirectFrenchImageURL(packCode, code string) string {
	return BaseURL + "/bundles/cards/FR/" + packCode + "/" + code + ".webp"
}
