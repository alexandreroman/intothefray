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
	Players   []ReplayPlayer `json:"players"` // arrival order; the first one hosts
	Config    LobbyConfig    `json:"config"`
	Seed      uint64         `json:"seed"`
	StartedAt time.Time      `json:"startedAt"`
}

// ReplayPlayer is a seated player of a ReplaySetup, with their decks in slot
// order. Tokens are left out: they are secrets, and a replay does not need
// them.
type ReplayPlayer struct {
	Name  string       `json:"name"`
	Color int          `json:"color"`
	Decks []DeckChoice `json:"decks"`
}

// ReplaySetup returns the setup of a started game.
func (g *Game) ReplaySetup() (ReplaySetup, error) {
	if g.History == nil {
		return ReplaySetup{}, fmt.Errorf("%w: the game has not started", ErrPhase)
	}
	setup := ReplaySetup{Config: g.Config, Seed: g.History.Seed, StartedAt: g.History.StartedAt}
	for _, p := range g.Players {
		rp := ReplayPlayer{Name: p.Name, Color: p.Color}
		for _, deck := range p.Decks {
			if deck == nil {
				return ReplaySetup{}, invalid("%s is missing a deck", p.Name)
			}
			rp.Decks = append(rp.Decks, *deck)
		}
		setup.Players = append(setup.Players, rp)
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
	for i, rp := range setup.Players {
		p := &Player{Token: fmt.Sprintf("replay-%d", i), Name: rp.Name, Color: rp.Color, Host: i == 0}
		for _, deck := range rp.Decks {
			p.Decks = append(p.Decks, &deck)
		}
		g.Players = append(g.Players, p)
	}
	if err := g.Start(g.Players[0].Token, cat, setup.Seed, setup.StartedAt); err != nil {
		return nil, fmt.Errorf("replay setup: %w", err)
	}

	for i, e := range events {
		if e.Seat < 0 || e.Seat >= g.seatCount() {
			return nil, invalid("event %d is by unknown seat %d", i, e.Seat)
		}
		if e.Seq <= g.History.LastSeq {
			return nil, invalid("event %d has sequence number %d, after %d", i, e.Seq, g.History.LastSeq)
		}
		// Moves that replaced one another leave gaps in the numbering.
		g.History.LastSeq = e.Seq - 1
		if err := g.do(g.actorOf(e.Seat), e.Action, cat, e.At); err != nil {
			return nil, fmt.Errorf("replay event %d (seq %d, %s): %w", i, e.Seq, e.Action.Kind, err)
		}
	}
	return g, nil
}

// checkReplayPlayers enforces what the lobby guarantees: one to maxSeats
// players, each with their own colour in 0..maxSeats-1 and at least one deck,
// and maxSeats decks at most in all.
func checkReplayPlayers(players []ReplayPlayer) error {
	if len(players) == 0 || len(players) > maxSeats {
		return invalid("a replay needs 1 to %d players, not %d", maxSeats, len(players))
	}
	taken := map[int]bool{}
	decks := 0
	for _, p := range players {
		if p.Color < 0 || p.Color >= maxSeats || taken[p.Color] {
			return invalid("%s has colour %d, which is out of range or taken", p.Name, p.Color)
		}
		taken[p.Color] = true
		if len(p.Decks) == 0 {
			return invalid("%s has no deck", p.Name)
		}
		decks += len(p.Decks)
	}
	if decks > maxSeats {
		return invalid("a replay holds %d decks, more than %d", decks, maxSeats)
	}
	return nil
}
