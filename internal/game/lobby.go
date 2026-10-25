package game

import (
	"fmt"
	"slices"
	"strings"
	"time"
	"unicode"

	"github.com/alexandreroman/intothefray/internal/pack"
)

const (
	maxSeats     = 4 // deck slots across all players, so heroes at the table
	maxNameRunes = 16
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
		return "", invalid("empty token")
	}
	if g.player(token) != nil {
		return RolePlayer, nil
	}
	if g.spectator(token) != nil {
		return RoleSpectator, nil
	}

	name = cleanName(name)
	if name == "" {
		return "", invalid("empty name")
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
		return forbidden("the host cannot leave")
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
		return invalid("all seats are taken")
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
		return forbidden("the host cannot be removed")
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
	// A self-contained scenario uses no other set: choosing it clears them.
	if sc, ok := cat.Scenario(cfg.Scenario); ok && sc.SelfContained {
		cfg.Modulars, cfg.Standard, cfg.Expert = nil, "", ""
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
		return forbidden("only players have decks")
	}
	if g.seatCount() >= maxSeats {
		return invalid("all seats are taken")
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
		return forbidden("only players have decks")
	}
	if !player.hasSlot(deck) {
		return invalid("%s has no deck slot %d", player.Name, deck)
	}
	if len(player.Decks) == 1 {
		return invalid("a player keeps at least one deck")
	}
	player.Decks = slices.Delete(player.Decks, deck, deck+1)
	return nil
}

// HeroTakenError reports a deck whose hero already sits in another deck slot
// of the game. It wraps ErrInvalid.
type HeroTakenError struct {
	Hero string // the hero's label, e.g. "Spider-Man (Peter Parker)"
}

func (e *HeroTakenError) Error() string {
	return fmt.Sprintf("%v: %s is already at the table", ErrInvalid, e.Hero)
}

func (e *HeroTakenError) Unwrap() error {
	return ErrInvalid
}

