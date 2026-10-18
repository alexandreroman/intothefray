// Package game holds the pure state and rules-free actions of a Marvel
// Champions table. It performs no I/O and starts no goroutines.
package game

import (
	"errors"
	"time"

	"github.com/alexandreroman/intothefray/internal/pack"
)

var (
	// ErrInvalid reports an action whose parameters make no sense.
	ErrInvalid = errors.New("game: invalid action")
	// ErrForbidden reports an action the caller is not allowed to perform.
	ErrForbidden = errors.New("game: forbidden")
	// ErrPhase reports an action that does not fit the current game phase.
	ErrPhase = errors.New("game: wrong phase")
	// ErrNotFound reports a reference to an unknown card, pile or player.
	ErrNotFound = errors.New("game: not found")
)

// Phase is the stage of a game's life.
type Phase string

// Game phases.
const (
	PhaseLobby   Phase = "lobby"
	PhasePlaying Phase = "playing"
	PhaseEnded   Phase = "ended"
)

// Role tells what a participant is allowed to do at the table.
type Role string

// Participant roles.
const (
	RolePlayer    Role = "player"
	RoleSpectator Role = "spectator"
)

// DeckEntry is a card code with the number of copies in a deck.
type DeckEntry struct {
	Code string `json:"code"`
	Qty  int    `json:"qty"`
}

// DeckChoice is the deck a player brings to the table.
type DeckChoice struct {
	URL      string      `json:"url"`
	Name     string      `json:"name"`
	Hero     string      `json:"hero"` // identity code, any alias
	HeroName string      `json:"heroName"`
	Cards    []DeckEntry `json:"cards"`
}

// Player is a seated participant.
type Player struct {
	Token string      `json:"token"`
	Name  string      `json:"name"`
	Color int         `json:"color"`
	Host  bool        `json:"host"`
	Deck  *DeckChoice `json:"deck,omitempty"`
}

// Spectator watches the game without acting.
type Spectator struct {
	Token string `json:"token"`
	Name  string `json:"name"`
}

// LobbyConfig is the scenario setup chosen by the host.
type LobbyConfig struct {
	Scenario   string          `json:"scenario"`
	Difficulty pack.Difficulty `json:"difficulty"`
	Standard   string          `json:"standard"`
	Expert     string          `json:"expert"`
	Modulars   []string        `json:"modulars"`
}

// SystemColor is the Color of log lines that no player wrote.
const SystemColor = -1

// LogEntry is one line of the game history.
type LogEntry struct {
	Who    string    `json:"who"`
	Color  int       `json:"color"` // SystemColor for system lines
	Text   string    `json:"text"`
	At     time.Time `json:"at"`
	Undone bool      `json:"undone,omitempty"`
	Cards  []string  `json:"cards,omitempty"`
}

// UndoEntry restores the table as it was before one action.
type UndoEntry struct {
	LogIndex int       `json:"logIndex"`
	Before   *Table    `json:"before"`
	Merge    string    `json:"merge"`
	At       time.Time `json:"at"`
	Shuffled []string  `json:"shuffled,omitempty"` // piles shuffled since Before, re-shuffled on undo
	// Cards are the cards the undone action touched, with their attachments:
	// undo puts them back as they were in Before (see keepLiveArrangement).
	Cards []string `json:"cards,omitempty"`
	// Reordered are the piles reordered by reorderTop since Before.
	Reordered []string `json:"reordered,omitempty"`
}

// Game is the whole state of one game.
type Game struct {
	ID         string                 `json:"id"`
	Phase      Phase                  `json:"phase"`
	CreatedAt  time.Time              `json:"createdAt"`
	Players    []*Player              `json:"players"` // arrival order
	Spectators []*Spectator           `json:"spectators"`
	Config     LobbyConfig            `json:"config"`
	Table      *Table                 `json:"table,omitempty"`
	Log        []LogEntry             `json:"log"`
	Undo       map[string][]UndoEntry `json:"undo,omitempty"` // by player token
}
