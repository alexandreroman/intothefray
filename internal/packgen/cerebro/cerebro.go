// Package cerebro is a client for the Cerebro card database API.
package cerebro

import (
	"context"
	"fmt"

	"github.com/alexandreroman/intothefray/internal/packgen/fetch"
)

const baseURL = "https://cerebro-beta-bot.herokuapp.com"

// Card is a Cerebro card. GroupID is null for cards outside a group.
type Card struct {
	ID        string     `json:"Id"`
	Name      string     `json:"Name"`
	Type      string     `json:"Type"`
	Stage     string     `json:"Stage"`
	GroupID   *string    `json:"GroupId"`
	Printings []Printing `json:"Printings"`
}

// Printing links a card to the pack and set it was printed in.
type Printing struct {
	ArtificialID string `json:"ArtificialId"`
	PackID       string `json:"PackId"`
	SetID        string `json:"SetId"`
}

// Set is a Cerebro card set. Recommends is null for sets without suggestions.
type Set struct {
	ID         string   `json:"Id"`
	Name       string   `json:"Name"`
	Type       string   `json:"Type"`
	PackID     string   `json:"PackId"`
	Recommends []string `json:"Recommends"`
}

// Pack is a Cerebro pack.
type Pack struct {
	ID   string `json:"Id"`
	Name string `json:"Name"`
}

// FetchCards returns every card.
func FetchCards(ctx context.Context, c *fetch.Client) ([]Card, error) {
	return fetchList[Card](ctx, c, baseURL, "cards")
}

// FetchSets returns every set.
func FetchSets(ctx context.Context, c *fetch.Client) ([]Set, error) {
	return fetchList[Set](ctx, c, baseURL, "sets")
}

// FetchPacks returns every pack.
func FetchPacks(ctx context.Context, c *fetch.Client) ([]Pack, error) {
	return fetchList[Pack](ctx, c, baseURL, "packs")
}

// The base URL is a parameter so tests can target a local server.
func fetchList[T any](ctx context.Context, c *fetch.Client, base, resource string) ([]T, error) {
	var items []T
	if err := c.JSON(ctx, base+"/"+resource, &items); err != nil {
		return nil, fmt.Errorf("fetch cerebro %s: %w", resource, err)
	}
	return items, nil
}
