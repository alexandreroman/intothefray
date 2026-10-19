package game

import (
	"fmt"
	"math/rand/v2"
	"strings"
	"time"

	"github.com/alexandreroman/intothefray/internal/pack"
)

// Default positions on the table, in table units (see the geometry rules).
//
// The table is laid out in rows: the villain's row on top, villainRowHeight
// high, then one row of rowHeight per seat (one deck, see seats.go), in seat order. Every row starts with its deck
// and its discard pile, then the villain or the identity; the villain's row
// goes on with the main scheme, the first player's row with the first player
// token, and cards in play are added to the right. Things sit rowContentY
// below the top of their row, leaving room for the client's owner label
// above the piles. Out-of-play piles (victory display, set-aside cards) keep
// a position for the model, on the deck, but the client never draws them.
//
// The villain's row is taller so that it reads apart from the players' rows:
// one and a half portrait card heights (294 units) lie empty between its
// cards and the owner label of the first player's row. The client's focus
// view uses the same bands (web/src/table/rows.ts).
const (
	villainRowHeight = 520
	rowHeight        = 330
	rowContentY      = 30

	deckX        = 0
	discardX     = 160
	outOfPlayX   = 0
	identityX    = 360
	villainX     = 360
	mainSchemeX  = 520
	firstPlayerX = 520
	inPlayStartX = 760
	inPlayStepX  = 220
)

// villainRow is the row of the villain; a seat's row is playerRow.
const villainRow = 0

// playerRow returns the row of seat.
func playerRow(seat int) int {
	return seat + 1
}

// rowY returns the y of the things lying in a row.
func rowY(row int) int {
	return rowTop(row) + rowContentY
}

// rowTop returns the y of the top of a row.
func rowTop(row int) int {
	if row == villainRow {
		return 0
	}
	return villainRowHeight + rowHeight*(row-1)
}

const (
	pileKeyVillain = "villain"
	pileKeyScheme  = "scheme"

	faceTypeHero     = "hero"
	faceTypeAlterEgo = "alter_ego"
)

