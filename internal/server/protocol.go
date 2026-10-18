package server

import (
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

// errorResponse is the body of every HTTP error reply.
type errorResponse struct {
	Error string `json:"error"`
}

// Types of the WebSocket messages.
const (
	typeHello     = "hello"
	typeLobby     = "lobby"
	typeAction    = "action"
	typeWelcome   = "welcome"
	typeView      = "view"
	typeError     = "error"
	typeDeckError = "deckError"
)

// Operations of the lobby message.
const (
	opConfigure    = "configure"
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
// depends on the failure (see Server.importErrorText). It is fixed so that no
// error detail, which can reveal where a hidden card is, reaches a viewer.
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
	Color  int               `json:"color"`  // removePlayer

	// action
	ID     int64        `json:"id"` // client sequence number, echoed in errors
	Action *game.Action `json:"action"`
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

// eventUpdated is the kind of the event published after a game changes.
const eventUpdated = "updated"

// gameEvent is published on a game's channel for the other instances.
type gameEvent struct {
	Kind    string `json:"kind"`
	Version int64  `json:"version"`
}
