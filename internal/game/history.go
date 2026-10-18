package game

import (
	"fmt"
	"math/rand/v2"
	"slices"
	"strings"
	"time"

	"github.com/alexandreroman/intothefray/internal/pack"
)

// Action kinds that only Do handles: they act on a player's private view or
// on the history, not on the shared table, so resolve and apply ignore them.
const (
	ActLook      Kind = "look"
	ActSearch    Kind = "search"
	ActCloseView Kind = "closeView"
	ActUndo      Kind = "undo"
)

// Modes of a PrivateView.
const (
	viewModeTop    = "top"
	viewModeSearch = "search"
)

const (
	// mergeWindow is how close two changes of one thing must be to share a
	// history line.
	mergeWindow = 15 * time.Second
	// maxUndoDepth is the number of undo entries kept per player.
	maxUndoDepth = 30
)

// untrackedKinds are the actions that write no history line and cannot be
// undone: they arrange the table without changing the game.
var untrackedKinds = []Kind{
	ActMove, ActAttach, ActHandOrder, ActReorderTop, ActFirstPlayer, ActArrowAdd, ActArrowClear,
}

// Do performs one action for the player holding token: it changes the table,
// writes the history line and keeps every player's undo stack up to date. An
// error leaves the game unchanged.
func (g *Game) Do(token string, a Action, cat *pack.Catalog, rng *rand.Rand, now time.Time) error {
	player := g.player(token)
	if player == nil {
		return forbidden("only players can act")
	}
	if g.Phase != PhasePlaying || g.Table == nil {
		return fmt.Errorf("%w: the game is not being played", ErrPhase)
	}
	seat := slices.Index(g.Players, player)

	var err error
	switch a.Kind {
	case ActUndo:
		err = g.undo(player, now)
	case ActLook, ActSearch:
		err = g.openView(player, seat, a, now)
	case ActCloseView:
		err = g.closeView(player, seat, a, cat, rng, now)
	default:
		err = g.perform(player, seat, a, cat, rng, now)
	}
	if err != nil {
		return err
	}
	g.UpdatedAt = now
	return nil
}

// perform resolves and applies a table action, replays it onto the other
// players' undo snapshots and, when it is tracked, records it.
func (g *Game) perform(p *Player, seat int, a Action, cat *pack.Catalog, rng *rand.Rand, now time.Time) error {
	resolved, err := resolve(g, seat, a, rng)
	if err != nil {
		return err
	}
	before := g.Table.Clone()
	// apply is all-or-nothing, so an error leaves the table untouched.
	if err := apply(g.Table, resolved); err != nil {
		return err
	}
	g.replay(p.Token, resolved)

	if slices.Contains(untrackedKinds, resolved.Kind) {
		return nil
	}
	n := narrator{game: g, cat: cat, seat: seat, before: before, after: g.Table}
	g.record(p, resolved, n.describe(resolved), before, now)
	return nil
}

// replay applies a to the undo snapshots of every player but the actor, so
// that undoing an older action keeps this one. The snapshots may no longer
// allow it (the card has moved since, for instance): such errors are
// ignored, and that snapshot simply misses the change.
func (g *Game) replay(actor string, a Action) {
	for token, stack := range g.Undo {
		if token == actor {
			continue
		}
		for _, entry := range stack {
			_ = apply(entry.Before, a)
		}
	}
}

// record writes the history line of a tracked action, or merges it into the
// actor's previous line.
func (g *Game) record(p *Player, a Action, e event, before *Table, now time.Time) {
	if entry := g.mergeable(p.Token, e.merge, now); entry != nil {
		g.merge(p.Token, entry, a, e, now)
		return
	}
	g.pushUndo(p.Token, UndoEntry{LogIndex: len(g.Log), Before: before, Merge: e.merge, At: now})
	g.Log = append(g.Log, LogEntry{Who: p.Name, Color: p.Color, Text: e.text, At: now, Cards: e.cards})
}

// mergeable returns the actor's last undo entry when a change with the given
// merge key extends it: same key, the entry still owns the last history
// line, and the previous change is less than mergeWindow old.
func (g *Game) mergeable(token, key string, now time.Time) *UndoEntry {
	stack := g.Undo[token]
	if key == "" || len(stack) == 0 || len(g.Log) == 0 {
		return nil
	}
	entry := &stack[len(stack)-1]
	last := len(g.Log) - 1
	if entry.Merge != key || entry.LogIndex != last || g.Log[last].Undone {
		return nil
	}
	if now.Sub(entry.At) >= mergeWindow {
		return nil
	}
	return entry
}

// merge folds a change into the last history line. The undo entry keeps its
// snapshot, so undo goes back to before the whole burst.
func (g *Game) merge(token string, entry *UndoEntry, a Action, e event, now time.Time) {
	last := len(g.Log) - 1
	if a.Kind == ActFlip && sameSide(entry.Before, g.Table, a.Card) {
		// Flipping back to the starting side cancels the burst entirely.
		g.Log = g.Log[:last]
		stack := g.Undo[token]
		g.Undo[token] = stack[:len(stack)-1]
		return
	}
	g.Log[last].Text = e.mergedText()
	g.Log[last].Cards = e.cards
	g.Log[last].At = now
	entry.At = now
}

