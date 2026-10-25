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
// and its discard pile, then the villain or the identity.
//
// The villain's row is one cursor walking left to right, every position taken
// up to the grid: the classic encounter deck at deckX with its discard pile
// (if the scenario has one), then the scenario decks no stage names, each with
// its discard pile if it has one, then each stage in order: its own deck group
// first, then the stage card, then the cards in play laid out "with" it, and
// finally the other cards in play. A scenario deck is compact, 100 by 140, its
// discard pile compactDiscardStepX right of it. A deck group lies pileZoneGap
// after what precedes it; a stage card pileZoneGap after piles and inPlayGap
// after a card; cards in play inPlayGap apart. The classic scenarios have no
// deck group: the villain lies at 360, the main scheme at 550 and the first
// card in play at 800. The active counter lies under its stage card, as the
// first player token does under the first player's deck.
//
// In a player's row, the villain's place is the identity's. A
// hero with side decks lays them out after its discard pile, each followed by
// its own discard pile if it has one, sidePileStepX apart as the deck and the
// discard pile are. The identity then lies pileZoneGap after the end of the
// last pile: without side piles, it sits at identityX. The first player token
// lies under the first player's deck, in the empty bottom of their row.
// Things sit rowContentY below the top of their row, leaving room for the
// client's owner label above the piles. Out-of-play piles (victory display, set-aside cards) keep
// a position for the model, on the first villain pile, but the client never draws them.
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
	// so of a pile; landscapeWidth is the width of a landscape card, such as
	// a main scheme.
	portraitWidth  = 140
	portraitHeight = 196
	landscapeWidth = 196
	// pileZoneGap is the room between the last pile of a row and the
	// cards in play after it.
	pileZoneGap = 60
	// inPlayGap is the room between two cards in play, the same for the
	// cards the setup puts in play and the cards played from the hand or a
	// pile box (freeSlot, web/src/table/keys.ts). Turned 15° when exhausted,
	// a portrait card reaches about 23 further on each side: 50 lets two
	// neighbours both be exhausted without overlapping.
	inPlayGap = 50
	// The first player token, 84 by 70 (web/src/table/layout.ts), lies
	// centred under the deck, 28 taken to the grid, and firstPlayerGap below
	// it, on the grid: 14 units clear of the client's owner frame, which
	// reaches 10 units past the piles. It ends 10 units above the bottom of
	// the row.
	firstPlayerX   = 30
	firstPlayerGap = 24
	// activeOffsetX takes the centre of the active counter under its stage card to the grid: 40 on a 140 wide card
	// puts the 70 wide counter's centre at 75, not 70.
	activeOffsetX = 40

	deckX      = 0
	discardX   = 160
	outOfPlayX = 0
	identityX  = discardX + portraitWidth + pileZoneGap
	// The first card in play of a villain's row with no stage before it: past a classic villain (identityX, where the
	// villain lies as the identity does) and main scheme, landscape, rounded up to the grid as ceilToGrid does.
	inPlayStartX = (identityX + portraitWidth + inPlayGap + landscapeWidth + inPlayGap +
		gridSize - 1) / gridSize * gridSize

	// A scenario deck is compact, and its discard pile lies compactDiscardStepX right of it.
	compactWidth        = 100
	compactDiscardStepX = 120

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
		return invalid("no scenario is configured")
	}
	for _, p := range g.Players {
		if !p.ready() {
			return invalid("%s is missing a deck", p.Name)
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
	if b.table.Piles[PileEncounter] != nil {
		b.shuffle(PileEncounter)
	}
	// Side decks and set-aside cards draw their random numbers after the
	// main decks and the encounter deck, so that they leave the order and
	// the card ids of everything else the same for a seed.
	for i, p := range g.Players {
		for slot, seat := range g.seatsOf(i) {
			if err := b.setupSideCards(seat, p.Decks[slot]); err != nil {
				return fmt.Errorf("%s: %w", p.Name, err)
			}
		}
	}

	// The scenario decks draw theirs last, for the same reason.
	if err := b.setupScenarioDecks(scenario); err != nil {
		return err
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
			return nil, invalid("unknown set %q", code)
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
		t.addPile(playerDeckID(area), KindDeck, seat, deckX, y)
		t.addPile(playerDiscardID(area), KindDiscard, seat, discardX, y)
		t.addPile(playerAsideID(area), KindAside, seat, outOfPlayX, y)
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
	// inPlayRight is the right edge of the last thing put in the villain's
	// row (a pile, a stage card or a card in play), 0 before the first one.
	inPlayRight int
	// lastPile tells that the last thing put in the villain's row is a pile.
	lastPile bool
	// apart holds the codes of the villain set's cards the scenario places
	// apart; the scenario decks leave them out.
	apart map[string]bool
	// selfContained tells that the scenario uses only its own cards: heroes
	// bring no obligation and no nemesis set.
	selfContained bool
}

// newCard creates one card instance. The code may be any alias; the card
// gets the canonical code. It is not placed anywhere yet.
func (b *tableBuilder) newCard(code string, owner int, home string) (*Card, pack.Card, error) {
	def, err := b.def(code)
	if err != nil {
		return nil, pack.Card{}, err
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
		return invalid("unknown set %q", setCode)
	}
	return b.addCards(set.Cards, owner, home, pileID, skip)
}

// addCards creates every copy of the cards codes lists, with the given owner
// and home, and puts them on pileID in that order. Cards whose canonical code
// is in skip are left out.
func (b *tableBuilder) addCards(codes []string, owner int, home, pileID string, skip map[string]bool) error {
	for _, code := range codes {
		def, err := b.def(code)
		if err != nil {
			return err
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

// def returns the catalog card of any card alias, or an ErrInvalid error.
func (b *tableBuilder) def(code string) (pack.Card, error) {
	def, _, err := b.cat.Card(code)
	if err != nil {
		return pack.Card{}, fmt.Errorf("%w: %w", ErrInvalid, err)
	}
	return def, nil
}

// canonical returns the canonical code of any card alias.
func (b *tableBuilder) canonical(code string) (string, error) {
	def, err := b.def(code)
	if err != nil {
		return "", err
	}
	return def.Code, nil
}

// setupScenario creates the villain's row: scenario decks, stages, starting
// cards, set-aside cards and the classic encounter deck, if the scenario has
// one. The classic deck stays unshuffled until the obligations of the heroes
// have joined it; the scenario decks are filled later (see setupScenarioDecks).
func (b *tableBuilder) setupScenario(cfg LobbyConfig) (pack.Scenario, error) {
	scenario, ok := b.cat.Scenario(cfg.Scenario)
	if !ok {
		return pack.Scenario{}, invalid("unsupported scenario %q", cfg.Scenario)
	}
	start, ok := scenario.Start[cfg.Difficulty]
	if !ok {
		return pack.Scenario{}, invalid("scenario %q has no %s setup", scenario.ID, cfg.Difficulty)
	}

	// Cards that are set up by hand and so stay out of the encounter deck.
	apart := map[string]bool{}
	b.apart = apart
	b.selfContained = scenario.SelfContained

	classic := !slices.ContainsFunc(scenario.Decks, func(d pack.ScenarioDeck) bool { return d.Encounter })
	if classic {
		b.inPlayRight = discardX + portraitWidth
		b.lastPile = true
	} else {
		delete(b.table.Piles, PileEncounter)
		delete(b.table.Piles, PileEncounterDiscard)
	}

	// Decks no stage names come first, then each stage with its own deck.
	for _, deck := range scenario.Decks {
		if !slices.ContainsFunc(scenario.Piles, func(p pack.Pile) bool { return p.Deck == deck.Key }) {
			b.addDeckGroup(deck)
		}
	}
	inPlay := make([]bool, len(start.InPlay))
	for _, pile := range scenario.Piles {
		// The cards of a stage are at home in its scenario deck, if it has
		// one, else in the classic encounter deck.
		home := PileEncounter
		if pile.Deck != "" {
			i := slices.IndexFunc(scenario.Decks, func(d pack.ScenarioDeck) bool { return d.Key == pile.Deck })
			if i < 0 {
				return pack.Scenario{}, invalid("stage %q has no deck %q", pile.Key, pile.Deck)
			}
			deck := scenario.Decks[i]
			b.addDeckGroup(deck)
			home, _ = scenarioDeckIDs(deck.Key, deck.Encounter)
		}
		stageCard, err := b.setupStage(pile, home, start.Top[pile.Key], apart)
		if err != nil {
			return pack.Scenario{}, err
		}
		if pile.Key == scenario.Active {
			b.table.Active = &Point{
				X: stageCard.X + activeOffsetX,
				Y: rowY(villainRow) + portraitHeight + firstPlayerGap,
			}
		}
		for i, ref := range start.InPlay {
			if ref.With != pile.Key {
				continue
			}
			c, err := b.putInPlay(ref, home)
			if err != nil {
				return pack.Scenario{}, err
			}
			apart[c.Code] = true
			inPlay[i] = true
		}
	}
	if scenario.Active != "" && b.table.Active == nil {
		return pack.Scenario{}, invalid("no stage %q for the active counter", scenario.Active)
	}
	for i, ref := range start.InPlay {
		if inPlay[i] {
			continue
		}
		if ref.With != "" {
			return pack.Scenario{}, invalid("card %s is with no stage %q", ref.Card, ref.With)
		}
		c, err := b.putInPlay(ref, PileEncounter)
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

	if !classic {
		return scenario, b.requireNoVillainLeftover(scenario.VillainSet)
	}
	for _, setCode := range encounterSets {
		if err := b.addSetToPile(setCode, PileEncounter, skips[setCode]); err != nil {
			return pack.Scenario{}, err
		}
	}
	return scenario, nil
}

// requireNoVillainLeftover fails if the villain set has a card the scenario
// did not place apart: without a classic encounter deck, it would go nowhere.
func (b *tableBuilder) requireNoVillainLeftover(setCode string) error {
	set, ok := b.cat.Set(setCode)
	if !ok {
		return invalid("unknown set %q", setCode)
	}
	for _, code := range set.Cards {
		canonical, err := b.canonical(code)
		if err != nil {
			return err
		}
		if !b.apart[canonical] {
			return invalid("card %s of set %q has no place, the scenario has no encounter deck", canonical, setCode)
		}
	}
	return nil
}

// addDeckGroup lays out the piles of a scenario deck at the cursor of the
// villain's row: the deck, then its discard pile compactDiscardStepX right of it.
func (b *tableBuilder) addDeckGroup(deck pack.ScenarioDeck) {
	deckID, discardID := scenarioDeckIDs(deck.Key, deck.Encounter)
	deckKind, discardKind := KindScenarioDeck, KindScenarioDiscard
	if deck.Encounter {
		deckKind, discardKind = KindEncounter, KindEncounterDiscard
	}
	y := rowY(villainRow)
	x := b.slot(compactWidth, pileZoneGap, deckX)
	pile := b.table.addPile(deckID, deckKind, NoOwner, x, y)
	pile.Label, pile.Compact = deck.Label, true
	if deck.Discard {
		pile = b.table.addPile(discardID, discardKind, NoOwner, x+compactDiscardStepX, y)
		pile.Label, pile.Compact = deck.Label, true
		b.inPlayRight = pile.X + compactWidth
	}
	b.lastPile = true
}

// slot returns the x of the next thing of width w in the villain's row: gap
// past the last one, taken up to the grid, or first when it is the first.
func (b *tableBuilder) slot(w, gap, first int) int {
	x := first
	if b.inPlayRight > 0 {
		x = ceilToGrid(b.inPlayRight + gap)
	}
	b.inPlayRight = x + w
	b.lastPile = false
	return x
}

// setupScenarioDecks creates the cards of the scenario decks: every copy of the
// cards of the deck's sets, then of its cards, but those the scenario placed
// apart. A deck is shuffled unless it is ordered, in which case its first
// listed card ends on top.
func (b *tableBuilder) setupScenarioDecks(scenario pack.Scenario) error {
	for _, deck := range scenario.Decks {
		deckID, _ := scenarioDeckIDs(deck.Key, deck.Encounter)
		for _, setCode := range deck.Sets {
			if err := b.addSetCards(setCode, NoOwner, deckID, deckID, b.apart); err != nil {
				return err
			}
		}
		if err := b.addCards(deck.Cards, NoOwner, deckID, deckID, b.apart); err != nil {
			return err
		}
		if deck.Ordered {
			slices.Reverse(b.table.Piles[deckID].Cards)
		} else {
			b.shuffle(deckID)
		}
	}
	return nil
}

// putSetInPlay puts the cards a set starts in play at this difficulty (the
// "Setup." keyword) in the villain's row, after the cards already in play.
// It returns the canonical codes it placed, which stay out of the encounter
// deck.
func (b *tableBuilder) putSetInPlay(setCode string, difficulty pack.Difficulty) (map[string]bool, error) {
	set, ok := b.cat.Set(setCode)
	if !ok {
		return nil, invalid("unknown set %q", setCode)
	}

	placed := map[string]bool{}
	for _, ref := range set.InPlay[difficulty] {
		c, err := b.putInPlay(ref, PileEncounter)
		if err != nil {
			return nil, err
		}
		placed[c.Code] = true
	}
	return placed, nil
}

// setupStage creates the cards of one stage pile. The card named by top goes
// to the table on its start face; the others wait in the stage zone.
// Its cards have home as their home. It returns the card on the table.
func (b *tableBuilder) setupStage(pile pack.Pile, home string, top pack.FaceRef, apart map[string]bool) (*Card, error) {
	topCode, err := b.canonical(top.Card)
	if err != nil {
		return nil, err
	}

	stage := &Stage{Key: pile.Key, Label: pile.Label}
	var current *Card
	for _, code := range pile.Cards {
		c, def, err := b.newCard(code, NoOwner, home)
		if err != nil {
			return nil, err
		}
		apart[c.Code] = true
		stage.Cards = append(stage.Cards, c.ID)

		if c.Code != topCode {
			c.Zone = ZoneStage
			continue
		}
		gap := inPlayGap
		if b.lastPile {
			gap = pileZoneGap
		}
		x, err := b.slotFor(def, top.Face, gap, deckX)
		if err != nil {
			return nil, err
		}
		if err := b.placeFace(c, def, top.Face, x, rowY(villainRow)); err != nil {
			return nil, err
		}
		stage.Current = c.ID
		current = c
	}
	if current == nil {
		return nil, invalid("stage %q has no card %s", pile.Key, top.Card)
	}
	b.table.Stages = append(b.table.Stages, stage)
	return current, nil
}

// slotFor is slot for the given face of a card.
func (b *tableBuilder) slotFor(def pack.Card, face, gap, first int) (int, error) {
	if face < 0 || face >= len(def.Faces) {
		return 0, invalid("card %s has no face %d", def.Code, face)
	}
	return b.slot(cardWidth(def.Faces[face].Size), gap, first), nil
}

// putInPlay creates a starting card and puts it in the villain's row, inPlayGap
// past the right edge of the previous thing, taken up to the grid (the first
// thing of the row, at inPlayStartX). The card has home as its home.
func (b *tableBuilder) putInPlay(ref pack.FaceRef, home string) (*Card, error) {
	c, def, err := b.newCard(ref.Card, NoOwner, home)
	if err != nil {
		return nil, err
	}
	x, err := b.slotFor(def, ref.Face, inPlayGap, inPlayStartX)
	if err != nil {
		return nil, err
	}
	if err := b.placeFace(c, def, ref.Face, x, rowY(villainRow)); err != nil {
		return nil, err
	}
	return c, nil
}

// cardWidth returns the width of a card face on the table, as the client
// draws it (web/src/table/layout.ts).
func cardWidth(size pack.Size) int {
	switch size {
	case pack.SizeLand, pack.SizeDoubleStd:
		// A double-size portrait card is as wide as a landscape one.
		return landscapeWidth
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
		return invalid("card %s has no face %d", def.Code, face)
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
		return invalid("the deck has no hero")
	}
	area := PlayerArea(seat)
	deckID := playerDeckID(area)

	identity, identityDef, err := b.newCard(deck.Hero, seat, deckID)
	if err != nil {
		return err
	}
	identity.Identity = true
	hero, ok := b.cat.HeroByIdentity(deck.Hero)
	if !ok {
		return invalid("%s is not a hero identity", deck.Hero)
	}
	sidePiles, err := b.addSidePiles(seat, hero)
	if err != nil {
		return err
	}
	// The identity follows the last pile: the discard pile (index 1) or the
	// last side pile.
	x := pileX(1+sidePiles) + portraitWidth + pileZoneGap
	b.placeOnTable(identity, alterEgoFace(identityDef), x, rowY(playerRow(seat)))

	if hero.Obligation != "" && !b.selfContained {
		c, _, err := b.newEncounterCard(hero.Obligation)
		if err != nil {
			return err
		}
		b.pushToPile(PileEncounter, c)
	}
	if hero.Nemesis != "" && !b.selfContained {
		if err := b.addSetToPile(hero.Nemesis, playerAsideID(area), nil); err != nil {
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
			return 0, invalid("%q is not a side deck", setCode)
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
		def, err := b.def(entry.Code)
		if err != nil {
			return nil, err
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
			return nil, invalid("unknown set %q", setCode)
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
		return invalid("%s is not a hero identity", deck.Hero)
	}
	for i, setCode := range hero.SideDecks {
		pileID := sideDeckID(seat, i)
		if err := b.addSetCards(setCode, seat, pileID, pileID, nil); err != nil {
			return err
		}
		b.shuffle(pileID)
	}

	area := PlayerArea(seat)
	setAside, err := b.setAsideCodes(hero, deck)
	if err != nil {
		return err
	}
	for _, code := range setAside {
		def, err := b.def(code)
		if err != nil {
			return err
		}
		for range def.Quantity {
			c, _, err := b.newCard(code, seat, playerDeckID(area))
			if err != nil {
				return err
			}
			c.IdentityVersion = isIdentityCard(def)
			b.pushToPile(playerAsideID(area), c)
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
