package game

import (
	"fmt"
	"strings"

	"github.com/alexandreroman/intothefray/internal/pack"
)

// faceTypeMainScheme is the marvelcdb type of a main scheme face.
const faceTypeMainScheme = "main_scheme"

// topCount writes "the top card" or "the top N cards".
func topCount(n int) string {
	if n == 1 {
		return "the top card"
	}
	return fmt.Sprintf("the top %d cards", n)
}

// pileName names a pile from the point of view of who: the piles of any of
// their seats are "their" piles. The pile of a player who holds several decks
// adds the deck's hero: "their Spider-Man deck", "Alex's Spider-Man deck". A
// side pile goes by its label: "their Invocation deck", "Alex's Doctor Strange
// Invocation discard pile". The client parses these names (narratedName in
// web/src/table/animate.ts).
func (g *Game) pileName(who actor, id string) string {
	switch id {
	case PileEncounter:
		return "the encounter deck"
	case PileEncounterDiscard:
		return "the encounter discard pile"
	case PileVictory:
		return "the victory display"
	case PileScenarioAside:
		return "the set-aside cards"
	}

	pile, ok := g.Table.Piles[id]
	if !ok {
		return "a pile"
	}
	var noun string
	switch pile.Kind {
	case KindDeck:
		noun = "deck"
	case KindDiscard:
		noun = "discard pile"
	case KindAside:
		noun = "set-aside cards"
	case KindSideDeck:
		noun = pile.Label + " deck"
	case KindSideDiscard:
		noun = pile.Label + " discard pile"
	default:
		noun = "pile"
	}
	if hero := g.deckHero(pile.Owner); hero != "" {
		noun = hero + " " + noun
	}
	if who.owns(pile.Owner) {
		return "their " + noun
	}
	return g.playerName(pile.Owner) + "'s " + noun
}

// seatName names the deck at seat: its player, with the deck's hero when the
// player holds several decks, as in "Alex (Spider-Man)".
func (g *Game) seatName(seat int) string {
	name := g.playerName(seat)
	if hero := g.deckHero(seat); hero != "" {
		name += " (" + hero + ")"
	}
	return name
}

// deckHero returns the hero name of the deck at seat when its player holds
// several decks, "" otherwise: the player's name alone tells the decks of a
// one-deck player apart.
func (g *Game) deckHero(seat int) string {
	player := g.seatPlayer(seat)
	if player < 0 {
		return ""
	}
	seats := g.seatsOf(player)
	if len(seats) < 2 {
		return ""
	}
	deck := g.Players[player].Decks[seat-seats[0]]
	if deck == nil {
		return ""
	}
	return deck.HeroName
}

// playerName names the player who holds seat.
func (g *Game) playerName(seat int) string {
	player := g.seatPlayer(seat)
	if player < 0 {
		return "another player"
	}
	return g.Players[player].Name
}

// phrase is a history line, or a piece of one, in parts. Only the narrator
// flags a part as a card name, with cardName: any other text, such as a
// player name, stays plain whatever it holds.
type phrase []LogPart

// words is plain text.
func words(s string) phrase {
	return phrase{{Text: s}}
}

// cardName is the printed name of the face ref points at. The reference lets
// a client show the name in the viewer's language; the text stays English.
func cardName(name string, ref pack.FaceRef) phrase {
	return phrase{{Text: name, Card: true, Ref: &ref}}
}

// join puts pieces one after the other, merging the plain parts that follow
// each other.
func join(pieces ...phrase) phrase {
	var joined phrase
	for _, piece := range pieces {
		for _, part := range piece {
			last := len(joined) - 1
			if last >= 0 && !joined[last].Card && !part.Card {
				joined[last].Text += part.Text
				continue
			}
			joined = append(joined, part)
		}
	}
	return joined
}

// String returns the plain text of p.
func (p phrase) String() string {
	var b strings.Builder
	for _, part := range p {
		b.WriteString(part.Text)
	}
	return b.String()
}

// parts returns the parts of p when it names a card, nil otherwise: the text
// alone tells a line that names none.
func (p phrase) parts() []LogPart {
	for _, part := range p {
		if part.Card {
			return p
		}
	}
	return nil
}

// logLine is the history line of one recorded action.
type logLine struct {
	text   phrase
	cards  []string // touched cards everyone can see after the action
	merged phrase   // text of a merged line, nil to keep text
}

