// Package cerebro is a client for the Cerebro card database API.
package cerebro

import (
	"context"
	"fmt"

	"github.com/alexandreroman/intothefray/internal/packgen/fetch"
)

const baseURL = "https://cerebro-beta-bot.herokuapp.com"

// Card is a Cerebro card. Only its ID is used: it names the card image.
type Card struct {
	ID string `json:"Id"`
}

// Set is a Cerebro card set. Recommends is null for sets without suggestions.
type Set struct {
	ID         string   `json:"Id"`
	Name       string   `json:"Name"`
	Type       string   `json:"Type"`
	Recommends []string `json:"Recommends"`
}

// FetchCards returns every card.
func FetchCards(ctx context.Context, c *fetch.Client) ([]Card, error) {
	return fetchList[Card](ctx, c, baseURL, "cards")
}

// FetchSets returns every set.
func FetchSets(ctx context.Context, c *fetch.Client) ([]Set, error) {
	return fetchList[Set](ctx, c, baseURL, "sets")
}

// The base URL is a parameter so tests can target a local server.
func fetchList[T any](ctx context.Context, c *fetch.Client, base, resource string) ([]T, error) {
	var items []T
	if err := c.JSON(ctx, base+"/"+resource, &items); err != nil {
		return nil, fmt.Errorf("fetch cerebro %s: %w", resource, err)
	}
	return items, nil
}
