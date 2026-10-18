// Package game holds the pure state and rules-free actions of a Marvel
// Champions table. It performs no I/O and starts no goroutines.
package game

import "errors"

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
