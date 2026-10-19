package game

import (
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/alexandreroman/intothefray/internal/pack"
)

const (
	maxSeats     = 4 // deck slots across all players, so heroes at the table
	maxNameRunes = 24
	maxCopies    = 20 // copies of one card in a deck

	standardVersionI = "standard"
)

// NewGame creates a game in the lobby, with the host seated first. Like every
// newcomer, the host starts with one empty deck slot. It returns ErrInvalid
// when the host name is empty once cleaned.
func NewGame(id, hostToken, hostName string, now time.Time) (*Game, error) {
	name := cleanName(hostName)
	if name == "" {
		return nil, invalid("host name is empty")
	}
	return &Game{
		ID:        id,
		Phase:     PhaseLobby,
		CreatedAt: now,
		Players:   []*Player{{Token: hostToken, Name: name, Color: 0, Host: true, Decks: []*DeckChoice{nil}}},
	}, nil
}

// Join seats a newcomer as a player, with one empty deck slot, while the
// lobby has a free seat, otherwise as a spectator. A known token gets its
// current role back.
func (g *Game) Join(token, name string) (Role, error) {
	if token == "" {
		return "", fmt.Errorf("%w: empty token", ErrInvalid)
	}
	if g.player(token) != nil {
		return RolePlayer, nil
	}
	if g.spectator(token) != nil {
		return RoleSpectator, nil
	}

	name = cleanName(name)
	if name == "" {
		return "", fmt.Errorf("%w: empty name", ErrInvalid)
	}

	if g.Phase == PhaseLobby && g.seatCount() < maxSeats {
		g.Players = append(g.Players, &Player{Token: token, Name: name, Color: g.freeColor(), Decks: []*DeckChoice{nil}})
		return RolePlayer, nil
	}
	g.Spectators = append(g.Spectators, &Spectator{Token: token, Name: name})
	return RoleSpectator, nil
}

// Leave turns a player into a spectator during the lobby. The host cannot
// leave. After the start seats are fixed, since hands and table rows follow
// them.
func (g *Game) Leave(token string) error {
	player := g.player(token)
	if player == nil {
		if g.spectator(token) != nil {
			return nil
		}
		return fmt.Errorf("%w: unknown participant", ErrNotFound)
	}
	if player.Host {
		return fmt.Errorf("%w: the host cannot leave", ErrForbidden)
	}
	if err := g.requireLobby(); err != nil {
		return err
	}
	g.demote(player)
	return nil
}

// TakeSeat moves a spectator to a free seat during the lobby, with one empty
// deck slot and the lowest free colour.
func (g *Game) TakeSeat(token string) error {
	if g.player(token) != nil {
		return nil
	}
	spectator := g.spectator(token)
	if spectator == nil {
		return fmt.Errorf("%w: unknown participant", ErrNotFound)
	}
	if err := g.requireLobby(); err != nil {
		return err
	}
	if g.seatCount() >= maxSeats {
		return fmt.Errorf("%w: all seats are taken", ErrInvalid)
	}
	g.Spectators = slices.DeleteFunc(g.Spectators, func(s *Spectator) bool { return s == spectator })
	g.Players = append(g.Players, &Player{
		Token: token,
		Name:  spectator.Name,
		Color: g.freeColor(),
		Decks: []*DeckChoice{nil},
	})
	return nil
}

// RemovePlayer lets the host turn a player into a spectator during the
// lobby, which frees the player's colour.
func (g *Game) RemovePlayer(hostToken, playerToken string) error {
	if err := g.requireHost(hostToken); err != nil {
		return err
	}
	if err := g.requireLobby(); err != nil {
		return err
	}
	player := g.player(playerToken)
	if player == nil {
		return fmt.Errorf("%w: unknown player", ErrNotFound)
	}
	if player.Host {
		return fmt.Errorf("%w: the host cannot be removed", ErrForbidden)
	}
	g.demote(player)
	return nil
}