// SetDeck stores a deck in the player's deck slot with the given index during
// the lobby. Every card code must be known to the catalog, and the hero must
// not sit in any other deck slot of the game, whoever holds it: it returns a
// HeroTakenError then. Reloading a slot with its own hero is allowed.
func (g *Game) SetDeck(token string, deck int, choice DeckChoice, cat *pack.Catalog) error {
	if err := g.requireLobby(); err != nil {
		return err
	}
	player := g.player(token)
	if player == nil {
		return forbidden("only players have decks")
	}
	if !player.hasSlot(deck) {
		return invalid("%s has no deck slot %d", player.Name, deck)
	}

	var unknown []string
	if choice.Hero != "" && !knownCard(cat, choice.Hero) {
		unknown = append(unknown, choice.Hero)
	}
	for _, entry := range choice.Cards {
		if entry.Qty < 1 || entry.Qty > maxCopies {
			return invalid("card %s has quantity %d, want 1 to %d", entry.Code, entry.Qty, maxCopies)
		}
		if !knownCard(cat, entry.Code) {
			unknown = append(unknown, entry.Code)
		}
	}
	if len(unknown) > 0 {
		return invalid("unknown card codes: %s", strings.Join(unknown, ", "))
	}
	if err := g.requireFreeHero(player, deck, choice.Hero, cat); err != nil {
		return err
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
// sets, standard version I and no expert set; none for a self-contained
// scenario.
func DefaultConfig(cat *pack.Catalog, scenario string) LobbyConfig {
	cfg := LobbyConfig{
		Scenario:   scenario,
		Difficulty: pack.Standard,
		Standard:   standardVersionI,
		Modulars:   []string{},
	}
	if sc, ok := cat.Scenario(scenario); ok {
		if sc.SelfContained {
			cfg.Standard = ""
		} else {
			cfg.Modulars = slices.Clone(sc.Recommended)
		}
	}
	return cfg
}

func validateConfig(cfg LobbyConfig, cat *pack.Catalog) error {
	if _, ok := cat.Scenario(cfg.Scenario); !ok {
		return invalid("unsupported scenario %q", cfg.Scenario)
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
			return invalid("expert set %q without expert difficulty", cfg.Expert)
		}
	case pack.Expert:
		if cfg.Expert != "" {
			if err := requireSetKind(cat, cfg.Expert, "expert"); err != nil {
				return err
			}
		}
	default:
		return invalid("unknown difficulty %q", cfg.Difficulty)
	}

	for i, code := range cfg.Modulars {
		if slices.Contains(cfg.Modulars[:i], code) {
			return invalid("duplicate modular set %q", code)
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
		return invalid("%q is not a %s set", code, kind)
	}
	if set.Unlisted {
		return invalid("set %q is not offered by the lobby", code)
	}
	return nil
}

// requireFreeHero refuses a hero that already sits in another deck slot of
// the game. The caller's slot being loaded is skipped, so that a deck can
// replace itself.
func (g *Game) requireFreeHero(caller *Player, slot int, identity string, cat *pack.Catalog) error {
	wanted, ok := heroTitleOf(cat, identity)
	if !ok {
		return nil
	}
	for _, holder := range g.Players {
		for i, held := range holder.Decks {
			if held == nil || (holder == caller && i == slot) {
				continue
			}
			title, ok := heroTitleOf(cat, held.Hero)
			if ok && title.matches(wanted) {
				return &HeroTakenError{Hero: wanted.label()}
			}
		}
	}
	return nil
}

// heroTitle tells heroes apart: the name of the hero face and its subtitle.
type heroTitle struct {
	name     string
	subtitle string
}

// heroTitleOf returns the title of the identity card with the given code
// (any alias). The subtitle is the hero face's subname, or else the alter
// ego name: marvelcdb leaves the subname of identity cards empty, and the
// alter ego is what tells Spider-Man (Peter Parker) from Spider-Man (Miles
// Morales). ok is false for an empty or unknown code.
func heroTitleOf(cat *pack.Catalog, identity string) (heroTitle, bool) {
	if identity == "" {
		return heroTitle{}, false
	}
	card, _, err := cat.Card(identity)
	if err != nil || len(card.Faces) == 0 {
		return heroTitle{}, false
	}
	face := heroFace(card)
	title := heroTitle{name: face.Name, subtitle: face.Subname}
	if title.subtitle == "" {
		for _, f := range card.Faces {
			if f.Type == faceTypeAlterEgo {
				title.subtitle = f.Name
				break
			}
		}
	}
	return title, true
}

// matches compares two titles, ignoring case and surrounding spaces.
func (h heroTitle) matches(other heroTitle) bool {
	return sameText(h.name, other.name) && sameText(h.subtitle, other.subtitle)
}

// label reads "Spider-Man (Peter Parker)", or the bare name without a
// subtitle.
func (h heroTitle) label() string {
	if h.subtitle == "" {
		return h.name
	}
	return fmt.Sprintf("%s (%s)", h.name, h.subtitle)
}

func sameText(a, b string) bool {
	return strings.EqualFold(strings.TrimSpace(a), strings.TrimSpace(b))
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
	face := heroFace(card)
	if len(face.Images) == 0 {
		return ""
	}
	return face.Images[0]
}

// heroFace returns the hero face of an identity card, or its first face when
// no face is a hero face. The card must have a face.
func heroFace(card pack.Card) pack.Face {
	for _, f := range card.Faces {
		if f.Type == faceTypeHero {
			return f
		}
	}
	return card.Faces[0]
}

// cleanName strips emojis from a display name, trims it and cuts it to maxNameRunes runes,
// so that emojis never count toward the limit.
func cleanName(name string) string {
	runes := []rune(strings.TrimSpace(strings.Map(dropEmoji, name)))
	if len(runes) > maxNameRunes {
		runes = runes[:maxNameRunes]
	}
	return strings.TrimSpace(string(runes))
}

// dropEmoji is the strings.Map function that removes the runes emojis are made of. The standard
// library has no emoji property, so it goes by Unicode categories: pictographs and other symbols
// (So), joiners and other format characters (Cf), the keycap and other enclosing marks (Me),
// variation selectors, and the skin tone modifiers, which are modifier symbols (Sk) like accents.
func dropEmoji(r rune) rune {
	isSkinTone := r >= 0x1F3FB && r <= 0x1F3FF
	if isSkinTone || unicode.In(r, unicode.So, unicode.Cf, unicode.Me, unicode.Variation_Selector) {
		return -1
	}
	return r
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
		return forbidden("host only")
	}
	return nil
}

func (g *Game) requireLobby() error {
	if g.Phase != PhaseLobby {
		return fmt.Errorf("%w: the game has started", ErrPhase)
	}
	return nil
}
