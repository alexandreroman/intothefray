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
	X         int            `json:"x"`
	Y         int            `json:"y"`
	Z         int            `json:"z"`
	Parent    string         `json:"parent,omitempty"`
	OnPile    string         `json:"onPile,omitempty"`
	Exhausted bool           `json:"exhausted,omitempty"`
	Tokens    map[string]int `json:"tokens,omitempty"`
	Status    map[string]int `json:"status,omitempty"`
	Mods      map[string]int `json:"mods,omitempty"`
	Stage     string         `json:"stage,omitempty"` // stage key, for stage cards
	Identity  bool           `json:"identity,omitempty"`
	// Home is the side deck or scenario deck a card of one returns to, sent
	// whatever its face: as at a real table, everyone sees which deck a card
	// came from. It is left out for every other card, whose home the client
	// infers.
	Home string `json:"home,omitempty"`
}

// PileView is a pile as one viewer sees it: the card list is only given for
// public piles, and holds only the top card of a side deck whose top card is
// face up.
type PileView struct {
	ID        string    `json:"id"`
	Kind      PileKind  `json:"kind"`
	Owner     int       `json:"owner"`
	X         int       `json:"x"`
	Y         int       `json:"y"`
	Count     int       `json:"count"`
	Cards     []string  `json:"cards,omitempty"`   // bottom → top
	Label     string    `json:"label,omitempty"`   // see Pile.Label
	Compact   bool      `json:"compact,omitempty"` // see Pile.Compact
	TopFaceUp bool      `json:"topFaceUp,omitempty"`
	Back      pack.Back `json:"back,omitempty"` // see Pile.Back
}

// PlayerView is what everybody may know about a player.
type PlayerView struct {
	Name  string `json:"name"`
	Color int    `json:"color"`
	Host  bool   `json:"host"`
	Ready bool   `json:"ready"` // every deck slot holds a deck
	// Online tells whether the player has a connection open, in any tab.
	// The game does not know who is connected: ViewFor leaves it false and
	// the server fills it, with SetAudience.
	Online bool       `json:"online"`
	Decks  []DeckView `json:"decks"` // slot order
}

// DeckView is what everybody may know about one deck slot of a player.
type DeckView struct {
	Area      Area   `json:"area,omitempty"` // the slot's seat, once started
	Hero      string `json:"hero,omitempty"`
	HeroName  string `json:"heroName,omitempty"`
	HeroImage string `json:"heroImage,omitempty"`
	DeckName  string `json:"deckName,omitempty"`
	Ready     bool   `json:"ready"` // holds a deck
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
	Parts  []LogPart `json:"parts,omitempty"` // see LogEntry.Parts
}

// YouView tells the viewer who they are.
type YouView struct {
	Role  Role   `json:"role,omitempty"` // empty for an unknown token
	Name  string `json:"name,omitempty"`
	Color int    `json:"color"`
	Host  bool   `json:"host"`
	Areas []Area `json:"areas,omitempty"` // the viewer's own seats in order, once started
}

// TableView is the table as one viewer sees it.
type TableView struct {
	Cards       []CardView        `json:"cards"`
	Piles       []PileView        `json:"piles"`
	Hands       map[Area][]string `json:"hands,omitempty"` // the viewer's own seats only
	Stages      []*Stage          `json:"stages"`
	FirstPlayer Point             `json:"firstPlayer"`
	Active      *Point            `json:"active,omitempty"`
	Arrows      []Arrow           `json:"arrows,omitempty"`
	Private     *PrivateView      `json:"private,omitempty"`
}

// View is the game as one viewer may see it. It is the only game data sent to
// clients: it holds no token and nothing hidden from this viewer.
type View struct {
	ID      string       `json:"id"`
	Phase   Phase        `json:"phase"`
	You     YouView      `json:"you"`
	Players []PlayerView `json:"players"`
	// Spectators is the number of spectators connected to the game, those
	// who closed every tab left out. The game does not know who is
	// connected: ViewFor leaves it at zero and the server fills it, with
	// SetAudience.
	Spectators int         `json:"spectators"`
	Config     LobbyConfig `json:"config"`
	Table      *TableView  `json:"table,omitempty"`
	Log        []LogView   `json:"log"`
	CanUndo    bool        `json:"canUndo,omitempty"`
}

