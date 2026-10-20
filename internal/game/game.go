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
	URL       string      `json:"url"`
	Name      string      `json:"name"`
	Hero      string      `json:"hero"` // identity code, any alias
	HeroName  string      `json:"heroName"`
	HeroImage string      `json:"heroImage,omitempty"` // hero face image, set by SetDeck from the catalog
	Cards     []DeckEntry `json:"cards"`
}

// Player is a seated participant. A player brings 1 to maxSeats decks, one
// per slot; each slot takes a seat at the table (see seatsOf). A nil slot is a
// deck not loaded yet.
type Player struct {
	Token string        `json:"token"`
	Name  string        `json:"name"`
	Color int           `json:"color"`
	Host  bool          `json:"host"`
	Decks []*DeckChoice `json:"decks"`
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
	Standard   string          `json:"standard"` // empty: no Standard set
	Expert     string          `json:"expert"`   // empty: no Expert set
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
	// Parts spell Text, with the card names flagged, when the line names a
	// card; they are nil otherwise.
	Parts []LogPart `json:"parts,omitempty"`
}

// LogPart is a piece of a history line: plain text, or the printed name of a
// card. Only the narrator flags card names, so text a player typed, such as
// their name, never passes for one. A card name refers to the face it names,
// so a client can show that name in the viewer's language; Text stays the
// English name.
type LogPart struct {
	Text string        `json:"text"`
	Card bool          `json:"card,omitempty"`
	Ref  *pack.FaceRef `json:"ref,omitempty"`
}

// phrase returns the line in parts, a single plain part when it names no
// card.
func (e LogEntry) phrase() phrase {
	if e.Parts != nil {
		return e.Parts
	}
	return words(e.Text)
}

// Game is the whole state of one game.
type Game struct {
	ID         string       `json:"id"`
	Phase      Phase        `json:"phase"`
	CreatedAt  time.Time    `json:"createdAt"`
	Players    []*Player    `json:"players"` // arrival order
	Spectators []*Spectator `json:"spectators"`
	Config     LobbyConfig  `json:"config"`
	Table      *Table       `json:"table,omitempty"` // the live table
	Log        []LogEntry   `json:"log"`
	History    *History     `json:"history,omitempty"` // set at start; never shown to viewers
}