func (l logLine) mergedText() phrase {
	if l.merged != nil {
		return l.merged
	}
	return l.text
}

// mergeKey returns the key under which successive changes share a history
// line (see mergeWindow), or "" when a never merges.
func mergeKey(a Action) string {
	switch a.Kind {
	case ActFlip:
		return "flip:" + a.Card
	case ActToken, ActStatus, ActModifier:
		return fmt.Sprintf("%s:%s:%s", a.Kind, a.Card, a.Name)
	default:
		return ""
	}
}

// counterNoun is how a token or status reads in a history line.
type counterNoun struct{ one, many string }

func (c counterNoun) count(n int) string {
	if n == 1 {
		return c.one
	}
	return c.many
}

var counterNouns = map[string]counterNoun{
	"dmg":       {"damage", "damage"},
	"thr":       {"threat", "threat"},
	"gen":       {"counter", "counters"},
	"stunned":   {"stunned status", "stunned statuses"},
	"confused":  {"confused status", "confused statuses"},
	"tough":     {"tough status", "tough statuses"},
	"retaliate": {"retaliate", "retaliate"},
	"locked":    {"locked status", "locked statuses"},
}

// hiddenCard is how the history names a card nobody could see.
const hiddenCard = "a card"

// pile is the name of a pile as plain words: a player name may be part of it.
func (n narrator) pile(id string) phrase {
	return words(n.game.pileName(n.who, id))
}

// narrator writes history lines from the actor's point of view. A card is
// named only when everyone could see it before or after the action.
type narrator struct {
	game   *Game
	cat    *pack.Catalog
	who    actor
	before *Table
	after  *Table
}

// arrangingKinds only arrange the table: they write no history line and
// cannot be undone. Every other table action has a case in describe; so does
// a reorder of a deck's top, which only arranges unless it takes a revealed
// card back (see reorderEvent).
var arrangingKinds = map[Kind]bool{
	ActMove:        true,
	ActAttach:      true,
	ActHandOrder:   true,
	ActFirstPlayer: true,
	ActArrowAdd:    true,
	ActArrowClear:  true,
}

// describe writes the history line of a, which has just been applied. It
// returns false for the arranging kinds (see arrangingKinds), and for a group
// of actions of such a kind.
func (n narrator) describe(a Action) (logLine, bool) {
	switch a.Kind {
	case ActToHand:
		return n.toHandEvent(a), true
	case ActToDeck:
		return n.toDeckEvent(a), true
	case ActDiscard:
		text := join(words("discarded "), n.name(a.Card))
		if n.before.Cards[a.Card].Zone == ZoneHand {
			text = join(text, words(" from hand"))
		}
		return logLine{text: text, cards: n.visibleCards(a.Card)}, true
	case ActToPile:
		text := join(words("moved "), n.name(a.Card), words(" to "), n.pile(a.Target))
		return logLine{text: text, cards: n.visibleCards(a.Card)}, true
	case ActPlay:
		if n.after.Cards[a.Card].FaceDown {
			return n.faceDownPlayEvent(a), true
		}
		if a.Target != "" {
			text := join(words("played "), n.name(a.Card), words(" under "), n.name(a.Target))
			return logLine{text: text, cards: n.visibleCards(a.Card, a.Target)}, true
		}
		return logLine{text: join(words("played "), n.name(a.Card)), cards: n.visibleCards(a.Card)}, true
	case ActExhaust:
		verb := "readied "
		if n.after.Cards[a.Card].Exhausted {
			verb = "exhausted "
		}
		return logLine{text: join(words(verb), n.name(a.Card)), cards: n.visibleCards(a.Card)}, true
	case ActReadyAll:
		text := words(fmt.Sprintf("readied all cards (%d)", len(a.Cards)))
		return logLine{text: text, cards: n.visibleCards(a.Cards...)}, true
	case ActFlip:
		return n.flipEvent(a), true
	case ActToken, ActStatus:
		return n.counterEvent(a), true
	case ActModifier:
		return n.modifierEvent(a), true
	case ActChooseStage:
		return n.stageEvent(a), true
	case ActDraw:
		return logLine{text: words(n.drawText(a))}, true
	case ActReveal:
		id := a.Cards[0]
		text := join(words("revealed "), n.name(id))
		// The encounter deck, which a reveal naming no pile takes from, goes unsaid.
		if a.Pile != "" {
			text = join(text, words(" from "), n.pile(a.Pile))
		}
		return logLine{text: text, cards: n.visibleCards(id)}, true
	case ActDeal:
		return logLine{text: words("dealt an encounter card face down to " + n.areaName(a.Area))}, true
	case ActReorderTop:
		return n.reorderEvent(a)
	case ActDiscardTop:
		text := join(words("discarded "+topCount(len(a.Cards))+" of "), n.pile(a.Pile))
		return logLine{text: text, cards: n.visibleCards(a.Cards...)}, true
	case ActShuffle:
		return logLine{text: join(words("shuffled "), n.pile(a.Pile))}, true
	case ActShuffleBack:
		deck, _ := deckOfDiscard(a.Pile)
		return logLine{text: join(words("shuffled "), n.pile(a.Pile), words(" into "), n.pile(deck))}, true
	case ActShuffleIn:
		return logLine{text: join(words("shuffled "), n.pile(a.Pile), words(" into "), n.pile(PileEncounter))}, true
	case ActGroup:
		// A group of moves only arranges the table, as a single move does.
		if arrangingKinds[a.Actions[0].Kind] {
			return logLine{}, false
		}
		return n.groupEvent(a), true
	default:
		return logLine{}, false
	}
}