// ViewFor builds the view of the participant holding token. An unknown token
// gets the view of a spectator, with an empty role.
func (g *Game) ViewFor(token string) View {
	player := g.player(token)
	// The viewer's own seats, and the home seat that holds the private view;
	// none and -1 for someone who does not play.
	var seats []int
	home := -1
	if player != nil {
		index := slices.Index(g.Players, player)
		seats = g.seatsOf(index)
		home = g.homeSeat(index)
	}

	v := View{
		ID:     g.ID,
		Phase:  g.Phase,
		You:    g.youView(token, player, seats),
		Config: g.Config,
	}
	// Clients expect lists, never null: start from empty, non-nil slices.
	v.Config.Modulars = append([]string{}, g.Config.Modulars...)
	v.Players = make([]PlayerView, 0, len(g.Players))
	for i, p := range g.Players {
		v.Players = append(v.Players, g.playerView(p, g.seatsOf(i)))
	}
	if g.Table != nil {
		v.Table = g.Table.viewFor(seats, home)
	}
	v.Log = g.logViews(v.Table)
	if player != nil && g.History != nil {
		v.CanUndo = g.History.lastUndoable(seats...) != nil
	}
	return v
}

// Audience is who is connected to a game: what a view tells about the
// connections, which the game itself does not know.
type Audience struct {
	// Spectators is the number of connected spectators.
	Spectators int
	// Players holds the colours of the connected players, in seat order.
	Players []int
}

// Equal reports whether a and other tell the same connections.
func (a Audience) Equal(other Audience) bool {
	return a.Spectators == other.Spectators && slices.Equal(a.Players, other.Players)
}

// OnlineAudience tells who is connected among the participants, from online,
// the tokens with an open connection. Unknown tokens are left out.
func (g *Game) OnlineAudience(online map[string]bool) Audience {
	var audience Audience
	for _, p := range g.Players {
		if online[p.Token] {
			audience.Players = append(audience.Players, p.Color)
		}
	}
	for _, s := range g.Spectators {
		if online[s.Token] {
			audience.Spectators++
		}
	}
	return audience
}

// SetAudience fills in the view who is connected, which ViewFor leaves out.
func (v *View) SetAudience(audience Audience) {
	v.Spectators = audience.Spectators
	for i := range v.Players {
		v.Players[i].Online = slices.Contains(audience.Players, v.Players[i].Color)
	}
}

func (g *Game) youView(token string, player *Player, seats []int) YouView {
	if player != nil {
		you := YouView{Role: RolePlayer, Name: player.Name, Color: player.Color, Host: player.Host}
		if g.Table != nil {
			for _, seat := range seats {
				you.Areas = append(you.Areas, PlayerArea(seat))
			}
		}
		return you
	}
	if s := g.spectator(token); s != nil {
		return YouView{Role: RoleSpectator, Name: s.Name}
	}
	return YouView{}
}

// playerView describes p, whose deck slots sit at seats once started.
func (g *Game) playerView(p *Player, seats []int) PlayerView {
	pv := PlayerView{
		Name:  p.Name,
		Color: p.Color,
		Host:  p.Host,
		Ready: p.ready(),
		Decks: make([]DeckView, 0, len(p.Decks)),
	}
	for slot, deck := range p.Decks {
		dv := DeckView{Ready: deck != nil}
		if deck != nil {
			dv.Hero = deck.Hero
			dv.HeroName = deck.HeroName
			dv.HeroImage = deck.HeroImage
			dv.DeckName = deck.Name
		}
		if g.Table != nil {
			dv.Area = PlayerArea(seats[slot])
			dv.HandCount = len(g.Table.Hands[dv.Area])
		}
		pv.Decks = append(pv.Decks, dv)
	}
	return pv
}

