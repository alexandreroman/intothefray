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

// pileName names a pile from the point of view of the player at seat.
func (g *Game) pileName(seat int, id string) string {
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
	default:
		noun = "pile"
	}
	if pile.Owner == seat {
		return "their " + noun
	}
	return g.playerName(pile.Owner) + "'s " + noun
}

func (g *Game) playerName(seat int) string {
	if seat < 0 || seat >= len(g.Players) {
		return "another player"
	}
	return g.Players[seat].Name
}

// logLine is the history line of one recorded action.
type logLine struct {
	text   string
	cards  []string // touched cards everyone can see after the action
	merged string   // text of a merged line, "" to keep text
}

func (l logLine) mergedText() string {
	if l.merged != "" {
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
	case ActToken, ActStatus:
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
	"dmg":      {"damage", "damage"},
	"thr":      {"threat", "threat"},
	"gen":      {"counter", "counters"},
	"stunned":  {"stunned status", "stunned statuses"},
	"confused": {"confused status", "confused statuses"},
	"tough":    {"tough status", "tough statuses"},
}

// hiddenCard is how the history names a card nobody could see.
const hiddenCard = "a card"

// narrator writes history lines from the actor's point of view. A card is
// named only when everyone could see it before or after the action.
type narrator struct {
	game   *Game
	cat    *pack.Catalog
	seat   int
	before *Table
	after  *Table
}

// arrangingKinds only arrange the table: they write no history line and
// cannot be undone. Every other table action has a case in describe.
var arrangingKinds = map[Kind]bool{
	ActMove:        true,
	ActAttach:      true,
	ActHandOrder:   true,
	ActReorderTop:  true,
	ActFirstPlayer: true,
	ActArrowAdd:    true,
	ActArrowClear:  true,
}

// describe writes the history line of a, which has just been applied. It
// returns false for the arranging kinds (see arrangingKinds).
func (n narrator) describe(a Action) (logLine, bool) {
	switch a.Kind {
	case ActToHand:
		return n.toHandEvent(a), true
	case ActToDeck:
		return n.toDeckEvent(a), true
	case ActDiscard:
		text := "discarded " + n.name(a.Card)
		if n.before.Cards[a.Card].Zone == ZoneHand {
			text += " from hand"
		}
		return logLine{text: text, cards: n.visibleCards(a.Card)}, true
	case ActToPile:
		text := fmt.Sprintf("moved %s to %s", n.name(a.Card), n.game.pileName(n.seat, a.Target))
		return logLine{text: text, cards: n.visibleCards(a.Card)}, true
	case ActPlay:
		if a.Target != "" {
			text := fmt.Sprintf("played %s under %s", n.name(a.Card), n.name(a.Target))
			return logLine{text: text, cards: n.visibleCards(a.Card, a.Target)}, true
		}
		return logLine{text: "played " + n.name(a.Card), cards: n.visibleCards(a.Card)}, true
	case ActExhaust:
		verb := "readied "
		if n.after.Cards[a.Card].Exhausted {
			verb = "exhausted "
		}
		return logLine{text: verb + n.name(a.Card), cards: n.visibleCards(a.Card)}, true
	case ActReadyAll:
		return logLine{text: fmt.Sprintf("readied all their cards (%d)", len(a.Cards)), cards: n.visibleCards(a.Cards...)}, true
	case ActFlip:
		return n.flipEvent(a), true
	case ActToken, ActStatus:
		return n.counterEvent(a), true
	case ActChooseStage:
		return n.stageEvent(a), true
	case ActDraw:
		if len(a.Cards) == 1 {
			return logLine{text: "drew 1 card"}, true
		}
		return logLine{text: fmt.Sprintf("drew %d cards", len(a.Cards))}, true
	case ActReveal:
		id := a.Cards[0]
		return logLine{text: "revealed " + n.name(id), cards: n.visibleCards(id)}, true
	case ActDeal:
		return logLine{text: "dealt an encounter card face down to " + n.areaName(a.Area)}, true
	case ActDiscardTop:
		text := fmt.Sprintf("discarded %s of %s", topCount(len(a.Cards)), n.game.pileName(n.seat, a.Pile))
		return logLine{text: text, cards: n.visibleCards(a.Cards...)}, true
	case ActShuffle:
		return logLine{text: "shuffled " + n.game.pileName(n.seat, a.Pile)}, true
	case ActShuffleBack:
		deck, _ := deckOfDiscard(a.Pile)
		return logLine{text: fmt.Sprintf("shuffled %s into %s",
			n.game.pileName(n.seat, a.Pile), n.game.pileName(n.seat, deck))}, true
	case ActShuffleIn:
		return logLine{text: fmt.Sprintf("shuffled %s into %s",
			n.game.pileName(n.seat, a.Pile), n.game.pileName(n.seat, PileEncounter))}, true
	default:
		return logLine{}, false
	}
}

func (n narrator) toHandEvent(a Action) logLine {
	c := n.before.Cards[a.Card]
	if c.Zone == ZonePile && !visible(n.before, a.Card) {
		return logLine{text: "took a card from " + n.game.pileName(n.seat, c.Pile) + " into hand"}
	}
	return logLine{text: "took " + n.name(a.Card) + " into hand"}
}

func (n narrator) toDeckEvent(a Action) logLine {
	card := n.name(a.Card)
	deck := n.game.pileName(n.seat, n.before.Cards[a.Card].Home)
	var text string
	switch a.Where {
	case whereBottom:
		text = fmt.Sprintf("put %s at the bottom of %s", card, deck)
	case whereShuffle:
		text = fmt.Sprintf("shuffled %s into %s", card, deck)
	default:
		text = fmt.Sprintf("put %s on top of %s", card, deck)
	}
	return logLine{text: text}
}

func (n narrator) flipEvent(a Action) logLine {
	old, cur := n.before.Cards[a.Card], n.after.Cards[a.Card]
	var text string
	if old.FaceDown {
		text = "turned " + n.faceName(cur) + " face up"
	} else {
		from, to := n.faceName(old), n.faceName(cur)
		// Both faces of a main scheme share a name; their stages tell them apart.
		if from == to {
			from, to = n.stageName(old), n.stageName(cur)
		}
		text = "flipped " + from
		if from != to {
			text += " to " + to
		}
	}
	return logLine{text: text, cards: n.visibleCards(a.Card)}
}

func (n narrator) counterEvent(a Action) logLine {
	before, after := counterValue(n.before, a), counterValue(n.after, a)
	noun := counterNouns[a.Name]
	card := n.name(a.Card)
	set := fmt.Sprintf("set %s on %s to %d", noun.many, card, after)

	text := set
	switch diff := after - before; {
	case diff > 0:
		text = fmt.Sprintf("added %d %s to %s", diff, noun.count(diff), card)
	case diff < 0:
		text = fmt.Sprintf("removed %d %s from %s", -diff, noun.count(-diff), card)
	}
	return logLine{text: text, cards: n.visibleCards(a.Card), merged: set}
}

// counterValue returns the token or status named by a on its card in t.
func counterValue(t *Table, a Action) int {
	c := t.Cards[a.Card]
	if a.Kind == ActStatus {
		return c.Status[a.Name]
	}
	return c.Tokens[a.Name]
}

func (n narrator) stageEvent(a Action) logLine {
	stage := n.before.stage(a.Stage)
	label := "the " + strings.ToLower(stage.Label)
	previous, chosen := n.before.Cards[stage.Current], n.after.Cards[a.Card]
	if previous.ID == chosen.ID {
		return logLine{
			text:  fmt.Sprintf("turned %s to %s", label, n.stageName(chosen)),
			cards: n.visibleCards(chosen.ID),
		}
	}
	return logLine{
		text:  fmt.Sprintf("replaced %s %s with %s", label, n.stageName(previous), n.stageName(chosen)),
		cards: n.visibleCards(previous.ID, chosen.ID),
	}
}

// areaName names the player seated at area.
func (n narrator) areaName(area Area) string {
	for seat := range n.game.Players {
		if PlayerArea(seat) == area {
			return n.game.playerName(seat)
		}
	}
	return n.game.playerName(NoOwner)
}

// name names card id if everyone could see it before or after the action,
// preferring the side shown before.
func (n narrator) name(id string) string {
	switch {
	case visible(n.before, id):
		return n.faceName(n.before.Cards[id])
	case visible(n.after, id):
		return n.faceName(n.after.Cards[id])
	default:
		return hiddenCard
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
func (n narrator) faceName(c *Card) string {
	face, ok := n.face(c)
	if !ok {
		return hiddenCard
	}
	return face.Name
}

// stageName returns the name of the face c shows with its stage, if any:
// "Rhino (stage II)" for a villain, "The Break-In! (1A)" for a main scheme.
func (n narrator) stageName(c *Card) string {
	face, ok := n.face(c)
	if !ok {
		return hiddenCard
	}
	switch {
	case face.Stage == "":
		return face.Name
	case face.Type == faceTypeMainScheme:
		return fmt.Sprintf("%s (%s)", face.Name, face.Stage)
	default:
		return fmt.Sprintf("%s (stage %s)", face.Name, face.Stage)
	}
}

// face returns the catalog face c shows. Every card comes from the catalog at
// setup, so a miss means a mismatched catalog; the card is then left unnamed.
func (n narrator) face(c *Card) (pack.Face, bool) {
	def, _, err := n.cat.Card(c.Code)
	if err != nil || c.Face < 0 || c.Face >= len(def.Faces) {
		return pack.Face{}, false
	}
	return def.Faces[c.Face], true
}

// visible reports whether everyone at the table can see the face of card id
// in t: face-up table cards, stage cards and cards in face-up piles.
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
		return ok && pile.Kind != KindDeck && pile.Kind != KindEncounter
	default:
		return false
	}
}
