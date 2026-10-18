package game

import (
	"fmt"
	"time"

	"github.com/alexandreroman/intothefray/internal/pack"
)

// ReplaySetup is what Start needs to build a game again: the seated players,
// the scenario and the seed. With the recorded events, it reproduces the game
// exactly (see Replay), which turns any game into a test case.
type ReplaySetup struct {
	Players   []ReplayPlayer `json:"players"` // seat order; the first one hosts
	Config    LobbyConfig    `json:"config"`
	Seed      uint64         `json:"seed"`
	StartedAt time.Time      `json:"startedAt"`
}

// ReplayPlayer is a seated player of a ReplaySetup. Tokens are left out: they
// are secrets, and a replay does not need them.
type ReplayPlayer struct {
	Name  string     `json:"name"`
	Color int        `json:"color"`
	Deck  DeckChoice `json:"deck"`
}

// ReplaySetup returns the setup of a started game.
func (g *Game) ReplaySetup() (ReplaySetup, error) {
	if g.History == nil {
		return ReplaySetup{}, fmt.Errorf("%w: the game has not started", ErrPhase)
	}
	setup := ReplaySetup{Config: g.Config, Seed: g.History.Seed, StartedAt: g.History.StartedAt}
	for _, p := range g.Players {
		if p.Deck == nil {
			return ReplaySetup{}, fmt.Errorf("%w: %s has no deck", ErrInvalid, p.Name)
		}
		setup.Players = append(setup.Players, ReplayPlayer{Name: p.Name, Color: p.Color, Deck: *p.Deck})
	}
	return setup, nil
}

// Replay builds a game from scratch: it runs Start with setup, then performs
// each event again, undos included, with the sequence number and time it was
// recorded with. The result is the game that recorded the events, its table,
// log and history alike. Players get placeholder tokens.
func Replay(cat *pack.Catalog, setup ReplaySetup, events []Event) (*Game, error) {
	if err := checkReplayPlayers(setup.Players); err != nil {
		return nil, err
	}
	g := &Game{Phase: PhaseLobby, CreatedAt: setup.StartedAt, Config: setup.Config}
	for seat, rp := range setup.Players {
		deck := rp.Deck
		g.Players = append(g.Players, &Player{
			Token: fmt.Sprintf("replay-%d", seat),
			Name:  rp.Name,
			Color: rp.Color,
			Host:  seat == 0,
			Deck:  &deck,
		})
	}
	if err := g.Start(g.Players[0].Token, cat, setup.Seed, setup.StartedAt); err != nil {
		return nil, fmt.Errorf("replay setup: %w", err)
	}

	for i, e := range events {
		if e.Seat < 0 || e.Seat >= len(g.Players) {
			return nil, fmt.Errorf("%w: event %d is by unknown seat %d", ErrInvalid, i, e.Seat)
		}
		if e.Seq <= g.History.LastSeq {
			return nil, fmt.Errorf("%w: event %d has sequence number %d, after %d", ErrInvalid, i, e.Seq, g.History.LastSeq)
		}
		// Moves that replaced one another leave gaps in the numbering.
		g.History.LastSeq = e.Seq - 1
		if err := g.do(e.Seat, e.Action, cat, e.At); err != nil {
			return nil, fmt.Errorf("replay event %d (seq %d, %s): %w", i, e.Seq, e.Action.Kind, err)
		}
	}
	return g, nil
}

// checkReplayPlayers enforces what the lobby guarantees: one to maxPlayers
// players, each with their own colour in 0..maxPlayers-1.
func checkReplayPlayers(players []ReplayPlayer) error {
	if len(players) == 0 || len(players) > maxPlayers {
		return fmt.Errorf("%w: a replay needs 1 to %d players, not %d", ErrInvalid, maxPlayers, len(players))
	}
	taken := map[int]bool{}
	for _, p := range players {
		if p.Color < 0 || p.Color >= maxPlayers || taken[p.Color] {
			return fmt.Errorf("%w: %s has colour %d, which is out of range or taken", ErrInvalid, p.Name, p.Color)
		}
		taken[p.Color] = true
	}
	return nil
}