// reorderEvent narrates a reorder of a deck's top that took the card revealed
// on it back into the deck, renaming the reordered cards (see
// resolveReorderTop). Any other reorder only arranges the deck: no line. Like
// a card put on a deck, the line does not follow the card into the deck.
func (n narrator) reorderEvent(a Action) (logLine, bool) {
	covered := n.before.revealedOn(a.Pile)
	if a.Renames == nil || len(covered) == 0 {
		return logLine{}, false
	}
	top := covered[len(covered)-1].ID
	return logLine{text: join(words("put "), n.name(top), words(" back into "), n.pile(a.Pile))}, true
}

func (n narrator) toHandEvent(a Action) logLine {
	c := n.before.Cards[a.Card]
	if c.Zone == ZonePile && !visible(n.before, a.Card) {
		return logLine{text: join(words("took a card from "), n.pile(c.Pile), words(" into hand"))}
	}
	return logLine{text: join(words("took "), n.name(a.Card), words(" into hand"))}
}

func (n narrator) toDeckEvent(a Action) logLine {
	card := n.name(a.Card)
	deck := n.pile(n.before.Cards[a.Card].Home)
	var text phrase
	switch a.Where {
	case whereBottom:
		text = join(words("put "), card, words(" at the bottom of "), deck)
	case whereShuffle:
		text = join(words("shuffled "), card, words(" into "), deck)
	default:
		text = join(words("put "), card, words(" on top of "), deck)
	}
	return logLine{text: text}
}

// groupEvent narrates a group that takes its cards off the table, the names
// in brackets as details: "discarded 3 cards (Black Cat, a card, Web-Shooter)".
// Every action of a group is of one kind (see resolveGroup).
func (n narrator) groupEvent(a Action) logLine {
	cards := make([]string, 0, len(a.Actions))
	targets := make([]string, 0, len(a.Actions))
	homes := make([]string, 0, len(a.Actions))
	for _, sub := range a.Actions {
		cards = append(cards, sub.Card)
		targets = append(targets, sub.Target)
		homes = append(homes, n.before.Cards[sub.Card].Home)
	}
	count := fmt.Sprintf("%d cards", len(cards))

	var text phrase
	first := a.Actions[0]
	switch first.Kind {
	case ActDiscard:
		text = words("discarded " + count)
	case ActToHand:
		text = words("took " + count + " into hand")
	case ActToPile:
		text = join(words("moved "+count+" to "), n.sharedPile(targets, "several piles"))
	default: // ActToDeck, on top or at the bottom: a group never shuffles.
		where := " on top of "
		if first.Where == whereBottom {
			where = " at the bottom of "
		}
		text = join(words("put "+count+where), n.sharedPile(homes, "their decks"))
	}
	text = join(text, words(" ("), n.cardList(cards), words(")"))
	return logLine{text: text, cards: n.visibleCards(cards...)}
}

