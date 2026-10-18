package game

import (
	"fmt"
	"math/rand/v2"
	"strings"
	"time"

	"github.com/alexandreroman/intothefray/internal/pack"
)

// Default positions on the table, in table units (see the geometry rules).
const (
	villainPileX = 280
	schemePileX  = 420
	schemePileY  = 20
	inPlayStartX = 600
	inPlayStepX  = 160
	inPlayY      = 20
	discardX     = 120
	victoryX     = 1080
	asideX       = 1200
	identityX    = 280
	firstPlayerX = 420
)

const (
	pileKeyVillain = "villain"
	pileKeyScheme  = "scheme"

	faceTypeAlterEgo = "alter_ego"
)

// Start builds the table with the standard setup and begins the game. No
// opening hand is drawn: players draw their own, since some heroes and cards
// change it.
func (g *Game) Start(hostToken string, cat *pack.Catalog, rng *rand.Rand, now time.Time) error {
	if err := g.requireHost(hostToken); err != nil {
		return err
	}
	if err := g.requireLobby(); err != nil {
		return err
	}
	if g.Config.Scenario == "" {
		return fmt.Errorf("%w: no scenario is configured", ErrInvalid)
	}
	for _, p := range g.Players {
		if p.Deck == nil {
			return fmt.Errorf("%w: %s has no deck", ErrInvalid, p.Name)
		}
	}

	// The table is built apart so that a failed setup leaves the lobby intact.
	b := &tableBuilder{cat: cat, rng: rng, table: newEmptyTable(len(g.Players))}
	scenario, err := b.setupScenario(g.Config)
	if err != nil {
		return err
	}
	for seat, p := range g.Players {
		if err := b.setupPlayer(seat, p.Deck); err != nil {
			return fmt.Errorf("%s: %w", p.Name, err)
		}
	}
	b.shuffle(PileEncounter)

	host := g.player(hostToken)
	modulars, err := setNames(cat, g.Config.Modulars)
	if err != nil {
		return err
	}
	description := strings.Join(append([]string{scenario.Name}, modulars...), ", ")

	g.Table = b.table
	g.Phase = PhasePlaying
	g.Log = append(g.Log, LogEntry{
		Who:   host.Name,
		Color: host.Color,
		Text:  fmt.Sprintf("started the game (%s)", description),
		At:    now,
	})
	return nil
}

func setNames(cat *pack.Catalog, codes []string) ([]string, error) {
	names := make([]string, 0, len(codes))
	for _, code := range codes {
		set, ok := cat.Set(code)
		if !ok {
			return nil, fmt.Errorf("%w: unknown set %q", ErrInvalid, code)
		}
		names = append(names, set.Name)
	}
	return names, nil
}

// newEmptyTable returns a table with every pile of every area, all empty.
func newEmptyTable(players int) *Table {
	t := &Table{
		Cards:       map[string]*Card{},
		Piles:       map[string]*Pile{},
		Hands:       map[Area][]string{},
		FirstPlayer: Point{Area: PlayerArea(0), X: firstPlayerX, Y: 0},
	}
	t.addPile(PileEncounter, KindEncounter, NoOwner, AreaVillain, 0)
	t.addPile(PileEncounterDiscard, KindEncounterDiscard, NoOwner, AreaVillain, discardX)
	t.addPile(PileVictory, KindVictory, NoOwner, AreaVillain, victoryX)
	t.addPile(PileScenarioAside, KindAside, NoOwner, AreaVillain, asideX)

	for seat := range players {
		area := PlayerArea(seat)
		t.addPile("deck:"+string(area), KindDeck, seat, area, 0)
		t.addPile("disc:"+string(area), KindDiscard, seat, area, discardX)
		t.addPile("aside:"+string(area), KindAside, seat, area, asideX)
		t.Hands[area] = []string{}
	}
	return t
}

func (t *Table) addPile(id string, kind PileKind, owner int, area Area, x int) {
	t.Piles[id] = &Pile{ID: id, Kind: kind, Owner: owner, Area: area, X: x, Cards: []string{}}
}

// tableBuilder creates the cards of a new table.
type tableBuilder struct {
	cat   *pack.Catalog
	rng   *rand.Rand
	table *Table
}

