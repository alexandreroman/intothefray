package game

import (
	"cmp"
	"maps"
	"slices"
	"time"

	"github.com/alexandreroman/intothefray/internal/pack"
)

// CardView is a card as one viewer sees it. A face-down table card has no
// Code.
type CardView struct {
	ID        string         `json:"id"`
	Code      string         `json:"code,omitempty"`
	Face      int            `json:"face"`
	FaceDown  bool           `json:"faceDown,omitempty"`
	Back      pack.Back      `json:"back"`
	Owner     int            `json:"owner"`
	Zone      Zone           `json:"zone"`
	Area      Area           `json:"area,omitempty"`
	X         int            `json:"x"`
	Y         int            `json:"y"`
	Z         int            `json:"z"`
	Parent    string         `json:"parent,omitempty"`
	OnPile    string         `json:"onPile,omitempty"`
	Exhausted bool           `json:"exhausted,omitempty"`
	Tokens    map[string]int `json:"tokens,omitempty"`
	Status    map[string]int `json:"status,omitempty"`
	Stage     string         `json:"stage,omitempty"` // stage key, for stage cards
}

// PileView is a pile as one viewer sees it: the card list is only given for
// public piles.
type PileView struct {
	ID    string   `json:"id"`
	Kind  PileKind `json:"kind"`
	Owner int      `json:"owner"`
	Area  Area     `json:"area"`
	X     int      `json:"x"`
	Y     int      `json:"y"`
	Count int      `json:"count"`
	Cards []string `json:"cards,omitempty"` // bottom → top
}

// PlayerView is what everybody may know about a player.
type PlayerView struct {
	Name      string `json:"name"`
	Color     int    `json:"color"`
	Host      bool   `json:"host"`
	Area      Area   `json:"area,omitempty"`
	Hero      string `json:"hero,omitempty"`
	HeroName  string `json:"heroName,omitempty"`
	HeroImage string `json:"heroImage,omitempty"`
	DeckName  string `json:"deckName,omitempty"`
	Ready     bool   `json:"ready"` // has a deck
	HandCount int    `json:"handCount"`
}

// LogView is a history line as one viewer sees it.
type LogView struct {
	Who    string    `json:"who"`
	Color  int       `json:"color"`
	Text   string    `json:"text"`
	At     time.Time `json:"at"`
	Undone bool      `json:"undone,omitempty"`
	Cards  []string  `json:"cards,omitempty"`
}

// YouView tells the viewer who they are.
type YouView struct {
	Role  Role   `json:"role,omitempty"` // empty for an unknown token
	Name  string `json:"name,omitempty"`
	Color int    `json:"color"`
	Host  bool   `json:"host"`
	Area  Area   `json:"area,omitempty"`
}

// TableView is the table as one viewer sees it.
type TableView struct {
	Cards       []CardView   `json:"cards"`
	Piles       []PileView   `json:"piles"`
	Hand        []string     `json:"hand,omitempty"`
	Stages      []*Stage     `json:"stages"`
	FirstPlayer Point        `json:"firstPlayer"`
	Arrows      []Arrow      `json:"arrows,omitempty"`
	Private     *PrivateView `json:"private,omitempty"`
}

// View is the game as one viewer may see it. It is the only game data sent to
// clients: it holds no token and nothing hidden from this viewer.
type View struct {
	ID         string       `json:"id"`
	Phase      Phase        `json:"phase"`
	You        YouView      `json:"you"`
	Players    []PlayerView `json:"players"`
	Spectators int          `json:"spectators"`
	Config     LobbyConfig  `json:"config"`
	Table      *TableView   `json:"table,omitempty"`
	Log        []LogView    `json:"log"`
	CanUndo    bool         `json:"canUndo,omitempty"`
	UndoText   string       `json:"undoText,omitempty"`
}

// ViewFor builds the view of the participant holding token. An unknown token
// gets the view of a spectator, with an empty role.
func (g *Game) ViewFor(token string) View {
	player := g.player(token)
	seat := -1
	if player != nil {
		seat = slices.Index(g.Players, player)
	}

	v := View{
		ID:         g.ID,
		Phase:      g.Phase,
		You:        g.youView(token, player, seat),
		Spectators: len(g.Spectators),
		Config:     g.Config,
	}
	// Clients expect lists, never null: start from empty, non-nil slices.
	v.Config.Modulars = append([]string{}, g.Config.Modulars...)
	v.Players = make([]PlayerView, 0, len(g.Players))
	for i, p := range g.Players {
		v.Players = append(v.Players, g.playerView(p, i))
	}
	if g.Table != nil {
		v.Table = g.Table.viewFor(seat)
	}
	v.Log = g.logViews(v.Table)
	if player != nil && g.History != nil {
		if burst := g.History.lastUndoable(seat); burst != nil {
			v.CanUndo = true
			v.UndoText = g.Log[g.History.Events[burst[0]].Log].Text
		}
	}
	return v
}

func (g *Game) youView(token string, player *Player, seat int) YouView {
	if player != nil {
		you := YouView{Role: RolePlayer, Name: player.Name, Color: player.Color, Host: player.Host}
		if g.Table != nil {
			you.Area = PlayerArea(seat)
		}
		return you
	}
	if s := g.spectator(token); s != nil {
		return YouView{Role: RoleSpectator, Name: s.Name}
	}
	return YouView{}
}