// sharedPile names the pile all ids are, or several when they differ.
func (n narrator) sharedPile(ids []string, several string) phrase {
	for _, id := range ids[1:] {
		if id != ids[0] {
			return words(several)
		}
	}
	return n.pile(ids[0])
}

// cardList names cards one after the other: "Black Cat, a card, Web-Shooter".
func (n narrator) cardList(ids []string) phrase {
	var list phrase
	for i, id := range ids {
		if i > 0 {
			list = join(list, words(", "))
		}
		list = join(list, n.name(id))
	}
	return list
}

// drawText narrates a draw. A draw from a side deck names it: "drew 1 card
// from their Invocation deck". A player holding several decks also learns
// which deck the cards came from: "drew 2 cards from their Spider-Man deck".
func (n narrator) drawText(a Action) string {
	text := fmt.Sprintf("drew %d cards", len(a.Cards))
	if len(a.Cards) == 1 {
		text = "drew 1 card"
	}
	// resolveDraw sends the cards to the hand of the deck's owner.
	deckID := "deck:" + string(a.Area)
	if a.Pile != "" {
		deckID = a.Pile
	}
	deck := n.before.Piles[deckID]
	if deck == nil {
		return text
	}
	if deck.Kind != KindSideDeck && n.game.deckHero(deck.Owner) == "" {
		return text
	}
	return text + " from " + n.game.pileName(n.who, deck.ID)
}

// faceDownPlayEvent narrates a play that lands face down (see landsFaceDown)
// without naming the card: "played a card face down from their deck", and
// with a target, "… under Rhino".
func (n narrator) faceDownPlayEvent(a Action) logLine {
	text := join(words("played a card face down from "), n.pile(n.before.Cards[a.Card].Pile))
	if a.Target == "" {
		return logLine{text: text}
	}
	text = join(text, words(" under "), n.name(a.Target))
	return logLine{text: text, cards: n.visibleCards(a.Target)}
}

func (n narrator) flipEvent(a Action) logLine {
	old, cur := n.before.Cards[a.Card], n.after.Cards[a.Card]
	if cur.Zone == ZonePile {
		// Turned face down, a revealed card went back on top of its deck
		// (see applyFlip). Like a card put on a deck, the line does not follow it there.
		return logLine{text: join(words("put "), n.name(a.Card), words(" back on top of "), n.pile(cur.Pile))}
	}
	var text phrase
	switch {
	case old.FaceDown:
		text = join(words("turned "), n.faceName(cur), words(" face up"))
	case cur.FaceDown:
		text = join(words("turned "), n.faceName(old), words(" face down"))
	default:
		from, to := n.faceName(old), n.faceName(cur)
		// Both faces of a main scheme share a name; their stages tell them apart.
		if from.String() == to.String() {
			from, to = n.stageName(old), n.stageName(cur)
		}
		text = join(words("flipped "), from)
		if from.String() != to.String() {
			text = join(text, words(" to "), to)
		}
	}
	return logLine{text: text, cards: n.visibleCards(a.Card)}
}

func (n narrator) counterEvent(a Action) logLine {
	before, after := counterValue(n.before, a), counterValue(n.after, a)
	noun := counterNouns[a.Name]
	card := n.name(a.Card)
	set := join(words("set "+noun.many+" on "), card, words(fmt.Sprintf(" to %d", after)))

	text := set
	switch diff := after - before; {
	case diff > 0:
		text = join(words(fmt.Sprintf("added %d %s to ", diff, noun.count(diff))), card)
	case diff < 0:
		text = join(words(fmt.Sprintf("removed %d %s from ", -diff, noun.count(-diff))), card)
	}
	return logLine{text: text, cards: n.visibleCards(a.Card), merged: set}
}

// modifierEvent narrates a change of a stat modifier with the change it made:
// "gave Rhino −2 ATK". Merged, the line tells the modifier the card ends up
// with: "set the DEF modifier on Spider-Man to +2", or "cleared the DEF
// modifier on Spider-Man" back at 0.
func (n narrator) modifierEvent(a Action) logLine {
	before, after := counterValue(n.before, a), counterValue(n.after, a)
	stat := strings.ToUpper(a.Name)
	card := n.name(a.Card)

	set := join(words("set the "+stat+" modifier on "), card, words(" to "+signed(after)))
	if after == 0 {
		set = join(words("cleared the "+stat+" modifier on "), card)
	}
	text := join(words("gave "), card, words(" "+signed(after-before)+" "+stat))
	return logLine{text: text, cards: n.visibleCards(a.Card), merged: set}
}

