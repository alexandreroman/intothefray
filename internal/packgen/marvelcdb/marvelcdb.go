// Package marvelcdb is a client for the marvelcdb.com public API.
package marvelcdb

import (
	"context"
	"fmt"

	"github.com/alexandreroman/intothefray/internal/packgen/fetch"
)

const baseURL = "https://marvelcdb.com"

// Card holds the marvelcdb card fields used by the pack build.
type Card struct {
	Code            string `json:"code"`
	Name            string `json:"name"`
	Subname         string `json:"subname"`
	TypeCode        string `json:"type_code"`
	PackCode        string `json:"pack_code"`
	SetCode         string `json:"card_set_code"`
	SetName         string `json:"card_set_name"`
	SetType         string `json:"card_set_type_name_code"`
	Stage           string `json:"stage"`
	ImageSrc        string `json:"imagesrc"`
	DuplicateOf     string `json:"duplicate_of_code"`
	LinkedTo        string `json:"linked_to_code"`
	Quantity        int    `json:"quantity"`
	HandSize        int    `json:"hand_size"`
	BaseThreat      *int   `json:"base_threat"`
	BaseThreatFixed bool   `json:"base_threat_fixed"`
}

// Pack describes a marvelcdb pack.
type Pack struct {
	Code     string `json:"code"`
	Name     string `json:"name"`
	Position int    `json:"position"`
}

// FetchCards returns the encounter cards of every pack.
func FetchCards(ctx context.Context, c *fetch.Client) ([]Card, error) {
	return fetchCards(ctx, c, baseURL)
}

// FetchPacks returns every pack.
func FetchPacks(ctx context.Context, c *fetch.Client) ([]Pack, error) {
	return fetchPacks(ctx, c, baseURL)
}

// The base URL is a parameter so tests can target a local server.
func fetchCards(ctx context.Context, c *fetch.Client, base string) ([]Card, error) {
	var cards []Card
	if err := c.JSON(ctx, base+"/api/public/cards/?encounter=1", &cards); err != nil {
		return nil, fmt.Errorf("fetch marvelcdb cards: %w", err)
	}
	return cards, nil
}

func fetchPacks(ctx context.Context, c *fetch.Client, base string) ([]Pack, error) {
	var packs []Pack
	if err := c.JSON(ctx, base+"/api/public/packs/", &packs); err != nil {
		return nil, fmt.Errorf("fetch marvelcdb packs: %w", err)
	}
	return packs, nil
}