func (g *Game) playerView(p *Player, seat int) PlayerView {
	pv := PlayerView{Name: p.Name, Color: p.Color, Host: p.Host, Ready: p.Deck != nil}
	if p.Deck != nil {
		pv.Hero = p.Deck.Hero
		pv.HeroName = p.Deck.HeroName
		pv.HeroImage = p.Deck.HeroImage
		pv.DeckName = p.Deck.Name
	}
	if g.Table != nil {
		pv.Area = PlayerArea(seat)
		pv.HandCount = len(g.Table.Hands[pv.Area])
	}
	return pv
}

// logViews converts the history, keeping the card ids of each line that this
// view lists. table is nil in the lobby.
func (g *Game) logViews(table *TableView) []LogView {
	listed := map[string]bool{}
	if table != nil {
		for _, c := range table.Cards {
			listed[c.ID] = true
		}
	}
	views := make([]LogView, 0, len(g.Log))
	for _, e := range g.Log {
		lv := LogView{Who: e.Who, Color: e.Color, Text: e.Text, At: e.At, Undone: e.Undone}
		for _, id := range e.Cards {
			if listed[id] {
				lv.Cards = append(lv.Cards, id)
			}
		}
		views = append(views, lv)
	}
	return views
}

// viewFor builds the table as seen from seat, which is -1 for someone who
// does not play. Three kinds of cards are listed: those lying on the table or
// in a stage zone, those of public piles, and the viewer's own hand and open
// view.
func (t *Table) viewFor(seat int) *TableView {
	tv := &TableView{
		Cards:       []CardView{},
		Piles:       []PileView{},
		FirstPlayer: t.FirstPlayer,
		Arrows:      slices.Clone(t.Arrows),
		Stages:      make([]*Stage, 0, len(t.Stages)),
	}
	stageKeys := map[string]string{}
	for _, stage := range t.Stages {
		copied := stage.clone()
		copied.Cards = append([]string{}, stage.Cards...) // never null on the wire
		tv.Stages = append(tv.Stages, copied)
		stageKeys[stage.Current] = stage.Key
		for _, id := range stage.Cards {
			stageKeys[id] = stage.Key
		}
	}

	listed := map[string]bool{}
	for id, c := range t.Cards {
		if c.Zone == ZoneTable || c.Zone == ZoneStage {
			listed[id] = true
		}
	}
	for _, pile := range t.Piles {
		if pile.Kind.public() {
			for _, id := range pile.Cards {
				listed[id] = true
			}
		}
		tv.Piles = append(tv.Piles, pile.viewOf())
	}
	if seat >= 0 {
		area := PlayerArea(seat)
		tv.Hand = slices.Clone(t.Hands[area])
		for _, id := range tv.Hand {
			listed[id] = true
		}
		if private := t.privateView(area); private != nil {
			tv.Private = private
			for _, id := range private.Cards {
				listed[id] = true
			}
		}
	}

	for id := range listed {
		if c, ok := t.Cards[id]; ok {
			tv.Cards = append(tv.Cards, c.viewOf(stageKeys[id]))
		}
	}
	slices.SortFunc(tv.Cards, func(a, b CardView) int { return cmp.Compare(a.ID, b.ID) })
	slices.SortFunc(tv.Piles, func(a, b PileView) int { return cmp.Compare(a.ID, b.ID) })
	return tv
}

// privateView returns the view open for area, limited to the cards still in
// its pile, top first in the pile's current order: a reorder of the top
// cards shows in the view.
func (t *Table) privateView(area Area) *PrivateView {
	view := t.Views[area]
	if view == nil {
		return nil
	}
	filtered := &PrivateView{Pile: view.Pile, Mode: view.Mode, Cards: []string{}}
	pile, ok := t.Piles[view.Pile]
	if !ok {
		return filtered
	}
	for _, id := range topCards(pile, len(pile.Cards)) {
		if slices.Contains(view.Cards, id) {
			filtered.Cards = append(filtered.Cards, id)
		}
	}
	return filtered
}

// public reports whether everybody may see the cards of a pile of this kind:
// every kind but decks and the encounter deck, which are face down.
func (k PileKind) public() bool {
	return k != KindDeck && k != KindEncounter
}

func (p *Pile) viewOf() PileView {
	pv := PileView{ID: p.ID, Kind: p.Kind, Owner: p.Owner, Area: p.Area, X: p.X, Y: p.Y, Count: len(p.Cards)}
	if p.Kind.public() {
		pv.Cards = slices.Clone(p.Cards)
	}
	return pv
}

// viewOf converts a card the viewer may see. Only the identity of a face-down
// table card is hidden: cards in hands and piles are listed only to viewers
// who may read them.
func (c *Card) viewOf(stageKey string) CardView {
	cv := CardView{
		ID: c.ID, Code: c.Code, Face: c.Face, FaceDown: c.FaceDown, Back: c.Back,
		Owner: c.Owner, Zone: c.Zone, Area: c.Area, X: c.X, Y: c.Y, Z: c.Z,
		Parent: c.Parent, OnPile: c.OnPile, Exhausted: c.Exhausted,
		Tokens: maps.Clone(c.Tokens), Status: maps.Clone(c.Status), Stage: stageKey,
	}
	if c.FaceDown && c.Zone == ZoneTable {
		cv.Code = ""
	}
	return cv
}