// logViews converts the history, keeping the card ids of each line that this
// view lists face up. A card turned face down after a line named it loses its
// id there: the id would tie its name to the face-down card and let a player
// follow it on the table. table is nil in the lobby.
func (g *Game) logViews(table *TableView) []LogView {
	listed := map[string]bool{}
	if table != nil {
		for _, c := range table.Cards {
			faceDown := c.FaceDown && c.Zone == ZoneTable
			listed[c.ID] = !faceDown
		}
	}
	views := make([]LogView, 0, len(g.Log))
	for _, e := range g.Log {
		lv := LogView{Who: e.Who, Color: e.Color, Text: e.Text, Parts: e.Parts, At: e.At, Undone: e.Undone}
		for _, id := range e.Cards {
			if listed[id] {
				lv.Cards = append(lv.Cards, id)
			}
		}
		views = append(views, lv)
	}
	return views
}

// viewFor builds the table as seen by the player at seats, whose private view
// lives in the area of home; seats is empty and home -1 for someone who does
// not play. Three kinds of cards are listed: those lying on the table or in a
// stage zone, those piles show (see Pile.shownCards), and the viewer's own
// hands and open view.
func (t *Table) viewFor(seats []int, home int) *TableView {
	tv := &TableView{
		Cards:       []CardView{},
		Piles:       []PileView{},
		FirstPlayer: t.FirstPlayer,
		Arrows:      slices.Clone(t.Arrows),
		Stages:      make([]*Stage, 0, len(t.Stages)),
	}
	if t.Active != nil {
		active := *t.Active
		tv.Active = &active
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
		for _, id := range pile.shownCards() {
			listed[id] = true
		}
		tv.Piles = append(tv.Piles, pile.viewOf())
	}
	for _, seat := range seats {
		area := PlayerArea(seat)
		hand := slices.Clone(t.Hands[area])
		if tv.Hands == nil {
			tv.Hands = map[Area][]string{}
		}
		tv.Hands[area] = hand
		for _, id := range hand {
			listed[id] = true
		}
	}
	if home >= 0 {
		if private := t.privateView(PlayerArea(home)); private != nil {
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
// its pile or revealed on it, top first in the pile's current order (see
// deckCards): a reorder of the top cards shows in the view.
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
	cards := t.deckCards(pile)
	for _, id := range topOf(cards, len(cards)) {
		if slices.Contains(view.Cards, id) {
			filtered.Cards = append(filtered.Cards, id)
		}
	}
	return filtered
}

// public reports whether everybody may see the cards of a pile of this kind:
// every kind but decks, side decks and the encounter deck, which are face
// down.
func (k PileKind) public() bool {
	return k != KindDeck && k != KindSideDeck && k != KindEncounter && k != KindScenarioDeck
}

// shownCards returns the cards of p everybody may see, bottom to top: all of
// them for a public pile, the top card of a side deck whose top card is face
// up, none otherwise.
func (p *Pile) shownCards() []string {
	switch {
	case p.Kind.public():
		return slices.Clone(p.Cards)
	case p.TopFaceUp && len(p.Cards) > 0:
		return topCards(p, 1)
	default:
		return nil
	}
}

// shows reports whether everybody may see card id in p (see shownCards).
func (p *Pile) shows(id string) bool {
	return slices.Contains(p.shownCards(), id)
}

func (p *Pile) viewOf() PileView {
	return PileView{
		ID: p.ID, Kind: p.Kind, Owner: p.Owner, X: p.X, Y: p.Y, Count: len(p.Cards),
		Cards: p.shownCards(), Label: p.Label, Compact: p.Compact, TopFaceUp: p.TopFaceUp, Back: p.Back,
	}
}

// viewOf converts a card the viewer may see. Only the identity of a face-down
// table card is hidden: cards in hands and piles are listed only to viewers
// who may read them.
func (c *Card) viewOf(stageKey string) CardView {
	cv := CardView{
		ID: c.ID, Code: c.Code, Face: c.Face, FaceDown: c.FaceDown, Back: c.Back,
		Owner: c.Owner, Zone: c.Zone, X: c.X, Y: c.Y, Z: c.Z,
		Parent: c.Parent, OnPile: c.OnPile, Exhausted: c.Exhausted,
		Tokens: maps.Clone(c.Tokens), Status: maps.Clone(c.Status), Mods: maps.Clone(c.Mods), Stage: stageKey,
		Identity: c.Identity,
	}
	if c.FaceDown && c.Zone == ZoneTable {
		cv.Code = ""
	}
	if isSideDeckID(c.Home) || isScenarioDeckID(c.Home) {
		cv.Home = c.Home
	}
	return cv
}
