// Package decks imports player decks from external deck builders.
package decks

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/alexandreroman/intothefray/internal/game"
	"github.com/alexandreroman/intothefray/internal/pack"
)

const (
	requestTimeout = 10 * time.Second
	// importTimeout bounds a whole import, including the card lookups.
	importTimeout = 20 * time.Second
	// maxCardLookups caps the requests made to name unsupported cards.
	maxCardLookups = 20
	// maxQty is the engine's limit of copies of one card.
	maxQty = 20
	// maxSlots is far above any real deck and bounds the work per import.
	maxSlots = 200
	// maxBodyBytes bounds what we read from marvelcdb; real decks are a few KiB.
	maxBodyBytes = 1 << 20
)

// ErrLink is returned when the link is not a marvelcdb deck link.
var ErrLink = errors.New("not a marvelcdb deck link")

// ErrNotFound covers every way marvelcdb tells us a deck does not exist or
// is not public. Other failures of marvelcdb are transient and wrap no
// sentinel error.
var ErrNotFound = errors.New("deck not found or not public")

// ErrInvalidDeck is returned when the deck has an impossible shape.
var ErrInvalidDeck = errors.New("invalid deck")

// defaultClient is used when Importer.HTTP is nil.
var defaultClient = &http.Client{Timeout: requestTimeout}

// Unsupported is a deck card missing from the card catalog.
type Unsupported struct {
	Code string `json:"code"`
	Name string `json:"name"`
	Pack string `json:"pack"`
	Qty  int    `json:"qty"`
}

// UnsupportedError lists the cards of a deck that the catalog cannot resolve.
type UnsupportedError struct {
	Cards []Unsupported
}

func (e *UnsupportedError) Error() string {
	return fmt.Sprintf("%d cards aren't supported", len(e.Cards))
}

// Importer fetches decks from marvelcdb.
type Importer struct {
	BaseURL string       // e.g. https://marvelcdb.com
	HTTP    *http.Client // defaults to a client with a 10 s timeout
}

// deckPayload is the part of a marvelcdb deck we use.
type deckPayload struct {
	Name     string         `json:"name"`
	HeroCode string         `json:"hero_code"`
	HeroName string         `json:"hero_name"`
	Slots    map[string]int `json:"slots"`
}

// deckRef identifies a marvelcdb deck.
type deckRef struct {
	kind string // "decklist" (published) or "deck" (private, shared by link)
	id   string
}

// apiPath is the path of the deck in the marvelcdb public API.
func (ref deckRef) apiPath() string {
	return "/api/public/" + ref.kind + "/" + ref.id
}

// pagePath is the canonical path of the deck page on marvelcdb.
func (ref deckRef) pagePath() string {
	return "/" + ref.kind + "/view/" + ref.id
}

// Import turns a marvelcdb deck link into a deck choice. Cards that the
// catalog does not know make it fail with an *UnsupportedError.
func (im *Importer) Import(ctx context.Context, link string, cat *pack.Catalog) (game.DeckChoice, error) {
	ref, err := parseLink(link)
	if err != nil {
		return game.DeckChoice{}, err
	}
	ctx, cancel := context.WithTimeout(ctx, importTimeout)
	defer cancel()

	deck, err := im.fetchDeck(ctx, ref.apiPath())
	if err != nil {
		return game.DeckChoice{}, err
	}

	choice := game.DeckChoice{
		// The link as given may carry a slug or a query of any length: the
		// game keeps the short canonical one, as it counts against the size
		// budget of the stored game.
		URL:      im.baseURL() + ref.pagePath(),
		Name:     deck.Name,
		Hero:     deck.HeroCode,
		HeroName: deck.HeroName,
	}
	for code, qty := range deck.Slots {
		choice.Cards = append(choice.Cards, game.DeckEntry{Code: code, Qty: qty})
	}
	slices.SortFunc(choice.Cards, func(a, b game.DeckEntry) int { return strings.Compare(a.Code, b.Code) })

	if err := im.checkSupported(ctx, choice, cat); err != nil {
		return game.DeckChoice{}, err
	}
	return choice, nil
}