// newCard creates one card instance. The code may be any alias; the card
// gets the canonical code. It is not placed anywhere yet.
func (b *tableBuilder) newCard(code string, owner int, home string) (*Card, pack.Card, error) {
	def, _, err := b.cat.Card(code)
	if err != nil {
		return nil, pack.Card{}, fmt.Errorf("%w: %w", ErrInvalid, err)
	}
	c := &Card{
		ID:    newCardID(b.table, b.rng, nil),
		Code:  def.Code,
		Faces: len(def.Faces),
		Back:  def.Back,
		Owner: owner,
		Home:  home,
	}
	b.table.Cards[c.ID] = c
	return c, def, nil
}

// newEncounterCard creates a card of the encounter deck's owner: nobody.
func (b *tableBuilder) newEncounterCard(code string) (*Card, pack.Card, error) {
	return b.newCard(code, NoOwner, PileEncounter)
}

// pushToPile puts a new card on top of a pile.
func (b *tableBuilder) pushToPile(pileID string, c *Card) {
	b.table.pushOnPile(b.table.Piles[pileID], c)
}

// placeOnTable puts a new card on the table.
func (b *tableBuilder) placeOnTable(c *Card, face int, area Area, x, y int) {
	c.Face = face
	b.table.placeOnTable(c, area, x, y)
}

// addSetToPile creates every copy of every card of a set, owned by nobody,
// and puts them on pileID. Cards whose canonical code is in skip are left out.
func (b *tableBuilder) addSetToPile(setCode, pileID string, skip map[string]bool) error {
	set, ok := b.cat.Set(setCode)
	if !ok {
		return fmt.Errorf("%w: unknown set %q", ErrInvalid, setCode)
	}
	for _, code := range set.Cards {
		def, _, err := b.cat.Card(code)
		if err != nil {
			return fmt.Errorf("%w: %w", ErrInvalid, err)
		}
		if skip[def.Code] {
			continue
		}
		for range def.Quantity {
			c, _, err := b.newEncounterCard(def.Code)
			if err != nil {
				return err
			}
			b.pushToPile(pileID, c)
		}
	}
	return nil
}

// canonical returns the canonical code of any card alias.
func (b *tableBuilder) canonical(code string) (string, error) {
	def, _, err := b.cat.Card(code)
	if err != nil {
		return "", fmt.Errorf("%w: %w", ErrInvalid, err)
	}
	return def.Code, nil
}

// setupScenario creates the villain side: stages, starting cards, set-aside
// cards and the encounter deck. The deck stays unshuffled until the
// obligations of the heroes have joined it.
func (b *tableBuilder) setupScenario(cfg LobbyConfig) (pack.Scenario, error) {
	scenario, ok := b.cat.Scenario(cfg.Scenario)
	if !ok {
		return pack.Scenario{}, fmt.Errorf("%w: unsupported scenario %q", ErrInvalid, cfg.Scenario)
	}
	start, ok := scenario.Start[cfg.Difficulty]
	if !ok {
		return pack.Scenario{}, fmt.Errorf("%w: scenario %q has no %s setup", ErrInvalid, scenario.ID, cfg.Difficulty)
	}

	// Cards that are set up by hand and so stay out of the encounter deck.
	apart := map[string]bool{}

	for _, pile := range scenario.Piles {
		if err := b.setupStage(pile, start.Top[pile.Key], apart); err != nil {
			return pack.Scenario{}, err
		}
	}
	for i, ref := range start.InPlay {
		c, err := b.putInPlay(ref, inPlayStartX+inPlayStepX*i, inPlayY)
		if err != nil {
			return pack.Scenario{}, err
		}
		apart[c.Code] = true
	}
	for _, code := range scenario.SetAside {
		c, _, err := b.newEncounterCard(code)
		if err != nil {
			return pack.Scenario{}, err
		}
		b.pushToPile(PileScenarioAside, c)
		apart[c.Code] = true
	}

	encounterSets := []string{scenario.VillainSet}
	encounterSets = append(encounterSets, cfg.Modulars...)
	encounterSets = append(encounterSets, cfg.Standard)
	if cfg.Expert != "" {
		encounterSets = append(encounterSets, cfg.Expert)
	}
	for i, setCode := range encounterSets {
		// Only the villain set loses cards: the others never overlap the setup.
		skip := map[string]bool(nil)
		if i == 0 {
			skip = apart
		}
		if err := b.addSetToPile(setCode, PileEncounter, skip); err != nil {
			return pack.Scenario{}, err
		}
	}
	return scenario, nil
}

