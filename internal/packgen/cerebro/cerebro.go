// Package cerebro is a client for the Cerebro card database API.
package cerebro

import (
	"context"
	"fmt"

	"github.com/alexandreroman/intothefray/internal/packgen/fetch"
)

// BaseURL is the Cerebro API.
const BaseURL = "https://cerebro-beta-bot.herokuapp.com"

// imageURL is the format of the URL of a Cerebro card image, given its id.
const imageURL = "https://pub-d27e6715f4ba4529bc9d8fd13938a5a1.r2.dev/cerebro-cards/official/%s.jpg"

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

// FetchCards returns every card from the Cerebro API at base, e.g. BaseURL.
func FetchCards(ctx context.Context, c *fetch.Client, base string) ([]Card, error) {
	var cards []Card
	if err := c.JSON(ctx, base+"/cards", &cards); err != nil {
		return nil, fmt.Errorf("fetch cerebro cards: %w", err)
	}
	return cards, nil
}

// FetchSets returns every set from the Cerebro API at base.
func FetchSets(ctx context.Context, c *fetch.Client, base string) ([]Set, error) {
	var sets []Set
	if err := c.JSON(ctx, base+"/sets", &sets); err != nil {
		return nil, fmt.Errorf("fetch cerebro sets: %w", err)
	}
	return sets, nil
}

// ImageURL returns the URL of the image of the Cerebro card with this id, as
// Cerebro spells it.
func ImageURL(id string) string {
	return fmt.Sprintf(imageURL, id)
}
