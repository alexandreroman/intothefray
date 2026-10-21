package server

import (
	"encoding/json"

	"github.com/alexandreroman/intothefray/internal/decks"
	"github.com/alexandreroman/intothefray/internal/game"
)

// createGameRequest is the body of POST /api/games.
type createGameRequest struct {
	Name string `json:"name"`
}

// createGameResponse is the reply to POST /api/games. The token is the host's
// credential: it is only ever sent here and in the welcome message.
type createGameResponse struct {
	ID    string `json:"id"`
	Token string `json:"token"`
}

// versionResponse is the reply to GET /api/version.
type versionResponse struct {
	Commit string `json:"commit"`
}

// errorResponse is the body of every HTTP error reply.
type errorResponse struct {
	Error string `json:"error"`
}

// Types of the WebSocket messages.
const (
	typeHello     = "hello"
	typeLobby     = "lobby"
	typeAction    = "action"
	typePresence  = "presence"
	typeWelcome   = "welcome"
	typeView      = "view"
	typeError     = "error"
	typeDeckError = "deckError"
	typeDeckSet   = "deckSet"
)

// Operations of the lobby message.
const (
	opConfigure    = "configure"
	opAddDeck      = "addDeck"
	opRemoveDeck   = "removeDeck"
	opSetDeck      = "setDeck"
	opRemovePlayer = "removePlayer"
	opLeave        = "leave"
	opTakeSeat     = "takeSeat"
	opStart        = "start"
	opEnd          = "end"
)

// Codes of the error message.
const (
	codeInvalid   = "invalid"
	codeForbidden = "forbidden"
	codePhase     = "phase"
	codeNotFound  = "notFound"
	codeDeck      = "deck"
	codeInternal  = "internal"
)

// errorTexts is the message sent with each error code but deck, whose text
// depends on the failure (see Server.importErrorText and heroTakenText). It
// is fixed so that no error detail, which can reveal where a hidden card is,
// reaches a viewer.
var errorTexts = map[string]string{
	codeInvalid:   "This request is not valid.",
	codeForbidden: "You are not allowed to do that.",
	codePhase:     "That is not possible at this point of the game.",
	codeNotFound:  "This game, or something it refers to, does not exist.",
	codeInternal:  "Something went wrong on the server. Please try again.",
}

// clientMessage is any message from a viewer, decoded into the union of
// their fields. Which fields matter depends on Type, and on Op for a lobby
// message.
type clientMessage struct {
	Type string `json:"type"`

	// hello
	Token string `json:"token"`
	Name  string `json:"name"`

	// lobby
	Op     string            `json:"op"`
	Config *game.LobbyConfig `json:"config"` // configure
	URL    string            `json:"url"`    // setDeck
	Deck   int               `json:"deck"`   // setDeck, removeDeck: the caller's deck slot, 0 when absent
	Color  int               `json:"color"`  // removePlayer

	// action
	ID     int64        `json:"id"` // client sequence number, echoed in errors
	Action *game.Action `json:"action"`
	Seat   *int         `json:"seat"` // the credited seat; the player's first seat when absent

	// presence. Cursor and Drag are kept raw to tell a hidden cursor or an
	// ended drag (null) from an absent one.
	Cursor  json.RawMessage `json:"cursor"`
	Preview *string         `json:"preview"`
	Drag    json.RawMessage `json:"drag"`
	Ping    *presencePoint  `json:"ping"`
}

// welcomeMessage answers a successful hello. It is the only message that
// carries a token, sent to its owner alone.
type welcomeMessage struct {
	Type  string    `json:"type"`
	Token string    `json:"token"`
	Role  game.Role `json:"role"`
}

// viewMessage carries the game as one viewer may see it.
type viewMessage struct {
	Type    string    `json:"type"`
	Version int64     `json:"version"`
	View    game.View `json:"view"`
}

// errorMessage reports a failed request.
type errorMessage struct {
	Type    string `json:"type"`
	ID      int64  `json:"id,omitempty"`
	Code    string `json:"code"`
	Message string `json:"message"`
}

// deckErrorMessage lists the cards that make a deck unusable.
type deckErrorMessage struct {
	Type        string              `json:"type"`
	Unsupported []decks.Unsupported `json:"unsupported"`
}

// deckSetMessage tells the viewer that its deck load went through, in the
// game version given.
type deckSetMessage struct {
	Type    string `json:"type"`
	Version int64  `json:"version"`
}

// Kinds of the events published on a game's channel.
const (
	// eventUpdated is published after a game changes.
	eventUpdated = "updated"
	// eventPresence carries a viewer's presence to the other viewers.
	eventPresence = "presence"
	// eventOnline is published after a viewer connects or disconnects.
	eventOnline = "online"
)

// updatedEvent is published on a game's channel after the game changes.
type updatedEvent struct {
	Kind    string `json:"kind"`
	Version int64  `json:"version"`
}

// onlineEvent is published on a game's channel after a viewer connects or
// disconnects, so that every instance sends its viewers the new count of
// connected spectators.
type onlineEvent struct {
	Kind string `json:"kind"`
}

// presencePoint is a spot of the table, in table units: where a cursor is,
// or what a ping points at.
type presencePoint struct {
	X int `json:"x"`
	Y int `json:"y"`
}

// presenceDrag is a drag in progress: the cards dragged, or the first player
// token, which carries no card, and where their corner is, in table units.
type presenceDrag struct {
	Cards []string `json:"cards"`
	Token bool     `json:"token,omitempty"`
	X     int      `json:"x"`
	Y     int      `json:"y"`
}

// presenceFields are the relayed fields of a presence message; each is
// absent when it did not change. Cursor is the JSON of a presencePoint, or
// null while the viewer is off the table (hand raised, dialog open). Drag is
// the JSON of a presenceDrag, or null once the drag ends.
type presenceFields struct {
	Cursor  json.RawMessage `json:"cursor,omitempty"`
	Preview *string         `json:"preview,omitempty"`
	Drag    json.RawMessage `json:"drag,omitempty"`
	Ping    *presencePoint  `json:"ping,omitempty"`
}

// presenceEvent is published on a game's channel for the viewers of every
// instance. From identifies the sender's connection without revealing its
// token; it never reaches a client.
type presenceEvent struct {
	Kind  string `json:"kind"`
	From  string `json:"from"`
	Color int    `json:"color"`
	Name  string `json:"name"`
	presenceFields
}

// presenceMessage relays a viewer's presence to the other viewers.
type presenceMessage struct {
	Type  string `json:"type"`
	Color int    `json:"color"`
	Name  string `json:"name"`
	presenceFields
}
