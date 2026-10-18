package server

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
