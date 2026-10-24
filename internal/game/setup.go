package game

import (
	"fmt"
	"math/rand/v2"
	"slices"
	"strings"
	"time"

	"github.com/alexandreroman/intothefray/internal/pack"
)

// Default positions on the table, in table units (see the geometry rules).
//
// The table is laid out in rows: the villain's row on top, villainRowHeight
// high, then one row of rowHeight per seat (one deck, see seats.go), in seat order. Every row starts with its deck
// and its discard pile, then the villain or the identity; the villain's row
// goes on with the main scheme, and cards in play are added to the right. A
// hero with side decks lays them out after its discard pile, each followed by
// its own discard pile if it has one, sidePileStepX apart as the deck and the
// discard pile are. The identity then lies pileZoneGap after the end of the
// last pile: without side piles, it sits at identityX. The first player token
// lies under the first player's deck, in the empty bottom of their row.
// Things sit rowContentY below the top of their row, leaving room for the
// client's owner label above the piles. Out-of-play piles (victory display, set-aside cards) keep
// a position for the model, on the deck, but the client never draws them.
//
// The villain's row is taller so that it reads apart from the players' rows:
// about 1.2 portrait card heights (244 units, keeping the rows on the 10-unit
// grid) lie empty between its cards and the owner label of the first
// player's row. The client's focus view uses the same bands
// (web/src/table/rows.ts).
const (
	villainRowHeight = 470
	rowHeight        = 330
	rowContentY      = 30

	// portraitWidth and portraitHeight are the size of a portrait card, and
	// so of a pile.
	portraitWidth  = 140
	portraitHeight = 196
	// pileZoneGap is the room between the last pile of a row and the
	// cards in play after it.
	pileZoneGap = 60
	// inPlayGap is the room between two cards in play, the same for the
	// cards the setup puts in play and the cards played from the hand
	// (web/src/table/keys.ts). Turned 15° when exhausted, a portrait card
	// reaches about 23 further on each side: 50 lets two neighbours both be
	// exhausted without overlapping.
	inPlayGap = 50
	// The first player token, 84 by 70 (web/src/table/layout.ts), lies
	// centred under the deck, 28 taken to the grid, and firstPlayerGap below
	// it, on the grid: 14 units clear of the client's owner frame, which
	// reaches 10 units past the piles. It ends 10 units above the bottom of
	// the row.
	firstPlayerX   = 30
	firstPlayerGap = 24

	deckX        = 0
	discardX     = 160
	outOfPlayX   = 0
	identityX    = discardX + portraitWidth + pileZoneGap
	villainX     = 360
	mainSchemeX  = 520
	inPlayStartX = 760

	sidePileStepX = 160
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
	// Side decks and set-aside cards come last, so that a game without
	// them draws the same random numbers as before they existed: its table
	// and card ids stay the same for the same seed.
	for i, p := range g.Players {
		for slot, seat := range g.seatsOf(i) {
			if err := b.setupSideCards(seat, p.Decks[slot]); err != nil {
				return fmt.Errorf("%s: %w", p.Name, err)
			}
		}
	}

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
		FirstPlayer: Point{X: firstPlayerX, Y: rowY(playerRow(0)) + portraitHeight + firstPlayerGap},
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

func (t *Table) addPile(id string, kind PileKind, owner int, x, y int) *Pile {
	pile := &Pile{ID: id, Kind: kind, Owner: owner, X: x, Y: y, Cards: []string{}}
	t.Piles[id] = pile
	return pile
}

// tableBuilder creates the cards of a new table.
type tableBuilder struct {
	cat   *pack.Catalog
	rng   *rand.Rand
	table *Table
	// inPlayRight is the right edge of the last card put in play, 0 before
	// the first one.
	inPlayRight int
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
	return b.addSetCards(setCode, NoOwner, PileEncounter, pileID, skip)
}

// addSetCards creates every copy of every card of a set, with the given owner
// and home, and puts them on pileID. Cards whose canonical code is in skip are
// left out.
func (b *tableBuilder) addSetCards(setCode string, owner int, home, pileID string, skip map[string]bool) error {
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
			c, _, err := b.newCard(def.Code, owner, home)
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
	for _, ref := range start.InPlay {
		c, err := b.putInPlay(ref)
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
	for _, setCode := range encounterSets[1:] {
		placed, err := b.putSetInPlay(setCode, cfg.Difficulty)
		if err != nil {
			return pack.Scenario{}, err
		}
		skips[setCode] = placed
	}

	for _, setCode := range encounterSets {
		if err := b.addSetToPile(setCode, PileEncounter, skips[setCode]); err != nil {
			return pack.Scenario{}, err
		}
	}
	return scenario, nil
}

// putSetInPlay puts the cards a set starts in play at this difficulty (the
// "Setup." keyword) in the villain's row, after the cards already in play.
// It returns the canonical codes it placed, which stay out of the encounter
// deck.
func (b *tableBuilder) putSetInPlay(setCode string, difficulty pack.Difficulty) (map[string]bool, error) {
	set, ok := b.cat.Set(setCode)
	if !ok {
		return nil, fmt.Errorf("%w: unknown set %q", ErrInvalid, setCode)
	}

	placed := map[string]bool{}
	for _, ref := range set.InPlay[difficulty] {
		c, err := b.putInPlay(ref)
		if err != nil {
			return nil, err
		}
		placed[c.Code] = true
	}
	return placed, nil
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

// putInPlay creates a starting card and puts it in the villain's row: the
// first one at inPlayStartX, each later one inPlayGap past the right edge of
// the previous one, taken up to the grid.
func (b *tableBuilder) putInPlay(ref pack.FaceRef) (*Card, error) {
	c, def, err := b.newEncounterCard(ref.Card)
	if err != nil {
		return nil, err
	}
	x := inPlayStartX
	if b.inPlayRight > 0 {
		x = ceilToGrid(b.inPlayRight + inPlayGap)
	}
	if err := b.placeFace(c, def, ref.Face, x, rowY(villainRow)); err != nil {
		return nil, err
	}
	b.inPlayRight = x + cardWidth(def.Faces[ref.Face].Size)
	return c, nil
}

// cardWidth returns the width of a card face on the table, as the client
// draws it (web/src/table/layout.ts).
func cardWidth(size pack.Size) int {
	switch size {
	case pack.SizeLand, pack.SizeDoubleStd:
		return 196
	case pack.SizeDoubleLand:
		return 280
	default:
		return portraitWidth
	}
}

// ceilToGrid rounds a positive table coordinate up to the grid.
func ceilToGrid(v int) int {
	return (v + gridSize - 1) / gridSize * gridSize
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

// setupPlayer creates the identity, the nemesis cards, the obligation, the
// empty side piles and the shuffled deck of one seat. The cards of the side
// piles and the set-aside cards come later (see setupSideCards).
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
	identity.Identity = true
	hero, ok := b.cat.HeroByIdentity(deck.Hero)
	if !ok {
		return fmt.Errorf("%w: %s is not a hero identity", ErrInvalid, deck.Hero)
	}
	sidePiles, err := b.addSidePiles(seat, hero)
	if err != nil {
		return err
	}
	// The identity follows the last pile: the discard pile (index 1) or the
	// last side pile.
	x := pileX(1+sidePiles) + portraitWidth + pileZoneGap
	b.placeOnTable(identity, alterEgoFace(identityDef), x, rowY(playerRow(seat)))

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

	// Set-aside and side deck cards are created apart (see setupSideCards),
	// even when the deck list names them.
	apart, err := b.setAsideCodes(hero, deck)
	if err != nil {
		return err
	}
	sideCodes, err := b.sideDeckCodes(hero)
	if err != nil {
		return err
	}
	apart = append(apart, sideCodes...)
	for _, entry := range deck.Cards {
		code, err := b.canonical(entry.Code)
		if err != nil {
			return err
		}
		if code == identity.Code || slices.Contains(apart, code) {
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

// pileX returns the x of the pile at index i of a player's row: 0 for the
// deck, 1 for the discard pile, then the side piles.
func pileX(i int) int {
	return deckX + sidePileStepX*i
}

// addSidePiles creates the empty side decks of seat's hero, each followed by
// its discard pile when it has one, from left to right after the discard
// pile. It returns the number of piles it created.
func (b *tableBuilder) addSidePiles(seat int, hero pack.Hero) (int, error) {
	y := rowY(playerRow(seat))
	count := 0
	for i, setCode := range hero.SideDecks {
		set, ok := b.cat.Set(setCode)
		if !ok || set.Side == nil {
			return 0, fmt.Errorf("%w: %q is not a side deck", ErrInvalid, setCode)
		}
		// Side piles come after the deck and the discard pile.
		deck := b.table.addPile(sideDeckID(seat, i), KindSideDeck, seat, pileX(2+count), y)
		deck.Label = set.Side.Label
		deck.TopFaceUp = set.Side.TopFaceUp
		deck.Back = set.Side.Back
		count++
		if set.Side.Discard {
			discard := b.table.addPile(sideDiscardID(seat, i), KindSideDiscard, seat, pileX(2+count), y)
			discard.Label = set.Side.Label
			count++
		}
	}
	return count, nil
}

// setAsideCodes returns the canonical codes of the cards put aside at setup,
// each once: those listed by hero's set, then those listed by deck's cards
// (as Specialized Training lists the Specialist upgrades), in their listed
// order.
func (b *tableBuilder) setAsideCodes(hero pack.Hero, deck *DeckChoice) ([]string, error) {
	var listed []string
	if set, ok := b.cat.Set(hero.Set); ok {
		listed = append(listed, set.SetAside...)
	}
	for _, entry := range deck.Cards {
		def, _, err := b.cat.Card(entry.Code)
		if err != nil {
			return nil, fmt.Errorf("%w: %w", ErrInvalid, err)
		}
		listed = append(listed, def.SetAside...)
	}

	var codes []string
	for _, code := range listed {
		canonical, err := b.canonical(code)
		if err != nil {
			return nil, err
		}
		if !slices.Contains(codes, canonical) {
			codes = append(codes, canonical)
		}
	}
	return codes, nil
}

// sideDeckCodes returns the canonical codes of the cards of hero's side decks.
func (b *tableBuilder) sideDeckCodes(hero pack.Hero) ([]string, error) {
	var codes []string
	for _, setCode := range hero.SideDecks {
		set, ok := b.cat.Set(setCode)
		if !ok {
			return nil, fmt.Errorf("%w: unknown set %q", ErrInvalid, setCode)
		}
		for _, code := range set.Cards {
			canonical, err := b.canonical(code)
			if err != nil {
				return nil, err
			}
			codes = append(codes, canonical)
		}
	}
	return codes, nil
}

// setupSideCards creates the cards of seat's side decks, owned by the seat
// and at home in their side deck, and shuffles each deck. It then puts the
// cards the hero's set and the deck's cards set aside on seat's set-aside
// pile, every catalog copy of them, at home in seat's deck. The identity
// cards among them are other versions of the identity (see
// Card.IdentityVersion).
func (b *tableBuilder) setupSideCards(seat int, deck *DeckChoice) error {
	hero, ok := b.cat.HeroByIdentity(deck.Hero)
	if !ok {
		return fmt.Errorf("%w: %s is not a hero identity", ErrInvalid, deck.Hero)
	}
	for i, setCode := range hero.SideDecks {
		pileID := sideDeckID(seat, i)
		if err := b.addSetCards(setCode, seat, pileID, pileID, nil); err != nil {
			return err
		}
		b.shuffle(pileID)
	}

	area := string(PlayerArea(seat))
	setAside, err := b.setAsideCodes(hero, deck)
	if err != nil {
		return err
	}
	for _, code := range setAside {
		def, _, err := b.cat.Card(code)
		if err != nil {
			return fmt.Errorf("%w: %w", ErrInvalid, err)
		}
		for range def.Quantity {
			c, _, err := b.newCard(code, seat, "deck:"+area)
			if err != nil {
				return err
			}
			c.IdentityVersion = isIdentityCard(def)
			b.pushToPile("aside:"+area, c)
		}
	}
	return nil
}

// isIdentityCard reports whether def is an identity: one of its faces is a
// hero or an alter ego.
func isIdentityCard(def pack.Card) bool {
	return slices.ContainsFunc(def.Faces, func(face pack.Face) bool {
		return face.Type == faceTypeHero || face.Type == faceTypeAlterEgo
	})
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