// parseLink reads the deck that a marvelcdb deck page link points to.
func parseLink(link string) (deckRef, error) {
	u, err := url.Parse(link)
	if err != nil {
		return deckRef{}, fmt.Errorf("%w: %w", ErrLink, err)
	}
	if u.Scheme != "https" && u.Scheme != "http" {
		return deckRef{}, ErrLink
	}
	host := strings.ToLower(u.Host)
	if host != "marvelcdb.com" && host != "www.marvelcdb.com" {
		return deckRef{}, ErrLink
	}

	// Accepted shapes: /{kind}/{id}, /{kind}/view/{id} and /{kind}/view/{id}/{slug}.
	segments := strings.Split(strings.Trim(u.Path, "/"), "/")
	if len(segments) < 2 || (segments[0] != "decklist" && segments[0] != "deck") {
		return deckRef{}, ErrLink
	}
	kind, rest := segments[0], segments[1:]
	if rest[0] == "view" {
		rest = rest[1:]
	} else if len(rest) > 1 {
		return deckRef{}, ErrLink
	}
	if len(rest) == 0 || !isNumeric(rest[0]) {
		return deckRef{}, ErrLink
	}
	return deckRef{kind: kind, id: rest[0]}, nil
}

func isNumeric(s string) bool {
	_, err := strconv.ParseUint(s, 10, 64)
	return err == nil
}

// fetchDeck reads a deck. marvelcdb answers 200 with an empty body for a
// missing decklist, so an incomplete payload is treated like a 404. Any other
// status means marvelcdb failed (or throttles us), not that the deck is gone.
func (im *Importer) fetchDeck(ctx context.Context, path string) (deckPayload, error) {
	body, status, err := im.get(ctx, path)
	if err != nil {
		return deckPayload{}, fmt.Errorf("fetch deck: %w", err)
	}
	if status == http.StatusNotFound || (status == http.StatusOK && len(body) == 0) {
		return deckPayload{}, ErrNotFound
	}
	if status != http.StatusOK {
		return deckPayload{}, fmt.Errorf("fetch deck: marvelcdb answered status %d", status)
	}

	var deck deckPayload
	if err := json.Unmarshal(body, &deck); err != nil {
		return deckPayload{}, fmt.Errorf("decode deck: %w", err)
	}
	if deck.HeroCode == "" || deck.Slots == nil {
		return deckPayload{}, ErrNotFound
	}
	if err := validateSlots(deck.Slots); err != nil {
		return deckPayload{}, err
	}
	return deck, nil
}

func validateSlots(slots map[string]int) error {
	if len(slots) > maxSlots {
		return fmt.Errorf("%w: %d slots", ErrInvalidDeck, len(slots))
	}
	for code, qty := range slots {
		if qty < 1 || qty > maxQty {
			return fmt.Errorf("%w: card %s has quantity %d", ErrInvalidDeck, code, qty)
		}
	}
	return nil
}

// checkSupported returns an *UnsupportedError when the hero or any card is
// unknown to the catalog. Only the first maxCardLookups are named.
func (im *Importer) checkSupported(ctx context.Context, choice game.DeckChoice, cat *pack.Catalog) error {
	entries := append([]game.DeckEntry{{Code: choice.Hero, Qty: 1}}, choice.Cards...)

	var missing []Unsupported
	for _, entry := range entries {
		if _, _, err := cat.Card(entry.Code); err == nil {
			continue
		}
		card := Unsupported{Code: entry.Code}
		if len(missing) < maxCardLookups {
			card = im.describeCard(ctx, entry.Code)
		}
		card.Qty = entry.Qty
		missing = append(missing, card)
	}
	if len(missing) == 0 {
		return nil
	}
	slices.SortFunc(missing, func(a, b Unsupported) int { return strings.Compare(a.Code, b.Code) })
	return &UnsupportedError{Cards: missing}
}

// describeCard looks up the name and pack of a card. The details are only
// informative, so a failed lookup leaves them empty.
func (im *Importer) describeCard(ctx context.Context, code string) Unsupported {
	card := Unsupported{Code: code}

	body, status, err := im.get(ctx, "/api/public/card/"+url.PathEscape(code))
	if err != nil || status != http.StatusOK {
		return card
	}
	var details struct {
		Name     string `json:"name"`
		PackName string `json:"pack_name"`
	}
	if err := json.Unmarshal(body, &details); err != nil {
		return card
	}
	card.Name = details.Name
	card.Pack = details.PackName
	return card
}

// get performs a GET on the marvelcdb API and returns the body and status.
func (im *Importer) get(ctx context.Context, path string) ([]byte, int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, im.baseURL()+path, nil)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Accept", "application/json")

	resp, err := im.client().Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer func() { _ = resp.Body.Close() }()

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxBodyBytes))
	if err != nil {
		return nil, 0, err
	}
	return body, resp.StatusCode, nil
}

// baseURL is BaseURL without a trailing slash, ready to take a path.
func (im *Importer) baseURL() string {
	return strings.TrimSuffix(im.BaseURL, "/")
}

func (im *Importer) client() *http.Client {
	if im.HTTP != nil {
		return im.HTTP
	}
	return defaultClient
}