// Start builds the table with the standard setup and begins the game. No
// opening hand is drawn: players draw their own, since some heroes and cards
// change it. All the randomness of the game, setup and actions alike, derives
// from seed, so that the game can be replayed (see Replay).
func (g *Game) Start(hostToken string, cat *pack.Catalog, seed uint64, now time.Time) error {
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
		if !p.ready() {
			return fmt.Errorf("%w: %s is missing a deck", ErrInvalid, p.Name)
		}
	}

	// The table is built apart so that a failed setup leaves the lobby intact.
	b := &tableBuilder{cat: cat, rng: setupRNG(seed), table: newEmptyTable(g.seatCount())}
	scenario, err := b.setupScenario(g.Config)
	if err != nil {
		return err
	}
	for i, p := range g.Players {
		for slot, seat := range g.seatsOf(i) {
			if err := b.setupPlayer(seat, p.Decks[slot]); err != nil {
				return fmt.Errorf("%s: %w", p.Name, err)
			}
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
	g.History = newHistory(seed, b.table, now)
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

// newEmptyTable returns a table with every pile of the villain and of every
// seat, all empty.
func newEmptyTable(seatCount int) *Table {
	t := &Table{
		Cards:       map[string]*Card{},
		Piles:       map[string]*Pile{},
		Hands:       map[Area][]string{},
		FirstPlayer: Point{X: firstPlayerX, Y: rowY(playerRow(0))},
	}
	villainY := rowY(villainRow)
	t.addPile(PileEncounter, KindEncounter, NoOwner, deckX, villainY)
	t.addPile(PileEncounterDiscard, KindEncounterDiscard, NoOwner, discardX, villainY)
	t.addPile(PileVictory, KindVictory, NoOwner, outOfPlayX, villainY)
	t.addPile(PileScenarioAside, KindAside, NoOwner, outOfPlayX, villainY)

	for seat := range seatCount {
		area := PlayerArea(seat)
		y := rowY(playerRow(seat))
		t.addPile("deck:"+string(area), KindDeck, seat, deckX, y)
		t.addPile("disc:"+string(area), KindDiscard, seat, discardX, y)
		t.addPile("aside:"+string(area), KindAside, seat, outOfPlayX, y)
		t.Hands[area] = []string{}
	}
	return t
}

func (t *Table) addPile(id string, kind PileKind, owner int, x, y int) {
	t.Piles[id] = &Pile{ID: id, Kind: kind, Owner: owner, X: x, Y: y, Cards: []string{}}
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
func (b *tableBuilder) placeOnTable(c *Card, face int, x, y int) {
	c.Face = face
	b.table.placeOnTable(c, x, y)
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

// setupScenario creates the villain's row: stages, starting cards, set-aside
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
		c, err := b.putInPlay(ref, inPlayX(i))
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
	if cfg.Standard != "" {
		encounterSets = append(encounterSets, cfg.Standard)
	}
	if cfg.Expert != "" {
		encounterSets = append(encounterSets, cfg.Expert)
	}

	// Cards each set leaves out of the encounter deck, by set code. The
	// scenario setup only takes cards from the villain set.
	skips := map[string]map[string]bool{scenario.VillainSet: apart}
	inPlayCount := len(start.InPlay)
	for _, setCode := range encounterSets[1:] {
		placed, slots, err := b.putSetInPlay(setCode, cfg.Difficulty, inPlayCount)
		if err != nil {
			return pack.Scenario{}, err
		}
		skips[setCode] = placed
		inPlayCount += slots
	}

	for _, setCode := range encounterSets {
		if err := b.addSetToPile(setCode, PileEncounter, skips[setCode]); err != nil {
			return pack.Scenario{}, err
		}
	}
	return scenario, nil
}

// putSetInPlay puts the cards a set starts in play at this difficulty (the
// "Setup." keyword) in the villain's row, in the in-play slots from firstSlot
// on. It returns the canonical codes it placed, which stay out of the
// encounter deck, and the number of slots it used.
func (b *tableBuilder) putSetInPlay(
	setCode string,
	difficulty pack.Difficulty,
	firstSlot int,
) (map[string]bool, int, error) {
	set, ok := b.cat.Set(setCode)
	if !ok {
		return nil, 0, fmt.Errorf("%w: unknown set %q", ErrInvalid, setCode)
	}

	placed := map[string]bool{}
	refs := set.InPlay[difficulty]
	for i, ref := range refs {
		slot := firstSlot + i
		c, err := b.putInPlay(ref, inPlayX(slot))
		if err != nil {
			return nil, 0, err
		}
		placed[c.Code] = true
	}
	return placed, len(refs), nil
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
		return villainX, rowY(villainRow), nil
	case pileKeyScheme:
		return mainSchemeX, rowY(villainRow), nil
	default:
		return 0, 0, fmt.Errorf("%w: unknown stage pile %q", ErrInvalid, key)
	}
}

// inPlayX returns the x of the in-play slot with the given index.
func inPlayX(slot int) int {
	return inPlayStartX + inPlayStepX*slot
}

// putInPlay creates a starting card and puts it in the villain's row, at x.
func (b *tableBuilder) putInPlay(ref pack.FaceRef, x int) (*Card, error) {
	c, def, err := b.newEncounterCard(ref.Card)
	if err != nil {
		return nil, err
	}
	if err := b.placeFace(c, def, ref.Face, x, rowY(villainRow)); err != nil {
		return nil, err
	}
	return c, nil
}

// placeFace puts a new encounter card on the table, face up on the given
// face, with the starting threat that face prints, if any.
func (b *tableBuilder) placeFace(c *Card, def pack.Card, face, x, y int) error {
	if face < 0 || face >= len(def.Faces) {
		return fmt.Errorf("%w: card %s has no face %d", ErrInvalid, def.Code, face)
	}
	b.placeOnTable(c, face, x, y)

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
// shuffled deck of one seat.
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
	b.placeOnTable(identity, alterEgoFace(identityDef), identityX, rowY(playerRow(seat)))

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
