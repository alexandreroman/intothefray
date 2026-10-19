package game

// A seat is one deck at the table. Seats are numbered across the players in
// arrival order, then across each player's deck slots in order: when Alex
// brings two decks and Sam one, seats 0 and 1 are Alex's and seat 2 is Sam's.
// Areas ("p<seat>"), table rows, hands and the Owner of cards and piles all
// count in seats.

// seatCount returns the number of seats: one per deck slot of every player.
func (g *Game) seatCount() int {
	count := 0
	for _, p := range g.Players {
		count += len(p.Decks)
	}
	return count
}

// seatsOf returns the seats of the player at index player, in order. It is
// empty for an unknown player.
func (g *Game) seatsOf(player int) []int {
	if player < 0 || player >= len(g.Players) {
		return nil
	}
	first := 0
	for _, p := range g.Players[:player] {
		first += len(p.Decks)
	}
	seats := make([]int, 0, len(g.Players[player].Decks))
	for slot := range g.Players[player].Decks {
		seats = append(seats, first+slot)
	}
	return seats
}

// seatPlayer returns the index of the player who holds seat, or -1 when no
// player does.
func (g *Game) seatPlayer(seat int) int {
	if seat < 0 {
		return -1
	}
	first := 0
	for i, p := range g.Players {
		if seat < first+len(p.Decks) {
			return i
		}
		first += len(p.Decks)
	}
	return -1
}

// homeSeat returns the first seat of the player at index player, or -1 for an
// unknown player. The player's private view lives in its area.
func (g *Game) homeSeat(player int) int {
	seats := g.seatsOf(player)
	if len(seats) == 0 {
		return -1
	}
	return seats[0]
}