// Configure sets the scenario setup. Every id must exist in the catalog with
// the right kind of set.
func (g *Game) Configure(hostToken string, cfg LobbyConfig, cat *pack.Catalog) error {
	if err := g.requireHost(hostToken); err != nil {
		return err
	}
	if err := g.requireLobby(); err != nil {
		return err
	}
	if err := validateConfig(cfg, cat); err != nil {
		return err
	}
	// Never nil, so the JSON form is [] rather than null.
	cfg.Modulars = append([]string{}, cfg.Modulars...)
	g.Config = cfg
	return nil
}

// AddDeck gives the player an extra empty deck slot during the lobby, while
// the table has a free seat.
func (g *Game) AddDeck(token string) error {
	if err := g.requireLobby(); err != nil {
		return err
	}
	player := g.player(token)
	if player == nil {
		return fmt.Errorf("%w: only players have decks", ErrForbidden)
	}
	if g.seatCount() >= maxSeats {
		return fmt.Errorf("%w: all seats are taken", ErrInvalid)
	}
	player.Decks = append(player.Decks, nil)
	return nil
}

// RemoveDeck drops the player's deck slot with the given index during the
// lobby; the slots after it move down by one. A player keeps at least one
// slot.
func (g *Game) RemoveDeck(token string, deck int) error {
	if err := g.requireLobby(); err != nil {
		return err
	}
	player := g.player(token)
	if player == nil {
		return fmt.Errorf("%w: only players have decks", ErrForbidden)
	}
	if !player.hasSlot(deck) {
		return fmt.Errorf("%w: %s has no deck slot %d", ErrInvalid, player.Name, deck)
	}
	if len(player.Decks) == 1 {
		return fmt.Errorf("%w: a player keeps at least one deck", ErrInvalid)
	}
	player.Decks = slices.Delete(player.Decks, deck, deck+1)
	return nil
}

// SetDeck stores a deck in the player's deck slot with the given index during
// the lobby. Every card code must be known to the catalog.
func (g *Game) SetDeck(token string, deck int, choice DeckChoice, cat *pack.Catalog) error {
	if err := g.requireLobby(); err != nil {
		return err
	}
	player := g.player(token)
	if player == nil {
		return fmt.Errorf("%w: only players have decks", ErrForbidden)
	}
	if !player.hasSlot(deck) {
		return fmt.Errorf("%w: %s has no deck slot %d", ErrInvalid, player.Name, deck)
	}

	var unknown []string
	if choice.Hero != "" && !knownCard(cat, choice.Hero) {
		unknown = append(unknown, choice.Hero)
	}
	for _, entry := range choice.Cards {
		if entry.Qty < 1 || entry.Qty > maxCopies {
			return fmt.Errorf("%w: card %s has quantity %d, want 1 to %d", ErrInvalid, entry.Code, entry.Qty, maxCopies)
		}
		if !knownCard(cat, entry.Code) {
			unknown = append(unknown, entry.Code)
		}
	}
	if len(unknown) > 0 {
		return fmt.Errorf("%w: unknown card codes: %s", ErrInvalid, strings.Join(unknown, ", "))
	}

	choice.Cards = slices.Clone(choice.Cards)
	// The image comes from the catalog, whatever the client sent.
	choice.HeroImage = heroImage(cat, choice.Hero)
	player.Decks[deck] = &choice
	return nil
}

// End closes the game. Only the host can do it.
func (g *Game) End(hostToken string) error {
	if err := g.requireHost(hostToken); err != nil {
		return err
	}
	if g.Phase == PhaseEnded {
		return fmt.Errorf("%w: the game is already over", ErrPhase)
	}
	g.Phase = PhaseEnded
	return nil
}

// DefaultConfig is the usual setup of a scenario: its recommended modular
// sets, standard version I and no expert set.
func DefaultConfig(cat *pack.Catalog, scenario string) LobbyConfig {
	cfg := LobbyConfig{
		Scenario:   scenario,
		Difficulty: pack.Standard,
		Standard:   standardVersionI,
		Modulars:   []string{},
	}
	if sc, ok := cat.Scenario(scenario); ok {
		cfg.Modulars = slices.Clone(sc.Recommended)
	}
	return cfg
}