// sameSide reports whether card id shows the same side in both tables.
func sameSide(a, b *Table, id string) bool {
	ca, okA := a.Cards[id]
	cb, okB := b.Cards[id]
	return okA && okB && ca.Face == cb.Face && ca.FaceDown == cb.FaceDown
}

// pushUndo adds an entry on top of a player's stack, dropping the oldest
// entry beyond maxUndoDepth.
func (g *Game) pushUndo(token string, entry UndoEntry) {
	if g.Undo == nil {
		g.Undo = map[string][]UndoEntry{}
	}
	stack := g.Undo[token]
	stack = append(stack, entry)
	if len(stack) > maxUndoDepth {
		stack = slices.Delete(stack, 0, len(stack)-maxUndoDepth)
	}
	g.Undo[token] = stack
}

// undo restores the table as it was before the player's last tracked action.
// The snapshot already holds the other players' later changes (see replay).
func (g *Game) undo(p *Player, now time.Time) error {
	stack := g.Undo[p.Token]
	if len(stack) == 0 {
		return invalid("nothing to undo")
	}
	entry := stack[len(stack)-1]
	g.Undo[p.Token] = stack[:len(stack)-1]

	restored := entry.Before
	// Open Looks and Searches are each player's own business, not part of
	// what is undone: keep them as they are now.
	restored.Views = g.Table.Views
	g.Table = restored

	text := ""
	if entry.LogIndex >= 0 && entry.LogIndex < len(g.Log) {
		g.Log[entry.LogIndex].Undone = true
		text = g.Log[entry.LogIndex].Text
	}
	g.Log = append(g.Log, LogEntry{Who: p.Name, Color: p.Color, Text: "undid “" + text + "”", At: now})
	return nil
}

// openView opens a Look or a Search on a pile for the player. It is logged
// but cannot be undone.
func (g *Game) openView(p *Player, seat int, a Action, now time.Time) error {
	pile, err := ownPile(g.Table, seat, a.Pile)
	if err != nil {
		return err
	}
	if len(pile.Cards) == 0 {
		return invalid("pile %q is empty", pile.ID)
	}

	view := &PrivateView{Pile: pile.ID}
	var text string
	if a.Kind == ActLook {
		if err := checkCount(a.N); err != nil {
			return err
		}
		n := min(a.N, len(pile.Cards))
		view.Mode = viewModeTop
		view.Cards = topCards(pile, n)
		text = fmt.Sprintf("is looking at %s of %s", topCount(n), g.pileName(seat, pile.ID))
	} else {
		view.Mode = viewModeSearch
		view.Cards = topCards(pile, len(pile.Cards))
		text = "is searching " + g.pileName(seat, pile.ID)
	}

	if g.Table.Views == nil {
		g.Table.Views = map[Area]*PrivateView{}
	}
	g.Table.Views[PlayerArea(seat)] = view
	g.Log = append(g.Log, LogEntry{Who: p.Name, Color: p.Color, Text: text, At: now})
	return nil
}

// closeView closes the player's open view. Closing with a shuffle shuffles the
// viewed pile, as a tracked shuffle action.
func (g *Game) closeView(p *Player, seat int, a Action, cat *pack.Catalog, rng *rand.Rand, now time.Time) error {
	area := PlayerArea(seat)
	view := g.Table.Views[area]
	if view == nil {
		return invalid("no view is open")
	}
	switch a.Where {
	case "":
	case whereShuffle:
		if err := g.perform(p, seat, Action{Kind: ActShuffle, Pile: view.Pile}, cat, rng, now); err != nil {
			return err
		}
	default:
		return invalid("unknown way to close a view %q", a.Where)
	}
	delete(g.Table.Views, area)
	return nil
}

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

// event is the history line of one tracked action.
type event struct {
	text   string
	cards  []string // touched cards everyone can see after the action
	merge  string   // merge key, "" when the line never merges
	merged string   // text of a merged line, "" to keep text
}

