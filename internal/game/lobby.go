package game

import (
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/alexandreroman/intothefray/internal/pack"
)

const (
	maxPlayers   = 4
	maxNameRunes = 24

	standardVersionI = "standard"
)

// NewGame creates a game in the lobby, with the host seated first.
func NewGame(id, hostToken, hostName string, now time.Time) *Game {
	return &Game{
		ID:        id,
		Phase:     PhaseLobby,
		CreatedAt: now,
		UpdatedAt: now,
		Players:   []*Player{{Token: hostToken, Name: cleanName(hostName), Color: 0, Host: true}},
		Undo:      map[string][]UndoEntry{},
	}
}

// Join seats a newcomer as a player while the lobby has room, otherwise as a
// spectator. A known token gets its current role back.
func (g *Game) Join(token, name string, now time.Time) (Role, error) {
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

	g.UpdatedAt = now
	if g.Phase == PhaseLobby && len(g.Players) < maxPlayers {
		g.Players = append(g.Players, &Player{Token: token, Name: name, Color: g.freeColor()})
		return RolePlayer, nil
	}
	g.Spectators = append(g.Spectators, &Spectator{Token: token, Name: name})
	return RoleSpectator, nil
}

// Leave turns a player into a spectator during the lobby. The host cannot
// leave. After the start seats are fixed, since table areas follow them.
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

// TakeSeat moves a spectator to a free seat during the lobby, with the
// lowest free colour.
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
	if len(g.Players) >= maxPlayers {
		return fmt.Errorf("%w: all seats are taken", ErrInvalid)
	}
	g.Spectators = slices.DeleteFunc(g.Spectators, func(s *Spectator) bool { return s == spectator })
	g.Players = append(g.Players, &Player{Token: token, Name: spectator.Name, Color: g.freeColor()})
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

// SetDeck stores the deck of a player during the lobby. Every card code must
// be known to the catalog.
func (g *Game) SetDeck(token string, deck DeckChoice, cat *pack.Catalog) error {
	if err := g.requireLobby(); err != nil {
		return err
	}
	player := g.player(token)
	if player == nil {
		return fmt.Errorf("%w: only players have a deck", ErrForbidden)
	}

	var unknown []string
	if deck.Hero != "" && !knownCard(cat, deck.Hero) {
		unknown = append(unknown, deck.Hero)
	}
	for _, entry := range deck.Cards {
		if entry.Qty <= 0 {
			return fmt.Errorf("%w: card %s has quantity %d", ErrInvalid, entry.Code, entry.Qty)
		}
		if !knownCard(cat, entry.Code) {
			unknown = append(unknown, entry.Code)
		}
	}
	if len(unknown) > 0 {
		return fmt.Errorf("%w: unknown card codes: %s", ErrInvalid, strings.Join(unknown, ", "))
	}

	deck.Cards = slices.Clone(deck.Cards)
	player.Deck = &deck
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
func (g *Game) DefaultConfig(cat *pack.Catalog, scenario string) LobbyConfig {
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
	if err := requireSetKind(cat, cfg.Standard, "standard"); err != nil {
		return err
	}

	switch cfg.Difficulty {
	case pack.Standard:
		if cfg.Expert != "" {
			return fmt.Errorf("%w: expert set %q without expert difficulty", ErrInvalid, cfg.Expert)
		}
	case pack.Expert:
		if err := requireSetKind(cat, cfg.Expert, "expert"); err != nil {
			return err
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

func requireSetKind(cat *pack.Catalog, code, kind string) error {
	set, ok := cat.Set(code)
	if !ok || set.Kind != kind {
		return fmt.Errorf("%w: %q is not a %s set", ErrInvalid, code, kind)
	}
	return nil
}

func knownCard(cat *pack.Catalog, code string) bool {
	_, _, err := cat.Card(code)
	return err == nil
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

// demote moves a player to the spectators, freeing the seat and colour.
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