func validateConfig(cfg LobbyConfig, cat *pack.Catalog) error {
	if _, ok := cat.Scenario(cfg.Scenario); !ok {
		return fmt.Errorf("%w: unsupported scenario %q", ErrInvalid, cfg.Scenario)
	}
	// An empty Standard or Expert set means the game plays without it, as
	// some scenarios allow.
	if cfg.Standard != "" {
		if err := requireSetKind(cat, cfg.Standard, "standard"); err != nil {
			return err
		}
	}

	switch cfg.Difficulty {
	case pack.Standard:
		if cfg.Expert != "" {
			return fmt.Errorf("%w: expert set %q without expert difficulty", ErrInvalid, cfg.Expert)
		}
	case pack.Expert:
		if cfg.Expert != "" {
			if err := requireSetKind(cat, cfg.Expert, "expert"); err != nil {
				return err
			}
		}
	default:
		return fmt.Errorf("%w: unknown difficulty %q", ErrInvalid, cfg.Difficulty)
	}

	for i, code := range cfg.Modulars {
		if slices.Contains(cfg.Modulars[:i], code) {
			return fmt.Errorf("%w: duplicate modular set %q", ErrInvalid, code)
		}
		if err := requireSetKind(cat, code, "modular"); err != nil {
			return err
		}
	}
	return nil
}

// requireSetKind accepts only the sets of this kind the lobby offers.
func requireSetKind(cat *pack.Catalog, code, kind string) error {
	set, ok := cat.Set(code)
	if !ok || set.Kind != kind {
		return fmt.Errorf("%w: %q is not a %s set", ErrInvalid, code, kind)
	}
	if set.Unlisted {
		return fmt.Errorf("%w: set %q is not offered by the lobby", ErrInvalid, code)
	}
	return nil
}

func knownCard(cat *pack.Catalog, code string) bool {
	_, _, err := cat.Card(code)
	return err == nil
}

// heroImage returns the first image of the hero face of the identity card
// with the given code (any alias), or of its first face when no face is a
// hero face. It is empty for an unknown code or a face without images.
func heroImage(cat *pack.Catalog, identity string) string {
	card, _, err := cat.Card(identity)
	if err != nil || len(card.Faces) == 0 {
		return ""
	}
	face := card.Faces[0]
	for _, f := range card.Faces {
		if f.Type == faceTypeHero {
			face = f
			break
		}
	}
	if len(face.Images) == 0 {
		return ""
	}
	return face.Images[0]
}

// cleanName trims a display name and cuts it to maxNameRunes runes.
func cleanName(name string) string {
	runes := []rune(strings.TrimSpace(name))
	if len(runes) > maxNameRunes {
		runes = runes[:maxNameRunes]
	}
	return strings.TrimSpace(string(runes))
}

// freeColor returns the lowest colour index no player uses.
func (g *Game) freeColor() int {
	for color := 0; ; color++ {
		if !slices.ContainsFunc(g.Players, func(p *Player) bool { return p.Color == color }) {
			return color
		}
	}
}

// hasSlot reports whether the player has a deck slot with the given index.
func (p *Player) hasSlot(deck int) bool {
	return deck >= 0 && deck < len(p.Decks)
}

// ready reports whether the player has a deck slot and every one holds a
// deck.
func (p *Player) ready() bool {
	return len(p.Decks) > 0 && !slices.Contains(p.Decks, nil)
}

// demote moves a player to the spectators, freeing the seats and colour.
func (g *Game) demote(player *Player) {
	g.Players = slices.DeleteFunc(g.Players, func(p *Player) bool { return p == player })
	g.Spectators = append(g.Spectators, &Spectator{Token: player.Token, Name: player.Name})
}

func (g *Game) player(token string) *Player {
	for _, p := range g.Players {
		if p.Token == token {
			return p
		}
	}
	return nil
}

func (g *Game) spectator(token string) *Spectator {
	for _, s := range g.Spectators {
		if s.Token == token {
			return s
		}
	}
	return nil
}

func (g *Game) requireHost(token string) error {
	player := g.player(token)
	if player == nil || !player.Host {
		return fmt.Errorf("%w: host only", ErrForbidden)
	}
	return nil
}

func (g *Game) requireLobby() error {
	if g.Phase != PhaseLobby {
		return fmt.Errorf("%w: the game has started", ErrPhase)
	}
	return nil
}