// setupStage creates the cards of one stage pile. The card named by top goes
// to the table on its start face; the others wait in the stage zone.
func (b *tableBuilder) setupStage(pile pack.Pile, top pack.FaceRef, apart map[string]bool) error {
	x, y, err := stagePosition(pile.Key)
	if err != nil {
		return err
	}
	topCode, err := b.canonical(top.Card)
	if err != nil {
		return err
	}

	stage := &Stage{Key: pile.Key, Label: pile.Label}
	for _, code := range pile.Cards {
		c, def, err := b.newEncounterCard(code)
		if err != nil {
			return err
		}
		apart[c.Code] = true
		stage.Cards = append(stage.Cards, c.ID)

		if c.Code != topCode {
			c.Zone = ZoneStage
			continue
		}
		if err := b.placeFace(c, def, top.Face, x, y); err != nil {
			return err
		}
		stage.Current = c.ID
	}
	if stage.Current == "" {
		return fmt.Errorf("%w: stage %q has no card %s", ErrInvalid, pile.Key, top.Card)
	}
	b.table.Stages = append(b.table.Stages, stage)
	return nil
}

func stagePosition(key string) (x, y int, err error) {
	switch key {
	case pileKeyVillain:
		return villainPileX, 0, nil
	case pileKeyScheme:
		return schemePileX, schemePileY, nil
	default:
		return 0, 0, fmt.Errorf("%w: unknown stage pile %q", ErrInvalid, key)
	}
}

// putInPlay creates a starting card and puts it on the villain side.
func (b *tableBuilder) putInPlay(ref pack.FaceRef, x, y int) (*Card, error) {
	c, def, err := b.newEncounterCard(ref.Card)
	if err != nil {
		return nil, err
	}
	if err := b.placeFace(c, def, ref.Face, x, y); err != nil {
		return nil, err
	}
	return c, nil
}

// placeFace puts a new card on the villain side, face up on the given face,
// with the starting threat that face prints, if any.
func (b *tableBuilder) placeFace(c *Card, def pack.Card, face, x, y int) error {
	if face < 0 || face >= len(def.Faces) {
		return fmt.Errorf("%w: card %s has no face %d", ErrInvalid, def.Code, face)
	}
	b.placeOnTable(c, face, AreaVillain, x, y)

	threat := def.Faces[face].StartingThreat
	if threat == nil {
		return nil
	}
	amount := threat.Value
	if threat.PerPlayer {
		amount *= len(b.table.Hands)
	}
	if amount > 0 {
		c.Tokens = map[string]int{"thr": amount}
	}
	return nil
}

// setupPlayer creates the identity, the nemesis cards, the obligation and the
// shuffled deck of one player.
func (b *tableBuilder) setupPlayer(seat int, deck *DeckChoice) error {
	if deck.Hero == "" {
		return fmt.Errorf("%w: the deck has no hero", ErrInvalid)
	}
	area := PlayerArea(seat)
	deckID := "deck:" + string(area)

	identity, identityDef, err := b.newCard(deck.Hero, seat, deckID)
	if err != nil {
		return err
	}
	b.placeOnTable(identity, alterEgoFace(identityDef), area, identityX, 0)

	hero, ok := b.cat.HeroByIdentity(deck.Hero)
	if !ok {
		return fmt.Errorf("%w: %s is not a hero identity", ErrInvalid, deck.Hero)
	}
	if hero.Obligation != "" {
		c, _, err := b.newEncounterCard(hero.Obligation)
		if err != nil {
			return err
		}
		b.pushToPile(PileEncounter, c)
	}
	if hero.Nemesis != "" {
		if err := b.addSetToPile(hero.Nemesis, "aside:"+string(area), nil); err != nil {
			return err
		}
	}

	for _, entry := range deck.Cards {
		code, err := b.canonical(entry.Code)
		if err != nil {
			return err
		}
		if code == identity.Code {
			continue
		}
		for range entry.Qty {
			c, _, err := b.newCard(code, seat, deckID)
			if err != nil {
				return err
			}
			b.pushToPile(deckID, c)
		}
	}
	b.shuffle(deckID)
	return nil
}

// alterEgoFace returns the index of the alter-ego face, or 0 if there is none.
func alterEgoFace(def pack.Card) int {
	for i, face := range def.Faces {
		if face.Type == faceTypeAlterEgo {
			return i
		}
	}
	return 0
}

func (b *tableBuilder) shuffle(pileID string) {
	cards := b.table.Piles[pileID].Cards
	b.rng.Shuffle(len(cards), func(i, j int) { cards[i], cards[j] = cards[j], cards[i] })
}