func (e event) mergedText() string {
	if e.merged != "" {
		return e.merged
	}
	return e.text
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

// describe writes the history line of a, which has just been applied.
func (n narrator) describe(a Action) event {
	switch a.Kind {
	case ActToHand:
		return n.toHandEvent(a)
	case ActToDeck:
		return n.toDeckEvent(a)
	case ActDiscard:
		text := "discarded " + n.name(a.Card)
		if n.before.Cards[a.Card].Zone == ZoneHand {
			text += " from hand"
		}
		return event{text: text, cards: n.visibleCards(a.Card)}
	case ActToPile:
		text := fmt.Sprintf("moved %s to %s", n.name(a.Card), n.game.pileName(n.seat, a.Target))
		return event{text: text, cards: n.visibleCards(a.Card)}
	case ActPlay:
		return event{text: "played " + n.name(a.Card), cards: n.visibleCards(a.Card)}
	case ActExhaust:
		verb := "readied "
		if n.after.Cards[a.Card].Exhausted {
			verb = "exhausted "
		}
		return event{text: verb + n.name(a.Card), cards: n.visibleCards(a.Card)}
	case ActFlip:
		return n.flipEvent(a)
	case ActToken, ActStatus:
		return n.counterEvent(a)
	case ActChooseStage:
		return n.stageEvent(a)
	case ActDraw:
		if len(a.Cards) == 1 {
			return event{text: "drew 1 card"}
		}
		return event{text: fmt.Sprintf("drew %d cards", len(a.Cards))}
	case ActReveal:
		enc := n.before.Piles[PileEncounter]
		id := enc.Cards[len(enc.Cards)-1]
		return event{text: "revealed " + n.name(id), cards: n.visibleCards(id)}
	case ActDeal:
		return event{text: "dealt an encounter card face down to " + n.areaName(a.Area)}
	case ActDiscardTop:
		ids := topCards(n.before.Piles[a.Pile], a.N)
		text := fmt.Sprintf("discarded %s of %s", topCount(a.N), n.game.pileName(n.seat, a.Pile))
		return event{text: text, cards: n.visibleCards(ids...)}
	case ActShuffle:
		return event{text: "shuffled " + n.game.pileName(n.seat, a.Pile)}
	case ActShuffleBack:
		deck := PileEncounter
		if owner, ok := strings.CutPrefix(a.Pile, "disc:"); ok {
			deck = "deck:" + owner
		}
		return event{text: fmt.Sprintf("shuffled %s into %s",
			n.game.pileName(n.seat, a.Pile), n.game.pileName(n.seat, deck))}
	case ActShuffleIn:
		return event{text: fmt.Sprintf("shuffled %s into %s",
			n.game.pileName(n.seat, a.Pile), n.game.pileName(n.seat, PileEncounter))}
	default:
		// Every tracked kind has its own line above; this only guards new ones.
		return event{text: "changed the table (" + string(a.Kind) + ")"}
	}
}

func (n narrator) toHandEvent(a Action) event {
	c := n.before.Cards[a.Card]
	if c.Zone == ZonePile && !visible(n.before, a.Card) {
		return event{text: "took a card from " + n.game.pileName(n.seat, c.Pile) + " into hand"}
	}
	return event{text: "took " + n.name(a.Card) + " into hand"}
}

func (n narrator) toDeckEvent(a Action) event {
	card := n.name(a.Card)
	deck := n.game.pileName(n.seat, n.after.Cards[a.Card].Home)
	var text string
	switch a.Where {
	case whereBottom:
		text = fmt.Sprintf("put %s at the bottom of %s", card, deck)
	case whereShuffle:
		text = fmt.Sprintf("shuffled %s into %s", card, deck)
	default:
		text = fmt.Sprintf("put %s on top of %s", card, deck)
	}
	return event{text: text}
}

func (n narrator) flipEvent(a Action) event {
	old, cur := n.before.Cards[a.Card], n.after.Cards[a.Card]
	var text string
	if old.FaceDown {
		text = "turned " + n.faceName(cur) + " face up"
	} else {
		from, to := n.faceName(old), n.faceName(cur)
		// Both faces of a scheme share a name; their stages tell them apart.
		if from == to {
			from, to = n.stageName(old), n.stageName(cur)
		}
		text = "flipped " + from
		if from != to {
			text += " to " + to
		}
	}
	return event{text: text, cards: n.visibleCards(a.Card), merge: "flip:" + a.Card}
}

func (n narrator) counterEvent(a Action) event {
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
	return event{
		text:   text,
		cards:  n.visibleCards(a.Card),
		merge:  fmt.Sprintf("%s:%s:%s", a.Kind, a.Card, a.Name),
		merged: set,
	}
}

// counterValue returns the token or status named by a on its card in t.
func counterValue(t *Table, a Action) int {
	c := t.Cards[a.Card]
	if a.Kind == ActStatus {
		return c.Status[a.Name]
	}
	return c.Tokens[a.Name]
}

func (n narrator) stageEvent(a Action) event {
	stage := n.before.stage(a.Stage)
	label := "the " + strings.ToLower(stage.Label)
	previous, chosen := n.before.Cards[stage.Current], n.after.Cards[a.Card]
	if previous.ID == chosen.ID {
		return event{
			text:  fmt.Sprintf("turned %s to %s", label, n.stageName(chosen)),
			cards: n.visibleCards(chosen.ID),
		}
	}
	return event{
		text:  fmt.Sprintf("replaced %s %s with %s", label, n.stageName(previous), n.stageName(chosen)),
		cards: n.visibleCards(previous.ID, chosen.ID),
	}
}

// areaName names a side of the table.
func (n narrator) areaName(area Area) string {
	for seat := range n.game.Players {
		if PlayerArea(seat) == area {
			return n.game.playerName(seat)
		}
	}
	return "the villain"
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
// "Rhino (stage II)".
func (n narrator) stageName(c *Card) string {
	face, ok := n.face(c)
	if !ok {
		return hiddenCard
	}
	if face.Stage == "" {
		return face.Name
	}
	return fmt.Sprintf("%s (stage %s)", face.Name, face.Stage)
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
