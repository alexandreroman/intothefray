package game

// Kind names a type of action a player can perform at the table.
type Kind string

// Action kinds. They carry the Act prefix because the Kind* names are taken
// by PileKind.
const (
	ActMove    Kind = "move"
	ActAttach  Kind = "attach"
	ActToHand  Kind = "toHand"
	ActToDeck  Kind = "toDeck"
	ActDiscard Kind = "discard"
	ActToPile  Kind = "toPile"
	ActPlay    Kind = "play"

	ActExhaust     Kind = "exhaust"
	ActFlip        Kind = "flip"
	ActToken       Kind = "token"
	ActStatus      Kind = "status"
	ActChooseStage Kind = "chooseStage"

	ActDraw        Kind = "draw"
	ActReveal      Kind = "reveal"
	ActDeal        Kind = "deal"
	ActDiscardTop  Kind = "discardTop"
	ActShuffle     Kind = "shuffle"
	ActShuffleBack Kind = "shuffleBack"
	ActShuffleIn   Kind = "shuffleIn"
	ActReorderTop  Kind = "reorderTop"
	ActHandOrder   Kind = "handOrder"
	ActFirstPlayer Kind = "firstPlayer"
	ActArrowAdd    Kind = "arrowAdd"
	ActArrowClear  Kind = "arrowClear"
)

// Action is one resolved player action. Which fields matter depends on Kind;
// the others stay zero.
type Action struct {
	Kind   Kind     `json:"kind"`
	Card   string   `json:"card,omitempty"`
	Target string   `json:"target,omitempty"` // card id (attach, arrow) or pile id
	Pile   string   `json:"pile,omitempty"`
	Area   Area     `json:"area,omitempty"`
	X      int      `json:"x,omitempty"`
	Y      int      `json:"y,omitempty"`
	N      int      `json:"n,omitempty"`
	Name   string   `json:"name,omitempty"` // token or status name
	Delta  int      `json:"delta,omitempty"`
	Face   int      `json:"face,omitempty"`
	Where  string   `json:"where,omitempty"` // "top" | "bottom" | "shuffle"
	Stage  string   `json:"stage,omitempty"`
	Cards  []string `json:"cards,omitempty"` // resolved: drawn/dealt ids, new orders
	Seat   int      `json:"seat,omitempty"`  // acting seat, filled server-side (arrows)
}