// signed writes n with its sign, a real minus sign (U+2212) when negative:
// "+2", "−1".
func signed(n int) string {
	if n < 0 {
		return fmt.Sprintf("\u2212%d", -n)
	}
	return fmt.Sprintf("+%d", n)
}

// counterValue returns the token, status or modifier named by a on its card
// in t.
func counterValue(t *Table, a Action) int {
	c := t.Cards[a.Card]
	switch a.Kind {
	case ActStatus:
		return c.Status[a.Name]
	case ActModifier:
		return c.Mods[a.Name]
	default:
		return c.Tokens[a.Name]
	}
}

func (n narrator) stageEvent(a Action) logLine {
	stage := n.before.stage(a.Stage)
	label := "the " + strings.ToLower(stage.Label)
	previous, chosen := n.before.Cards[stage.Current], n.after.Cards[a.Card]
	if previous.ID == chosen.ID {
		return logLine{
			text:  join(words("turned "+label+" to "), n.stageName(chosen)),
			cards: n.visibleCards(chosen.ID),
		}
	}
	return logLine{
		text:  join(words("replaced "+label+" "), n.stageName(previous), words(" with "), n.stageName(chosen)),
		cards: n.visibleCards(previous.ID, chosen.ID),
	}
}

// areaName names the deck at the seat of area (see seatName).
func (n narrator) areaName(area Area) string {
	for seat := range n.game.seatCount() {
		if PlayerArea(seat) == area {
			return n.game.seatName(seat)
		}
	}
	return n.game.playerName(NoOwner)
}

// name names card id if everyone could see it before or after the action,
// preferring the side shown before.
func (n narrator) name(id string) phrase {
	switch {
	case visible(n.before, id):
		return n.faceName(n.before.Cards[id])
	case visible(n.after, id):
		return n.faceName(n.after.Cards[id])
	default:
		return words(hiddenCard)
	}
}

// visibleCards keeps the ids everyone can see after the action.
func (n narrator) visibleCards(ids ...string) []string {
	var cards []string
	for _, id := range ids {
		if visible(n.after, id) {
			cards = append(cards, id)
		}
	}
	return cards
}

// faceName returns the printed name of the face c shows. Callers make sure c
// is visible.
func (n narrator) faceName(c *Card) phrase {
	face, ref, ok := n.face(c)
	if !ok {
		return words(hiddenCard)
	}
	return cardName(face.Name, ref)
}

// stageName returns the name of the face c shows with its stage, if any:
// "Rhino (stage II)" for a villain, "The Break-In! (1A)" for a main scheme.
// Only the name is flagged as a card name.
func (n narrator) stageName(c *Card) phrase {
	face, ref, ok := n.face(c)
	if !ok {
		return words(hiddenCard)
	}
	name := cardName(face.Name, ref)
	switch {
	case face.Stage == "":
		return name
	case face.Type == faceTypeMainScheme:
		return join(name, words(" ("+face.Stage+")"))
	default:
		return join(name, words(" (stage "+face.Stage+")"))
	}
}

// face returns the catalog face c shows, with a reference to it under the
// canonical code of its card. Every card comes from the catalog at setup, so a
// miss means a mismatched catalog; the card is then left unnamed.
func (n narrator) face(c *Card) (pack.Face, pack.FaceRef, bool) {
	def, _, err := n.cat.Card(c.Code)
	if err != nil || c.Face < 0 || c.Face >= len(def.Faces) {
		return pack.Face{}, pack.FaceRef{}, false
	}
	return def.Faces[c.Face], pack.FaceRef{Card: def.Code, Face: c.Face}, true
}

// visible reports whether everyone at the table can see the face of card id
// in t: face-up table cards, stage cards and the cards piles show (see
// Pile.shownCards).
func visible(t *Table, id string) bool {
	c, ok := t.Cards[id]
	if !ok {
		return false
	}
	switch c.Zone {
	case ZoneTable:
		return !c.FaceDown
	case ZoneStage:
		return true
	case ZonePile:
		pile, ok := t.Piles[c.Pile]
		return ok && pile.shows(id)
	default:
		return false
	}
}
